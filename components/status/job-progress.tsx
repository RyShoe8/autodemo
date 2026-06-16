import { Progress } from "@/components/ui/progress";
import { JobStatusBadge } from "@/components/status/status-badge";
import { JOB_STATUS_LABELS, type JobDTO } from "@/types";

export function JobProgress({ job }: { job: JobDTO }) {
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
    </div>
  );
}
