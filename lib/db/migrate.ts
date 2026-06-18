import type { DbBackend, ProjectRecord, ProjectVideoRecord } from "@/lib/db/types";
import type { ProjectStatus, VideoStatus } from "@/types";

function mapLegacyVideoStatus(projectStatus: ProjectStatus): VideoStatus {
  switch (projectStatus) {
    case "awaiting_approval":
      return "awaiting_approval";
    case "recording":
      return "recording";
    case "rendering":
      return "rendering";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "draft";
  }
}

function mapLegacyProjectStatus(projectStatus: ProjectStatus): ProjectStatus {
  if (
    projectStatus === "awaiting_approval" ||
    projectStatus === "recording" ||
    projectStatus === "rendering" ||
    projectStatus === "completed"
  ) {
    return "ready";
  }
  return projectStatus;
}

/** One-time migration from single-video-per-project to ProjectVideo records. */
export async function migrateLegacyData(backend: DbBackend): Promise<void> {
  const projects = await backend.listProjects();

  for (const project of projects) {
    const existing = await backend.listVideosByProject(project.id);
    if (existing.length === 0) {
      const hasLegacyData =
        (project.workflow?.length ?? 0) > 0 ||
        Boolean(project.prompt) ||
        project.status !== "draft";

      if (hasLegacyData) {
        await backend.createVideo({
          projectId: project.id,
          name: "Default demo",
          prompt: project.prompt ?? "",
          voiceOption: project.voiceOption ?? "openai_tts",
          platforms: project.platforms ?? ["youtube"],
          workflow: project.workflow ?? [],
          status: mapLegacyVideoStatus(project.status),
        });
      }

      const assets = await backend.listAssetsByProject(project.id);
      const videos = await backend.listVideosByProject(project.id);
      const defaultVideo = videos[0];
      if (defaultVideo) {
        for (const asset of assets) {
          if (!asset.videoId) {
            await backend.updateAsset(asset.id, { videoId: defaultVideo.id });
          }
        }
      }
    }

    const patch: Partial<ProjectRecord> = {};
    if (!project.bumperTitle) {
      patch.bumperTitle = project.name;
    }
    if (
      project.applicationMap &&
      (project.status === "completed" ||
        project.status === "awaiting_approval" ||
        project.status === "recording" ||
        project.status === "rendering")
    ) {
      patch.status = "ready";
    } else if (
      project.status !== "draft" &&
      project.status !== "discovering" &&
      project.status !== "ready" &&
      project.status !== "failed"
    ) {
      patch.status = mapLegacyProjectStatus(project.status);
    }
    if (Object.keys(patch).length > 0) {
      await backend.updateProject(project.id, patch);
    }
  }
}
