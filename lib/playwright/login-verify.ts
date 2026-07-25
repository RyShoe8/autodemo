import type { Page } from "playwright";
import { storage } from "@/lib/storage";
import type { Reporter } from "@/lib/workflow/context";

/**
 * Network-truth login verification.
 *
 * DOM heuristics ("is there still a Login link?") are ambiguous and break per
 * app. The network is not: submitting credentials produces a request to an
 * auth endpoint whose status code says what actually happened. This watcher
 * records auth-endpoint responses around the submit and yields a verdict that
 * takes precedence over DOM heuristics; it also keeps a rolling log of
 * requests + console messages for failure evidence dumps.
 */

const AUTH_ENDPOINT_PATTERN =
  /log-?in|sign-?in|auth|session|token|credential|account\/login/i;

export type LoginNetworkVerdict = "success" | "failure" | "unknown";

interface AuthResponse {
  url: string;
  method: string;
  status: number;
  at: number;
}

export interface LoginNetworkWatcher {
  /** Verdict from auth-endpoint traffic observed since the watcher started. */
  verdict(): LoginNetworkVerdict;
  /** Human-readable summary of the deciding response, if any. */
  detail(): string;
  /** Full rolling activity log (network + console) for evidence dumps. */
  activityLog(): string;
  /** Reset observed auth responses (call right before a submit attempt). */
  markSubmit(): void;
  stop(): void;
}

export function watchLoginNetwork(page: Page, origin: string): LoginNetworkWatcher {
  const authResponses: AuthResponse[] = [];
  const activity: string[] = [];
  const started = Date.now();

  const push = (line: string) => {
    activity.push(`[+${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`);
    if (activity.length > 400) activity.splice(0, activity.length - 400);
  };

  const onResponse = (response: import("playwright").Response) => {
    try {
      const req = response.request();
      const url = response.url();
      const method = req.method();
      const status = response.status();
      const sameOrigin = url.startsWith(origin);
      push(`${method} ${url.slice(0, 160)} -> ${status}`);
      if (!sameOrigin) return;
      // Only mutating requests to auth-looking endpoints are login signals;
      // GET /login is just the form page loading.
      if (method === "GET") return;
      if (!AUTH_ENDPOINT_PATTERN.test(url)) return;
      authResponses.push({ url, method, status, at: Date.now() });
    } catch {
      /* never break the pipeline from a listener */
    }
  };

  const onConsole = (msg: import("playwright").ConsoleMessage) => {
    try {
      if (msg.type() === "error" || msg.type() === "warning") {
        push(`console.${msg.type()}: ${msg.text().slice(0, 200)}`);
      }
    } catch {
      /* ignore */
    }
  };

  page.on("response", onResponse);
  page.on("console", onConsole);

  const deciding = (): AuthResponse | null =>
    authResponses.length > 0 ? authResponses[authResponses.length - 1] : null;

  return {
    verdict() {
      const last = deciding();
      if (!last) return "unknown";
      if (last.status >= 200 && last.status < 400) return "success";
      if ([400, 401, 403, 422, 429].includes(last.status)) return "failure";
      return "unknown";
    },
    detail() {
      const last = deciding();
      if (!last) return "no auth-endpoint traffic observed";
      return `${last.method} ${last.url.slice(0, 120)} -> ${last.status}`;
    },
    activityLog() {
      return activity.join("\n");
    },
    markSubmit() {
      authResponses.length = 0;
      push("--- submit ---");
    },
    stop() {
      page.off("response", onResponse);
      page.off("console", onConsole);
    },
  };
}

/**
 * Save comprehensive login-failure evidence: screenshot, page HTML, and the
 * network/console activity log. Non-fatal on any error.
 */
export async function dumpLoginEvidence(
  page: Page,
  projectId: string,
  watcher: LoginNetworkWatcher | null,
  reporter: Reporter,
): Promise<void> {
  try {
    const buffer = await page.screenshot({ fullPage: false });
    await storage.save(
      `projects/${projectId}/discovery/login-attempt.png`,
      buffer,
      "image/png",
    );
  } catch {
    /* non-fatal */
  }
  try {
    const html = await page.content();
    await storage.save(
      `projects/${projectId}/discovery/login-attempt.html`,
      html.slice(0, 2_000_000),
      "text/html",
    );
  } catch {
    /* non-fatal */
  }
  try {
    if (watcher) {
      await storage.save(
        `projects/${projectId}/discovery/login-attempt-activity.txt`,
        `URL at failure: ${page.url()}\nNetwork verdict: ${watcher.verdict()} (${watcher.detail()})\n\n${watcher.activityLog()}`,
        "text/plain",
      );
    }
    await reporter.log(
      "Saved login evidence (login-attempt.png / .html / -activity.txt).",
    );
  } catch {
    /* non-fatal */
  }
}
