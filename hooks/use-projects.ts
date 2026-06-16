"use client";

import { usePolling } from "@/hooks/use-polling";
import { api } from "@/lib/api-client";
import type { ProjectDTO } from "@/types";

export function useProjects(options?: { intervalMs?: number }) {
  const { data, error, loading, refetch } = usePolling<{
    projects: ProjectDTO[];
  }>(() => api.get("/api/projects"), {
    intervalMs: options?.intervalMs ?? 5000,
  });

  return {
    projects: data?.projects ?? [],
    error,
    loading,
    refetch,
  };
}
