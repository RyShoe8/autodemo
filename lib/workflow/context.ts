import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { JobStatus, ProjectStatus } from "@/types";

const log = createLogger("pipeline");

/**
 * Reporter passed into pipeline services so they can stream progress/log lines
 * back to the Job document and record any missing credentials/keys.
 */
export interface Reporter {
  log(line: string): Promise<void>;
  missing(name: string): Promise<void>;
}

export class PipelineContext implements Reporter {
  readonly jobId: string;
  readonly projectId: string;
  private missingSet = new Set<string>();

  constructor(jobId: string, projectId: string) {
    this.jobId = jobId;
    this.projectId = projectId;
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

  async setProgress(progress: number): Promise<void> {
    await db.updateJob(this.jobId, {
      progress: Math.max(0, Math.min(100, Math.round(progress))),
    });
  }

  async setStatus(
    jobStatus: JobStatus,
    projectStatus?: ProjectStatus,
    progress?: number,
  ): Promise<void> {
    await db.updateJob(this.jobId, {
      status: jobStatus,
      ...(progress !== undefined
        ? { progress: Math.max(0, Math.min(100, Math.round(progress))) }
        : {}),
    });
    if (projectStatus) {
      await db.updateProject(this.projectId, { status: projectStatus });
    }
  }
}
