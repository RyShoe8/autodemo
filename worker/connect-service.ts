import http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { hashConnectToken } from "@/lib/connect/token";
import { launchChromium } from "@/lib/playwright/browser";
import { saveStoredSession } from "@/lib/playwright/session";
import type { ConnectSessionRecord } from "@/lib/db/types";

/**
 * Remote-login service.
 *
 * The customer's own application may be behind MFA, SSO, or an invisible
 * CAPTCHA that (correctly) refuses headless browsers. Rather than trying to
 * defeat that, this service opens a real browser on the worker and streams it
 * to the customer, who signs in themselves. We capture only the resulting
 * session state — the password is typed into the target app's own login form
 * and is never seen, stored, or logged by AutoDemo.
 *
 * Frames go out over a WebSocket via CDP screencast; mouse/keyboard events
 * come back and are replayed into the page. Nothing about the stream contents
 * or the input events is persisted.
 */

const log = createLogger("connect");

const VIEWPORT = { width: 1280, height: 800 };
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

interface LiveSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  socket: WebSocket;
  lastActivity: number;
  closed: boolean;
}

const liveSessions = new Map<string, LiveSession>();

/* -------------------------------------------------------------------------- */
/* Client → worker messages                                                    */
/* -------------------------------------------------------------------------- */

