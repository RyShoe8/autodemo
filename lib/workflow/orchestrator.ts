import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { storage } from "@/lib/storage";
import { PipelineContext } from "@/lib/workflow/context";
import { discoverApplication } from "@/lib/playwright/discovery";
import { executeWorkflow } from "@/lib/playwright/recording";
import { generateWorkflow } from "@/lib/openai/workflow";
import { generateScript, buildTemplateScript } from "@/lib/openai/script";
import { generateVoice } from "@/lib/video/voice";
import { generateCaptions } from "@/lib/video/captions";
import { generateThumbnail } from "@/lib/video/thumbnail";
import { resolveVideoToLocalFile } from "@/lib/video/media-resolve";
import { stageVideoInRemotionBundle } from "@/lib/video/remotion-assets";
import {
  buildBaseProps,
  ensureBundle,
  renderBumperToFile,
  renderToFile,
} from "@/lib/video/render";
import { exportPlatform } from "@/lib/ffmpeg/export";
import { enrichWorkflowSteps } from "@/lib/playwright/step-resolver";
import { createLogger } from "@/lib/logger";
import {
  PLATFORM_SPECS,
  exportVariantKey,
  exportVariantMaxSeconds,
  type Platform,
} from "@/types";
import type { JobRecord, ProjectRecord, ProjectVideoRecord } from "@/lib/db/types";

const log = createLogger("orchestrator");

