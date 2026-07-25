"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, MonitorSmartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConnectAppDialog } from "@/components/projects/connect-app-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { ProjectDTO } from "@/types";

/**
 * Import/clear a captured browser session for a project. This is the manual
 * path for apps behind MFA / SSO / CAPTCHA: the user logs in once locally via
 * scripts/capture-session.mjs and pastes the resulting storage-state JSON.
 */
export function SessionImportCard({ project }: { project: ProjectDTO }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function importSession() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      toast.error("That is not valid JSON — paste the whole storage-state.json file.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/projects/${project.id}/session`, parsed);
      toast.success("Browser session imported");
      setValue("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearSession() {
    setBusy(true);
    try {
      await api.del(`/api/projects/${project.id}/session`);
      toast.success("Stored session cleared");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Browser session
          </CardTitle>
          <CardDescription>
            Sign in to your application once, in a browser we drive for you.
            AutoDemo reuses that session for discovery and recording, so it
            works with two-factor, SSO, and CAPTCHA-protected logins. Your
            password is typed into your own app and is never stored here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {project.hasStoredSession ? (
              <>
                Connected
                {project.storageStateSavedAt
                  ? ` — session saved ${new Date(project.storageStateSavedAt).toLocaleString()}`
                  : ""}
                . Reconnect whenever it expires.
              </>
            ) : (
              "Not connected yet."
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setConnectOpen(true)} disabled={busy}>
              <MonitorSmartphone className="h-4 w-4" />
              {project.hasStoredSession ? "Reconnect app" : "Connect app"}
            </Button>
            {project.hasStoredSession && (
              <Button
                variant="outline"
                onClick={() => void clearSession()}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>

          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              {showAdvanced ? "Hide" : "Show"} advanced: import a session file
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Capture a session on your own machine with{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    npm run capture-session -- {project.url}
                  </code>{" "}
                  and paste the resulting{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    storage-state.json
                  </code>{" "}
                  here. Stored encrypted; never displayed.
                </p>
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder='{"cookies": [...], "origins": [...]}'
                  rows={4}
                  spellCheck={false}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void importSession()}
                  disabled={busy || value.trim().length === 0}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Import session file
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ConnectAppDialog
        projectId={project.id}
        open={connectOpen}
        onOpenChange={setConnectOpen}
      />
    </>
  );
}