type ClientMessage =
  | { type: "mouse"; event: "move" | "down" | "up"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "click"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; deltaY: number }
  | { type: "key"; event: "down" | "up"; key: string }
  | { type: "text"; text: string }
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "capture" }
  | { type: "cancel" };

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as ClientMessage;
    return parsed && typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function send(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                           */
/* -------------------------------------------------------------------------- */

async function destroySession(
  session: LiveSession,
  status?: ConnectSessionRecord["status"],
  error?: string,
): Promise<void> {
  if (session.closed) return;
  session.closed = true;
  liveSessions.delete(session.id);

  try {
    await session.cdp.send("Page.stopScreencast").catch(() => {});
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
  } catch {
    /* best effort */
  }

  if (status) {
    await db
      .updateConnectSession(session.id, { status, ...(error ? { error } : {}) })
      .catch(() => {});
  }
  log.info(`Connect session ${session.id} closed (${status ?? "socket closed"}).`);
}

/** Capture the signed-in session state and seal it under the org's key. */
async function captureSession(
  session: LiveSession,
  record: ConnectSessionRecord,
): Promise<void> {
  const state = await session.context.storageState();
  if (state.cookies.length === 0 && state.origins.length === 0) {
    send(session.socket, {
      type: "error",
      message:
        "No session data found yet — finish signing in before saving.",
    });
    return;
  }

  const saved = await saveStoredSession(
    record.projectId,
    state,
    record.orgId,
  );
  if (!saved) {
    send(session.socket, {
      type: "error",
      message: "Session was too large to store.",
    });
    return;
  }

  await db.updateConnectSession(session.id, {
    status: "captured",
    capturedAt: new Date(),
  });
  await audit({
    orgId: record.orgId,
    userId: record.userId,
    action: "session.captured",
    targetType: "project",
    targetId: record.projectId,
    metadata: { cookies: state.cookies.length, via: "remote-login" },
  });

  send(session.socket, { type: "captured" });
  log.info(
    `Captured session for project ${record.projectId} (${state.cookies.length} cookies).`,
  );
  await destroySession(session);
}

/** Start a browser for a claimed connect session and stream it to the socket. */
async function startLiveSession(
  record: ConnectSessionRecord,
  socket: WebSocket,
): Promise<void> {
  const browser = await launchChromium();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  const session: LiveSession = {
    id: record.id,
    browser,
    context,
    page,
    cdp,
    socket,
    lastActivity: Date.now(),
    closed: false,
  };
  liveSessions.set(record.id, session);

  // Stream frames to the client.
  cdp.on("Page.screencastFrame", (frame) => {
    session.lastActivity = Date.now();
    send(socket, {
      type: "frame",
      data: frame.data,
      metadata: {
        width: frame.metadata.deviceWidth,
        height: frame.metadata.deviceHeight,
      },
    });
    cdp
      .send("Page.screencastFrameAck", { sessionId: frame.sessionId })
      .catch(() => {});
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      send(socket, { type: "url", url: page.url() });
    }
  });

  await page.goto(record.startUrl, { waitUntil: "load", timeout: 45000 }).catch(
    (err: unknown) => {
      send(socket, {
        type: "error",
        message: `Could not load ${record.startUrl}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    },
  );

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 60,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });

  send(socket, {
    type: "ready",
    viewport: VIEWPORT,
    url: page.url(),
    expiresAt: record.expiresAt,
  });

  socket.on("message", (raw) => {
    void handleClientMessage(session, record, String(raw));
  });
  socket.on("close", () => {
    void destroySession(session);
  });
  socket.on("error", () => {
    void destroySession(session);
  });
}

async function handleClientMessage(
  session: LiveSession,
  record: ConnectSessionRecord,
  raw: string,
): Promise<void> {
  const msg = parseClientMessage(raw);
  if (!msg || session.closed) return;
  session.lastActivity = Date.now();

  try {
    switch (msg.type) {
      case "mouse":
        if (msg.event === "move") {
          await session.page.mouse.move(msg.x, msg.y);
        } else if (msg.event === "down") {
          await session.page.mouse.down({ button: msg.button ?? "left" });
        } else {
          await session.page.mouse.up({ button: msg.button ?? "left" });
        }
        break;
      case "click":
        await session.page.mouse.click(msg.x, msg.y);
        break;
      case "scroll":
        await session.page.mouse.move(msg.x, msg.y);
        await session.page.mouse.wheel(0, msg.deltaY);
        break;
      case "key":
        if (msg.event === "down") {
          await session.page.keyboard.down(msg.key);
        } else {
          await session.page.keyboard.up(msg.key);
        }
        break;
      case "text":
        // Typed characters are forwarded straight to the target app's own
        // form. They are never logged or stored on this side.
        await session.page.keyboard.insertText(msg.text);
        break;
      case "navigate":
        await session.page
          .goto(msg.url, { waitUntil: "load", timeout: 45000 })
          .catch(() => {});
        break;
      case "back":
        await session.page.goBack({ timeout: 20000 }).catch(() => {});
        break;
      case "capture":
        await captureSession(session, record);
        break;
      case "cancel":
        await audit({
          orgId: record.orgId,
          userId: record.userId,
          action: "connect.cancelled",
          targetType: "project",
          targetId: record.projectId,
        });
        await destroySession(session, "cancelled");
        break;
    }
  } catch (err) {
    log.error(
      `Connect session ${session.id} input error`,
      err instanceof Error ? err.message : err,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP + WebSocket server                                                     */
/* -------------------------------------------------------------------------- */

async function authorizeUpgrade(
  url: URL,
): Promise<ConnectSessionRecord | null> {
  const token = url.searchParams.get("token");
  if (!token) return null;

  const record = await db.getConnectSessionByTokenHash(hashConnectToken(token));
  if (!record) return null;
  if (record.status !== "pending" && record.status !== "live") return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await db.updateConnectSession(record.id, { status: "expired" });
    return null;
  }
  if (liveSessions.has(record.id)) return null;
  return record;
}

/**
 * Start the worker's public HTTP service: a health endpoint plus the
 * /connect WebSocket used by the remote-login UI.
 */
export function startConnectService(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, live: liveSessions.size }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket: Duplex, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname !== "/connect") {
      socket.destroy();
      return;
    }

    void authorizeUpgrade(url)
      .then((record) => {
        if (!record) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          void db.updateConnectSession(record.id, { status: "live" });
          startLiveSession(record, ws).catch(async (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to start connect session ${record.id}`, message);
            send(ws, { type: "error", message });
            await db
              .updateConnectSession(record.id, {
                status: "failed",
                error: message,
              })
              .catch(() => {});
            ws.close();
          });
        });
      })
      .catch(() => socket.destroy());
  });

  // Reap idle and expired sessions.
  const reaper = setInterval(() => {
    const now = Date.now();
    for (const session of liveSessions.values()) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        void destroySession(session, "expired");
      }
    }
    void db.expireStaleConnectSessions().catch(() => {});
  }, 30_000);
  reaper.unref();

  server.listen(env.workerHttpPort, () => {
    log.info(
      `Remote-login service listening on port ${env.workerHttpPort} (ws /connect).`,
    );
  });

  return server;
}

/** Close every live browser — called on worker shutdown. */
export async function shutdownConnectSessions(): Promise<void> {
  await Promise.all(
    Array.from(liveSessions.values()).map((s) => destroySession(s, "expired")),
  );
}
