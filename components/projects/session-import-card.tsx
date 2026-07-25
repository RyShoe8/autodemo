"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Browser session
        </CardTitle>
        <CardDescription>
          For apps behind MFA, SSO, or CAPTCHA: log in once on your machine with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            node scripts/capture-session.mjs {project.url}
          </code>{" "}
          and paste the resulting <code className="rounded bg-muted px-1 py-0.5 text-xs">storage-state.json</code> here.
          The worker reuses it instead of logging in. Stored encrypted; never displayed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {project.hasStoredSession ? (
            <>
              A session is stored
              {project.storageStateSavedAt
                ? ` (saved ${new Date(project.storageStateSavedAt).toLocaleString()})`
                : ""}
              . Successful automated logins refresh it automatically.
            </>
          ) : (
            "No session stored yet. The pipeline also saves one automatically after any successful automated login."
          )}
        </p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='{"cookies": [...], "origins": [...]}'
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => void importSession()}
            disabled={busy || value.trim().length === 0}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Import session
          </Button>
          {project.hasStoredSession && (
            <Button
              variant="outline"
              onClick={() => void clearSession()}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Clear stored session
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
