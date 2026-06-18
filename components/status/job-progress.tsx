import { Progress } from "@/components/ui/progress";
import { JobStatusBadge } from "@/components/status/status-badge";
import { ACTIVE_JOB_STATUSES } from "@/lib/workflow/job-status";
import { JOB_STATUS_LABELS, type JobDTO } from "@/types";

const STALE_JOB_MS = 15 * 60 * 1000;

export function JobProgress({ job }: { job: JobDTO }) {
  const isActive = ACTIVE_JOB_STATUSES.includes(job.status);
  const updatedAt = job.updatedAt ? Date.parse(job.updatedAt) : NaN;
  const isStale =
    isActive &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt >= STALE_JOB_MS;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <JobStatusBadge status={job.status} />
        <span className="text-sm tabular-nums text-muted-foreground">
          {Math.round(job.progress)}%
        </span>
      </div>
      <Progress value={job.progress} />
      <p className="text-sm text-muted-foreground">
        {JOB_STATUS_LABELS[job.status]}
      </p>
      {isStale && (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          No updates in 15+ minutes. The worker may have restarted. Try Cancel,
          then Retry.
        </p>
      )}
    </div>
  );
}
