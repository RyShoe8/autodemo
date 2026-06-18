import type {
  AssetRecord,
  JobRecord,
  ProjectRecord,
  ProjectVideoRecord,
} from "@/lib/db/types";
import type { AssetSummary, JobDTO, ProjectDTO, ProjectVideoDTO } from "@/types";

export function toProjectDTO(record: ProjectRecord): ProjectDTO {
  return {
    id: record.id,
    name: record.name,
    url: record.url,
    loginEmail: record.loginEmail,
    status: record.status,
    logoUrl: record.logoUrl,
    brandColor: record.brandColor ?? "#38bdf8",
    bumperEnabled: record.bumperEnabled !== false,
    bumperDurationSeconds: record.bumperDurationSeconds ?? 4,
    bumperUrl: record.bumperUrl,
    bumperTitle: record.bumperTitle ?? record.name,
    bumperTagline: record.bumperTagline,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}

export function toProjectVideoDTO(record: ProjectVideoRecord): ProjectVideoDTO {
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    prompt: record.prompt,
    voiceOption: record.voiceOption,
    platforms: record.platforms,
    workflow: record.workflow ?? [],
    status: record.status,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

export function toJobDTO(record: JobRecord): JobDTO {
  return {
    id: record.id,
    projectId: record.projectId,
    videoId: record.videoId,
    type: record.type,
    status: record.status,
    progress: record.progress,
    logs: record.logs ?? [],
    missingCredentials: record.missingCredentials ?? [],
    error: record.error,
    startedAt: record.startedAt
      ? new Date(record.startedAt).toISOString()
      : undefined,
    completedAt: record.completedAt
      ? new Date(record.completedAt).toISOString()
      : undefined,
  };
}

export function toAssetDTO(record: AssetRecord): AssetSummary {
  return {
    id: record.id,
    projectId: record.projectId,
    videoId: record.videoId,
    platform: record.platform,
    videoUrl: record.videoUrl,
    audioUrl: record.audioUrl,
    thumbnailUrl: record.thumbnailUrl,
    captionUrl: record.captionUrl,
    script: record.script,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}
