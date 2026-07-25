"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

/**
 * Live view of a browser running on the worker, so the user can sign in to
 * their own application by hand — including MFA, SSO, and CAPTCHA steps that
 * a headless browser cannot complete. Keystrokes are relayed to the target
 * app's own login form; AutoDemo only keeps the resulting session.
 */

interface StartResponse {
  sessionId: string;
  websocketUrl: string;
  expiresAt: string;
  startUrl: string;
}

type Phase = "idle" | "starting" | "live" | "captured" | "error";

export function ConnectAppDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const viewportRef = useRef({ width: 1280, height: 800 });

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  /** Map a pointer event on the canvas to page coordinates. */
  const toPageCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = viewportRef.current.width / rect.width;
      const scaleY = viewportRef.current.height / rect.height;
      return {
        x: Math.round((e.clientX - rect.left) * scaleX),
        y: Math.round((e.clientY - rect.top) * scaleY),
      };
    },
    [],
  );

  const sendMessage = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  const start = useCallback(async () => {
    setPhase("starting");
    setMessage("Starting a browser on the server…");
    try {
      const res = await api.post<StartResponse>(
        `/api/projects/${projectId}/connect`,
        {},
      );

      const socket = new WebSocket(res.websocketUrl);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data as string);
        switch (data.type) {
          case "ready":
            viewportRef.current = data.viewport;
            setCurrentUrl(data.url);
            setPhase("live");
            setMessage("");
            break;
          case "frame": {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const img = new Image();
            img.onload = () => {
              canvas.width = data.metadata.width || viewportRef.current.width;
              canvas.height = data.metadata.height || viewportRef.current.height;
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = `data:image/jpeg;base64,${data.data}`;
            break;
          }
          case "url":
            setCurrentUrl(data.url);
            break;
          case "captured":
            setPhase("captured");
            setSaving(false);
            toast.success("Session saved — you're connected");
            closeSocket();
            router.refresh();
            break;
          case "error":
            setSaving(false);
            toast.error(data.message ?? "Remote login error");
            break;
        }
      };

      socket.onerror = () => {
        setPhase("error");
        setMessage("Lost the connection to the remote browser.");
      };
      socket.onclose = () => {
        setPhase((p) => (p === "captured" ? p : "error"));
        setMessage((m) => m || "The remote browser session ended.");
      };
    } catch (err) {
      setPhase("error");
      setMessage(
        err instanceof Error ? err.message : "Could not start remote login",
      );
    }
  }, [projectId, closeSocket, router]);

  // Keyboard is captured while the session is live.
  useEffect(() => {
    if (phase !== "live") return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        sendMessage({ type: "text", text: e.key });
      } else {
        sendMessage({ type: "key", event: "down", key: e.key });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      if (!(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        sendMessage({ type: "key", event: "up", key: e.key });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, sendMessage]);

  // Tear the session down whenever the dialog closes.
  useEffect(() => {
    if (open) {
      if (phase === "idle") void start();
      return;
    }
    if (socketRef.current) {
      sendMessage({ type: "cancel" });
      closeSocket();
    }
    setPhase("idle");
    setMessage("");
    setCurrentUrl("");
  }, [open, phase, start, sendMessage, closeSocket]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Connect your application</DialogTitle>
          <DialogDescription>
            Sign in below exactly as you normally would — including any
            two-factor, SSO, or “I’m not a robot” steps. AutoDemo saves only the
            resulting session, never your password.
          </DialogDescription>
        </DialogHeader>

        {phase === "live" && currentUrl && (
          <p className="truncate rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
            {currentUrl}
          </p>
        )}

        <div className="relative overflow-hidden rounded-md border bg-muted/30">
          <canvas
            ref={canvasRef}
            className="block w-full cursor-pointer"
            onClick={(e) => sendMessage({ type: "click", ...toPageCoords(e) })}
            onWheel={(e) =>
              sendMessage({
                type: "scroll",
                ...toPageCoords(e as unknown as React.MouseEvent<HTMLCanvasElement>),
                deltaY: e.deltaY,
              })
            }
          />
          {phase !== "live" && (
            <div className="absolute inset-0 flex min-h-[300px] flex-col items-center justify-center gap-3 bg-background/80 p-6 text-center">
              {phase === "starting" && (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{message}</p>
                </>
              )}
              {phase === "captured" && (
                <>
                  <ShieldCheck className="h-8 w-8 text-primary" />
                  <p className="text-sm font-medium">Session saved</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Discovery and recording will now reuse this session instead
                    of logging in.
                  </p>
                </>
              )}
              {phase === "error" && (
                <>
                  <p className="text-sm text-destructive">{message}</p>
                  <Button variant="outline" onClick={() => void start()}>
                    Try again
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => {
              sendMessage({ type: "cancel" });
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={phase !== "live" || saving}
            onClick={() => {
              setSaving(true);
              sendMessage({ type: "capture" });
            }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            I&apos;m signed in — save session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
