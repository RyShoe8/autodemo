"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ListChecks, Film, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/status/job-progress";
import { JobLogs } from "@/components/status/job-logs";
import { MissingCredentials } from "@/components/status/missing-credentials";
import { useProjectJob } from "@/hooks/use-job";
import { api } from "@/lib/api-client";

const ACTIVE_STATUSES = [
  "queued",
  "discovering",
  "building_workflow",
  "recording",
  "generating_script",
  "generating_audio",
  "rendering",
  "exporting",
];

export function GenerationPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { job, isTerminal } = useProjectJob(projectId);
  const [busy, setBusy] = useState(false);

  const status = job?.status;
  const isActive = status ? ACTIVE_STATUSES.includes(status) : false;
  const canRerunDiscovery =
    status === "awaiting_approval" ||
    status === "completed" ||
    status === "failed";

  async function start(type: "discover" | "produce") {
    setBusy(true);
    try {
      await api.post("/api/generate", { projectId, type });
      toast.success(
        type === "discover" ? "Discovery started" : "Recording started",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generation</CardTitle>
        <CardDescription>
          Live status of the AutoDemo pipeline for this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!job && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              No runs yet. Start by discovering the application&apos;s workflows.
            </p>
            <Button onClick={() => start("discover")} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Start discovery
            </Button>
          </div>
        )}

        {job && (
          <>
            <JobProgress job={job} />

            {status === "failed" && job.error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {job.error}
              </p>
            )}

            {(isTerminal || status === "awaiting_approval") && (
              <MissingCredentials items={job.missingCredentials} />
            )}

            <div className="flex flex-wrap gap-2">
              {status === "awaiting_approval" && (
                <Button asChild>
                  <Link href={`/projects/${projectId}/workflow`}>
                    <ListChecks className="h-4 w-4" /> Review &amp; approve workflow
                  </Link>
                </Button>
              )}

              {status === "completed" && (
                <Button asChild>
                  <Link href={`/projects/${projectId}/assets`}>
                    <Film className="h-4 w-4" /> View assets
                  </Link>
                </Button>
              )}

              {canRerunDiscovery && (
                <Button
                  variant="outline"
                  onClick={() => start("discover")}
                  disabled={busy || isActive}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Re-run discovery
                </Button>
              )}
            </div>

            {status === "awaiting_approval" && (
              <p className="text-sm text-muted-foreground">
                Not happy with the proposed workflow? Re-run discovery to crawl
                the app again.
              </p>
            )}

            {(isActive || job.logs.length > 0) && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Activity log</p>
                <JobLogs logs={job.logs} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
