import type { JobStatus } from "@/types";

export const CANCELLED_BY_USER = "Cancelled by user";

export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "queued",
  "discovering",
  "building_workflow",
  "recording",
  "generating_script",
  "generating_audio",
  "rendering",
  "exporting",
];

export function isActiveJobStatus(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "completed" || status === "failed";
}
