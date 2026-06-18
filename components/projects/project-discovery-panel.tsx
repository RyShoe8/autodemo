"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
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
import type { ProjectStatus } from "@/types";

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

export function ProjectDiscoveryPanel({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const { job, isTerminal } = useProjectJob(projectId);
  const notifiedJobRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  const discoverJob = job?.type === "discover" ? job : null;
  const jobStatus = discoverJob?.status;
  const isActive = jobStatus ? ACTIVE_STATUSES.includes(jobStatus) : false;
  const canDiscover =
    !isActive &&
    !busy &&
    (status === "draft" ||
      status === "ready" ||
      status === "failed" ||
      status === "completed" ||
      status === "awaiting_approval");

  useEffect(() => {
    if (!discoverJob || !isTerminal) return;
    if (notifiedJobRef.current === discoverJob.id) return;
    notifiedJobRef.current = discoverJob.id;
    setBusy(false);

    if (discoverJob.status === "completed") {
      toast.success("Discovery complete");
    } else if (discoverJob.status === "failed") {
      toast.error(discoverJob.error ?? "Discovery failed");
    }
    router.refresh();
  }, [discoverJob, isTerminal, router]);

  async function startDiscover() {
    setBusy(true);
    try {
      await api.post("/api/generate", { projectId, type: "discover" });
      toast.success("Discovery started");
      router.refresh();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Could not start discovery");
    }
  }

  const showLogs =
    discoverJob &&
    (isActive || discoverJob.status === "failed" || discoverJob.logs.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application discovery</CardTitle>
        <CardDescription>
          Crawl the app once to build a map used by all demo videos on this
          project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void startDiscover()} disabled={busy || isActive || !canDiscover}>
            {busy || (isActive && discoverJob) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === "ready" ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {status === "ready" ? "Re-run discovery" : "Run discovery"}
          </Button>
          {status === "ready" && (
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/videos/new`}>New video</Link>
            </Button>
          )}
        </div>

        {discoverJob && (
          <>
            <JobProgress job={discoverJob} />

            {discoverJob.status === "failed" && discoverJob.error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {discoverJob.error}
              </p>
            )}

            {discoverJob.status === "completed" &&
              discoverJob.missingCredentials.length > 0 && (
                <MissingCredentials items={discoverJob.missingCredentials} />
              )}

            {showLogs && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Activity log</p>
                <JobLogs logs={discoverJob.logs} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
