import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { CANCELLED_BY_USER } from "@/lib/workflow/job-status";
import type { JobStatus, ProjectStatus, VideoStatus } from "@/types";

const log = createLogger("pipeline");

export interface Reporter {
  log(line: string): Promise<void>;
  missing(name: string): Promise<void>;
}

export class PipelineContext implements Reporter {
  readonly jobId: string;
  readonly projectId: string;
  readonly videoId?: string;
  private missingSet = new Set<string>();

  constructor(jobId: string, projectId: string, videoId?: string) {
    this.jobId = jobId;
    this.projectId = projectId;
    this.videoId = videoId;
  }

  async log(line: string): Promise<void> {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    log.info(`job=${this.jobId} ${line}`);
    await db.appendJobLog(this.jobId, stamped);
  }

  async missing(name: string): Promise<void> {
    if (this.missingSet.has(name)) return;
    this.missingSet.add(name);
    await db.updateJob(this.jobId, {
      missingCredentials: Array.from(this.missingSet),
    });
    await this.log(`MISSING: ${name} — using deterministic mock fallback`);
  }

  get missingCredentials(): string[] {
    return Array.from(this.missingSet);
  }

  async throwIfCancelled(): Promise<void> {
    const job = await db.getJob(this.jobId);
    if (job?.status === "failed" && job.error === CANCELLED_BY_USER) {
      throw new Error(CANCELLED_BY_USER);
    }
  }

  async setProgress(progress: number): Promise<void> {
    await db.updateJob(this.jobId, {
      progress: Math.max(0, Math.min(100, Math.round(progress))),
    });
  }

  async setStatus(
    jobStatus: JobStatus,
    entityStatus?: ProjectStatus | VideoStatus,
    progress?: number,
  ): Promise<void> {
    await db.updateJob(this.jobId, {
      status: jobStatus,
      ...(progress !== undefined
        ? { progress: Math.max(0, Math.min(100, Math.round(progress))) }
        : {}),
    });
    if (entityStatus && this.videoId) {
      await db.updateVideo(this.videoId, {
        status: entityStatus as VideoStatus,
      });
    } else if (entityStatus) {
      await db.updateProject(this.projectId, {
        status: entityStatus as ProjectStatus,
      });
    }
  }
}
