"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ListChecks, Film, RefreshCw, XCircle } from "lucide-react";
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
import { useVideoJob } from "@/hooks/use-job";
import { api } from "@/lib/api-client";
import { ACTIVE_JOB_STATUSES } from "@/lib/workflow/job-status";
import type { JobStatus, VideoStatus } from "@/types";

const ACTIVE_STATUSES: JobStatus[] = ACTIVE_JOB_STATUSES.filter(
  (s) => s !== "discovering",
);

export function VideoGenerationPanel({
  projectId,
  videoId,
  status,
}: {
  projectId: string;
  videoId: string;
  status: VideoStatus;
}) {
  const router = useRouter();
  const { job, isTerminal } = useVideoJob(videoId);
  const notifiedJobRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pipelineJob =
    job?.type === "build_workflow" || job?.type === "produce" ? job : null;
  const jobStatus = pipelineJob?.status;
  const isActive = jobStatus ? ACTIVE_STATUSES.includes(jobStatus) : false;
  const jobFailed = pipelineJob?.status === "failed";
  const canProduce =
    !isActive &&
    !busy &&
    (jobFailed ||
      status === "awaiting_approval" ||
      status === "completed" ||
      status === "failed");

  useEffect(() => {
    if (!pipelineJob || !isTerminal) return;
    if (notifiedJobRef.current === pipelineJob.id) return;
    notifiedJobRef.current = pipelineJob.id;
    setBusy(false);
    router.refresh();
  }, [pipelineJob, isTerminal, router]);

  async function startProduce() {
    setBusy(true);
    try {
      await api.post("/api/generate", {
        projectId,
        videoId,
        type: "produce",
      });
      toast.success("Recording started");
      router.refresh();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Could not start recording");
    }
  }

  async function cancelJob() {
    if (!pipelineJob) return;
    setBusy(true);
    try {
      await api.post(`/api/jobs/${pipelineJob.id}/cancel`);
      toast.success("Job cancelled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel job");
    } finally {
      setBusy(false);
    }
  }

  const showLogs =
    pipelineJob &&
    (isActive ||
      pipelineJob.status === "failed" ||
      pipelineJob.logs.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produce video</CardTitle>
        <CardDescription>
          Record the workflow, render the body master, and export platform
          files. The project bumper is prepended at export time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/videos/${videoId}/workflow`}>
              <ListChecks className="h-4 w-4" /> Workflow
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/videos/${videoId}/assets`}>
              <Film className="h-4 w-4" /> Assets
            </Link>
          </Button>
          {status === "awaiting_approval" && (
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/videos/${videoId}/workflow`}>
                Approve in workflow
              </Link>
            </Button>
          )}
          {canProduce && status !== "awaiting_approval" && (
            <Button onClick={() => void startProduce()} disabled={busy || isActive}>
              {busy || isActive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {jobFailed ? "Retry produce" : "Re-produce"}
            </Button>
          )}
          {isActive && pipelineJob && (
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => void cancelJob()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Cancel
            </Button>
          )}
        </div>

        {pipelineJob && (
          <>
            <JobProgress job={pipelineJob} />

            {isActive && (
              <p className="text-sm text-muted-foreground">
                Rendering can take several minutes. Progress updates appear in
                the activity log.
              </p>
            )}

            {pipelineJob.status === "failed" && pipelineJob.error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {pipelineJob.error}
              </p>
            )}

            {pipelineJob.status === "completed" &&
              pipelineJob.missingCredentials.length > 0 && (
                <MissingCredentials items={pipelineJob.missingCredentials} />
              )}

            {showLogs && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Activity log</p>
                <JobLogs logs={pipelineJob.logs} />
              </div>
            )}
          </>
        )}

        {status === "awaiting_approval" && !isActive && (
          <p className="text-sm text-muted-foreground">
            Review and approve the workflow before recording.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