export async function runJob(job: JobRecord): Promise<void> {
  const project = await db.getProject(job.projectId);
  if (!project) {
    await db.updateJob(job.id, {
      status: "failed",
      error: "Project no longer exists",
      completedAt: new Date(),
    });
    return;
  }

  const ctx = new PipelineContext(job.id, job.projectId, job.videoId);
  try {
    await ctx.log(`Starting ${job.type} job for "${project.name}".`);
    switch (job.type) {
      case "discover":
        await runDiscover(ctx, project);
        break;
      case "build_workflow": {
        if (!job.videoId) throw new Error("build_workflow requires videoId");
        const video = await db.getVideo(job.videoId);
        if (!video) throw new Error("Video no longer exists");
        await runBuildWorkflow(ctx, project, video);
        break;
      }
      case "render_bumper":
        await runRenderBumper(ctx, project);
        break;
      case "produce": {
        if (!job.videoId) throw new Error("produce requires videoId");
        const video = await db.getVideo(job.videoId);
        if (!video) throw new Error("Video no longer exists");
        await runProduce(ctx, project, video);
        break;
      }
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Job ${job.id} failed`, message);
    await ctx.log(`ERROR: ${message}`);
    await db.updateJob(job.id, {
      status: "failed",
      error: message,
      completedAt: new Date(),
    });
    if (job.videoId) {
      await db.updateVideo(job.videoId, { status: "failed" });
    } else if (job.type === "discover" || job.type === "render_bumper") {
      await db.updateProject(job.projectId, { status: "failed" });
    }
  }
}

async function runDiscover(ctx: PipelineContext, project: ProjectRecord) {
  await ctx.setStatus("discovering", "discovering", 5);
  const password = decrypt(project.encryptedPassword);

  const applicationMap = await discoverApplication({
    projectId: project.id,
    url: project.url,
    email: project.loginEmail,
    password,
    reporter: ctx,
    existingLogoUrl: project.logoUrl,
  });

  const { discoveredLogoUrl, ...mapForStorage } = applicationMap;
  await db.updateProject(project.id, {
    applicationMap: mapForStorage,
    status: "ready",
    ...(!project.logoUrl && discoveredLogoUrl
      ? { logoUrl: discoveredLogoUrl }
      : {}),
  });

  await ctx.log("Discovery complete — application map ready.");
  await ctx.setStatus("completed", "ready", 100);
  await db.updateJob(ctx.jobId, {
    completedAt: new Date(),
    missingCredentials: ctx.missingCredentials,
  });
}

async function runBuildWorkflow(
  ctx: PipelineContext,
  project: ProjectRecord,
  video: ProjectVideoRecord,
) {
  if (!project.applicationMap) {
    throw new Error("Run discovery on the project before building a workflow.");
  }

  await ctx.setStatus("building_workflow", "building_workflow", 10);
  const workflow = await generateWorkflow({
    prompt: video.prompt,
    applicationMap: project.applicationMap,
    reporter: ctx,
  });

  await db.updateVideo(video.id, {
    workflow,
    status: "awaiting_approval",
  });

  await ctx.log(`Workflow ready with ${workflow.length} steps — awaiting approval.`);
  await ctx.setStatus("awaiting_approval", "awaiting_approval", 100);
  await db.updateJob(ctx.jobId, {
    completedAt: new Date(),
    missingCredentials: ctx.missingCredentials,
  });
}

async function runRenderBumper(ctx: PipelineContext, project: ProjectRecord) {
  await ctx.setStatus("rendering", undefined, 10);

  const fresh = await db.getProject(project.id);
  if (!fresh) throw new Error("Project no longer exists");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autodemo-bumper-"));
  const outPath = path.join(tmpDir, "bumper.mp4");

  const title = fresh.bumperTitle?.trim() || fresh.name;
  const tagline = fresh.bumperTagline?.trim() || undefined;

  await ctx.log(
    `Rendering bumper: "${title}"${tagline ? ` / "${tagline}"` : ""}…`,
  );
  await renderBumperToFile(
    {
      title,
      tagline,
      logoUrl: fresh.logoUrl,
      brandColor: fresh.brandColor ?? "#38bdf8",
      durationSeconds: fresh.bumperDurationSeconds ?? 4,
      reporter: ctx,
    },
    outPath,
  );

  const buffer = await fs.readFile(outPath);
  const { url } = await storage.save(
    `projects/${fresh.id}/bumper/bumper-${ctx.jobId}.mp4`,
    buffer,
    "video/mp4",
  );

  await db.updateProject(fresh.id, { bumperUrl: url });
  await ctx.log(`Bumper saved (${fresh.bumperDurationSeconds ?? 4}s).`);
  await ctx.setStatus("completed", undefined, 100);
  await db.updateJob(ctx.jobId, {
    completedAt: new Date(),
    missingCredentials: ctx.missingCredentials,
  });

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

async function runProduce(
  ctx: PipelineContext,
  project: ProjectRecord,
  video: ProjectVideoRecord,
) {
  const enrichedWorkflow = enrichWorkflowSteps(
    video.workflow ?? [],
    project.applicationMap,
  );
  const workflow = enrichedWorkflow.filter((s) => s.enabled);
  if (workflow.length === 0) {
    throw new Error("No enabled workflow steps to record.");
  }

  await ctx.setStatus("recording", "recording", 10);
  const password = decrypt(project.encryptedPassword);
  const recording = await executeWorkflow({
    projectId: project.id,
    url: project.url,
    email: project.loginEmail,
    password,
    workflow: enrichedWorkflow,
    applicationMap: project.applicationMap,
    reporter: ctx,
  });
  await ctx.log(`Captured ${recording.scenes.length} scenes.`);
  await ctx.setProgress(30);

  await ctx.setStatus("generating_script", "recording", 35);
  const scriptInput = {
    prompt: video.prompt,
    projectName: video.name,
    steps: workflow,
    reporter: ctx,
  };
  const script =
    video.voiceOption === "no_audio"
      ? (await ctx.log("Script: template (no OpenAI call — no audio)."),
        buildTemplateScript(scriptInput))
      : await generateScript(scriptInput);

  await ctx.setStatus("generating_audio", "recording", 50);
  const voice = await generateVoice(video.voiceOption, {
    script,
    projectId: project.id,
    reporter: ctx,
  });

  await ctx.setStatus("rendering", "rendering", 65);
  const masterDir = await fs.mkdtemp(path.join(os.tmpdir(), "autodemo-master-"));
  let rawVideoPath: string | undefined;
  if (recording.rawVideo) {
    rawVideoPath = await resolveVideoToLocalFile(
      recording.rawVideo,
      path.join(masterDir, "session.mp4"),
    );
    const stat = await fs.stat(rawVideoPath);
    await ctx.log(
      `Resolved screen recording to local file (${Math.round(stat.size / 1024)} KB).`,
    );
  }

  const bundleDir = await ensureBundle(ctx);
  let videoSrc: string | undefined;
  if (rawVideoPath) {
    videoSrc = await stageVideoInRemotionBundle(
      bundleDir,
      rawVideoPath,
      `session-${ctx.jobId}.mp4`,
    );
    await ctx.log("Staged screen recording in Remotion bundle.");
  }

  const baseProps = await buildBaseProps({
    script,
    scenes: recording.scenes,
    voice,
    videoSrc,
    branding: {
      logoUrl: project.logoUrl,
      brandColor: project.brandColor ?? "#38bdf8",
      bumperEnabled: false,
      bumperDurationSeconds: 0,
    },
    reporter: ctx,
  });

  const masterPath = path.join(masterDir, "master.mp4");
  await ctx.log("Rendering 16:9 body master (no inline bumper)…");
  await renderToFile(baseProps, masterPath, ctx);
  const masterBuffer = await fs.readFile(masterPath);
  await storage.save(
    `projects/${project.id}/videos/${video.id}/exports/master.mp4`,
    masterBuffer,
    "video/mp4",
  );
  await ctx.setProgress(75);

  const bumperOffset =
    project.bumperEnabled && project.bumperUrl
      ? project.bumperDurationSeconds ?? 4
      : 0;

  const captionUrl = await generateCaptions({
    projectId: project.id,
    videoId: video.id,
    segments: voice.segments,
    bumperOffsetSeconds: bumperOffset,
    reporter: ctx,
  });

  await ctx.setStatus("exporting", "rendering", 80);
  await db.deleteAssetsByVideo(video.id);

  const baseScreenshot = recording.scenes[0]?.screenshot;
  const platforms = (video.platforms ?? []) as Platform[];
  const scriptJson = JSON.stringify(script, null, 2);

  const variantGroups = new Map<string, Platform[]>();
  for (const platform of platforms) {
    const key = exportVariantKey(platform);
    const group = variantGroups.get(key) ?? [];
    group.push(platform);
    variantGroups.set(key, group);
  }

  const groupEntries = Array.from(variantGroups.entries());
  let completedGroups = 0;

  const exportBranding = {
    bumperEnabled: project.bumperEnabled !== false,
    bumperUrl: project.bumperUrl,
    bumperDurationSeconds: project.bumperDurationSeconds ?? 4,
  };

  for (const [variantKey, groupPlatforms] of groupEntries) {
    const representative = groupPlatforms[0];
    const spec = PLATFORM_SPECS[representative];
    const isPortrait = spec.height > spec.width;
    const maxSeconds = exportVariantMaxSeconds(groupPlatforms);
    const platformLabels = groupPlatforms
      .map((p) => PLATFORM_SPECS[p].label)
      .join(", ");

    await ctx.log(`Exporting ${variantKey} variant for ${platformLabels}…`);

    const videoUrl = await exportPlatform({
      projectId: project.id,
      videoId: video.id,
      masterPath,
      baseProps,
      platform: representative,
      branding: exportBranding,
      variantKey,
      maxSeconds,
      reporter: ctx,
    });

    const thumbnailUrl = await generateThumbnail({
      projectId: `${project.id}/videos/${video.id}/${variantKey}`,
      title: video.name,
      headline: script.title,
      baseScreenshotUrl: baseScreenshot,
      width: isPortrait ? 720 : 1280,
      height: isPortrait ? 1280 : 720,
      reporter: ctx,
    });

    for (const platform of groupPlatforms) {
      await db.createAsset({
        projectId: project.id,
        videoId: video.id,
        platform,
        videoUrl,
        audioUrl: voice.audioUrl,
        thumbnailUrl,
        captionUrl,
        script: scriptJson,
      });
    }

    completedGroups += 1;
    await ctx.setProgress(
      80 + Math.round((completedGroups / groupEntries.length) * 18),
    );
  }

  await fs.rm(masterDir, { recursive: true, force: true }).catch(() => {});

  await ctx.log("All platform exports complete.");
  await ctx.setStatus("completed", "completed", 100);
  await db.updateJob(ctx.jobId, {
    completedAt: new Date(),
    missingCredentials: ctx.missingCredentials,
  });
}
