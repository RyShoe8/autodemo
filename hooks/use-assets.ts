"use client";

import { usePolling } from "@/hooks/use-polling";
import { api } from "@/lib/api-client";
import type { AssetSummary } from "@/types";

export function useAssets(projectId: string, options?: { intervalMs?: number }) {
  const { data, error, loading, refetch } = usePolling<{
    assets: AssetSummary[];
  }>(() => api.get(`/api/assets?projectId=${encodeURIComponent(projectId)}`), {
    intervalMs: options?.intervalMs ?? 5000,
  });

  return {
    assets: data?.assets ?? [],
    error,
    loading,
    refetch,
  };
}
