import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  ACTIVE_JOB_STATUSES,
  WORKER_INTERRUPTED,
} from "@/lib/workflow/job-status";

const log = createLogger("worker");

const IN_PROGRESS_STATUSES = ACTIVE_JOB_STATUSES.filter(
  (status) => status !== "queued",
);

/**
 * A freshly started worker cannot be running a job yet. Any in-progress job
 * in the database was orphaned by a prior crash, OOM, or deploy SIGTERM.
 */
export async function recoverOrphanedJobsOnStartup(): Promise<number> {
  const orphans = await db.listInProgressJobs();
  if (orphans.length === 0) return 0;

  const completedAt = new Date();
  const logLine = `[${completedAt.toISOString()}] ${WORKER_INTERRUPTED}.`;

  for (const job of orphans) {
    await db.updateJob(job.id, {
      status: "failed",
      error: WORKER_INTERRUPTED,
      completedAt,
    });
    await db.appendJobLog(job.id, logLine);

    if (job.videoId) {
      await db.updateVideo(job.videoId, { status: "failed" });
    } else {
      await db.updateProject(job.projectId, { status: "failed" });
    }

    log.warn(
      `Recovered orphaned job ${job.id} (${job.type}, was ${job.status}) for project ${job.projectId}`,
    );
  }

  log.info(
    `Marked ${orphans.length} orphaned in-progress job(s) as failed (${WORKER_INTERRUPTED}).`,
  );
  return orphans.length;
}
