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
import { buildBaseProps, renderToFile } from "@/lib/video/render";
import { exportPlatform } from "@/lib/ffmpeg/export";
import { enrichWorkflowSteps } from "@/lib/playwright/step-resolver";
import { createLogger } from "@/lib/logger";
import {
  PLATFORM_SPECS,
  exportVariantKey,
  exportVariantMaxSeconds,
  type Platform,
} from "@/types";
import type { JobRecord, ProjectRecord } from "@/lib/db/types";

const log = createLogger("orchestrator");

/** Entry point: run a claimed job to completion. */
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

  const ctx = new PipelineContext(job.id, job.projectId);
  try {
    await ctx.log(`Starting ${job.type} job for "${project.name}".`);
    if (job.type === "discover") {
      await runDiscover(ctx, project);
    } else {
      await runProduce(ctx, project);
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
    await db.updateProject(job.projectId, { status: "failed" });
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
  });
  await db.updateProject(project.id, { applicationMap });
  await ctx.setProgress(40);

  await ctx.setStatus("building_workflow", "discovering", 55);
  const workflow = await generateWorkflow({
    prompt: project.prompt,
    applicationMap,
    reporter: ctx,
  });
  await db.updateProject(project.id, {
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

async function runProduce(ctx: PipelineContext, project: ProjectRecord) {
  const enrichedWorkflow = enrichWorkflowSteps(
    project.workflow ?? [],
    project.applicationMap,
  );
  const workflow = enrichedWorkflow.filter((s) => s.enabled);
  if (workflow.length === 0) {
    throw new Error("No enabled workflow steps to record.");
  }

  // 1. Recording
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

  // 2. Script
  await ctx.setStatus("generating_script", "recording", 35);
  const scriptInput = {
    prompt: project.prompt,
    projectName: project.name,
    steps: workflow,
    reporter: ctx,
  };
  let script;
  if (project.voiceOption === "no_audio") {
    await ctx.log("Script: template (no OpenAI call — no audio).");
    script = buildTemplateScript(scriptInput);
  } else {
    script = await generateScript(scriptInput);
  }

  // 3. Audio
  await ctx.setStatus("generating_audio", "recording", 50);
  const voice = await generateVoice(project.voiceOption, {
    script,
    projectId: project.id,
    reporter: ctx,
  });

  // 4. Render master
  await ctx.setStatus("rendering", "rendering", 65);
  const baseProps = await buildBaseProps({
    script,
    scenes: recording.scenes,
    voice,
    reporter: ctx,
  });

  const masterDir = await fs.mkdtemp(path.join(os.tmpdir(), "autodemo-master-"));
  const masterPath = path.join(masterDir, "master.mp4");
  await ctx.log("Rendering 16:9 master video…");
  await renderToFile(baseProps, masterPath, ctx);
  const masterBuffer = await fs.readFile(masterPath);
  await storage.save(
    `projects/${project.id}/exports/master.mp4`,
    masterBuffer,
    "video/mp4",
  );
  await ctx.setProgress(75);

  // 5. Captions
  const captionUrl = await generateCaptions({
    projectId: project.id,
    segments: voice.segments,
    reporter: ctx,
  });

  // 6. Per-platform export + thumbnails
  await ctx.setStatus("exporting", "rendering", 80);
  await db.deleteAssetsByProject(project.id);

  const baseScreenshot = recording.scenes[0]?.screenshot;
  const platforms = (project.platforms ?? []) as Platform[];
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

  for (const [variantKey, groupPlatforms] of groupEntries) {
    const representative = groupPlatforms[0];
    const spec = PLATFORM_SPECS[representative];
    const isPortrait = spec.height > spec.width;
    const maxSeconds = exportVariantMaxSeconds(groupPlatforms);
    const platformLabels = groupPlatforms
      .map((p) => PLATFORM_SPECS[p].label)
      .join(", ");

    await ctx.log(
      `Exporting ${variantKey} variant for ${platformLabels}…`,
    );

    const videoUrl = await exportPlatform({
      projectId: project.id,
      masterPath,
      baseProps,
      platform: representative,
      variantKey,
      maxSeconds,
      reporter: ctx,
    });

    const thumbnailUrl = await generateThumbnail({
      projectId: `${project.id}/${variantKey}`,
      title: project.name,
      headline: script.title,
      baseScreenshotUrl: baseScreenshot,
      width: isPortrait ? 720 : 1280,
      height: isPortrait ? 1280 : 720,
      reporter: ctx,
    });

    for (const platform of groupPlatforms) {
      await db.createAsset({
        projectId: project.id,
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
