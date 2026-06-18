"use client";

import { useState } from "react";
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
  const [busy, setBusy] = useState(false);

  const jobStatus = job?.status;
  const isActive = jobStatus ? ACTIVE_STATUSES.includes(jobStatus) : false;
  const canDiscover =
    !isActive &&
    (status === "draft" ||
      status === "ready" ||
      status === "failed" ||
      status === "completed" ||
      status === "awaiting_approval");

  async function startDiscover() {
    setBusy(true);
    try {
      await api.post("/api/generate", { projectId, type: "discover" });
      toast.success("Discovery started");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start discovery");
      setBusy(false);
    }
  }

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
            {busy || (isActive && job?.type === "discover") ? (
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

        {job && (job.type === "discover" || job.type === "render_bumper") && (
          <>
            <JobProgress job={job} />
            {!isTerminal && <JobLogs logs={job.logs} />}
            <MissingCredentials items={job.missingCredentials} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
