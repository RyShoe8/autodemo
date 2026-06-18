"use client";

import { usePolling } from "@/hooks/use-polling";
import { api } from "@/lib/api-client";
import type { AssetSummary } from "@/types";

export function useAssets(
  scope: { projectId?: string; videoId?: string },
  options?: { intervalMs?: number },
) {
  const query = scope.videoId
    ? `videoId=${encodeURIComponent(scope.videoId)}`
    : `projectId=${encodeURIComponent(scope.projectId ?? "")}`;

  const { data, error, loading, refetch } = usePolling<{
    assets: AssetSummary[];
  }>(() => api.get(`/api/assets?${query}`), {
    intervalMs: options?.intervalMs ?? 5000,
  });

  return {
    assets: data?.assets ?? [],
    error,
    loading,
    refetch,
  };
}
