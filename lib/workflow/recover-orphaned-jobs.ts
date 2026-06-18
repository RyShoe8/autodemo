import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  WORKER_INTERRUPTED,
} from "@/lib/workflow/job-status";

const log = createLogger("worker");

export async function interruptJob(job: {
  id: string;
  type: string;
  status: string;
  projectId: string;
  videoId?: string;
}): Promise<void> {
  const completedAt = new Date();
  const logLine = `[${completedAt.toISOString()}] ${WORKER_INTERRUPTED}.`;

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
    `Interrupted job ${job.id} (${job.type}, was ${job.status}) for project ${job.projectId}`,
  );
}

/**
 * A freshly started worker cannot be running a job yet. Any in-progress job
 * in the database was orphaned by a prior crash, OOM, or deploy SIGTERM.
 */
export async function recoverOrphanedJobsOnStartup(): Promise<number> {
  const orphans = await db.listInProgressJobs();
  if (orphans.length === 0) return 0;

  for (const job of orphans) {
    await interruptJob(job);
  }

  log.info(
    `Marked ${orphans.length} orphaned in-progress job(s) as failed (${WORKER_INTERRUPTED}).`,
  );
  return orphans.length;
}
