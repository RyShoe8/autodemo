import type { DbBackend, ProjectRecord } from "@/lib/db/types";
import type { ProjectStatus, VideoStatus } from "@/types";
import { createTenantKey } from "@/lib/crypto/tenant-keys";
import { createLogger } from "@/lib/logger";

const log = createLogger("migrate");

const LEGACY_ORG_SLUG = "default";

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

/**
 * Adopt pre-tenancy projects into a default organization.
 *
 * Projects created before multi-tenancy have no orgId and would be invisible
 * (and unlistable) afterwards. They are moved into a "default" org that owns
 * them from then on. Their secrets stay readable because the legacy ciphertext
 * format is still accepted on decrypt; they are re-sealed under the org key
 * the next time they are written.
 */
async function adoptOrphanProjects(backend: DbBackend): Promise<string | null> {
  const orphans = await backend.listProjectsWithoutOrg();
  if (orphans.length === 0) return null;

  let org = await backend.getOrgBySlug(LEGACY_ORG_SLUG);
  if (!org) {
    const { wrappedDek, kekId, dekId } = await createTenantKey();
    org = await backend.createOrg({
      name: "Default",
      slug: LEGACY_ORG_SLUG,
      wrappedDek,
      kekId,
      dekId,
    });
    log.info(`Created default organization ${org.id} for legacy data.`);
  }

  for (const project of orphans) {
    await backend.updateProject(project.id, { orgId: org.id });
  }
  log.info(`Adopted ${orphans.length} pre-tenancy project(s) into "${org.slug}".`);
  return org.id;
}

/** One-time migrations: tenancy adoption, then single-video → ProjectVideo. */
export async function migrateLegacyData(backend: DbBackend): Promise<void> {
  await adoptOrphanProjects(backend);

  const projects: ProjectRecord[] = [];
  for (const org of await backend.listOrgs()) {
    projects.push(...(await backend.listProjects(org.id)));
  }

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
