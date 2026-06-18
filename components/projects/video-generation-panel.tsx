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
import { useVideoJob } from "@/hooks/use-job";
import { api } from "@/lib/api-client";
import type { VideoStatus } from "@/types";

const ACTIVE_STATUSES = [
  "queued",
  "building_workflow",
  "recording",
  "generating_script",
  "generating_audio",
  "rendering",
  "exporting",
];

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
  const [busy, setBusy] = useState(false);

  const jobStatus = job?.status;
  const isActive = jobStatus ? ACTIVE_STATUSES.includes(jobStatus) : false;
  const canProduce =
    !isActive &&
    (status === "awaiting_approval" ||
      status === "completed" ||
      status === "failed");

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
      toast.error(err instanceof Error ? err.message : "Could not start recording");
      setBusy(false);
    }
  }

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
            <Button onClick={() => void startProduce()} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-produce
            </Button>
          )}
        </div>

        {job && (job.type === "build_workflow" || job.type === "produce") && (
          <>
            <JobProgress job={job} />
            {!isTerminal && <JobLogs logs={job.logs} />}
            <MissingCredentials items={job.missingCredentials} />
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
