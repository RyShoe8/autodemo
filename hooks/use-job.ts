"use client";

import { usePolling } from "@/hooks/use-polling";
import { api } from "@/lib/api-client";
import type { JobDTO } from "@/types";

const TERMINAL: JobDTO["status"][] = ["completed", "failed"];

/** Polls the latest job for a project. Slows polling once the job is terminal. */
export function useProjectJob(
  projectId: string,
  options?: { intervalMs?: number },
) {
  const { data, error, loading, refetch } = usePolling<{ job: JobDTO | null }>(
    () => api.get(`/api/jobs?projectId=${encodeURIComponent(projectId)}`),
    { intervalMs: options?.intervalMs ?? 2500 },
  );

  const job = data?.job ?? null;
  const isTerminal = job ? TERMINAL.includes(job.status) : false;

  return { job, error, loading, refetch, isTerminal };
}
