import path from "node:path";
import { readAsset } from "@/lib/storage";
import { env } from "@/lib/env";
import type { Reporter } from "@/lib/workflow/context";
import type { CapturedScene, Script } from "@/types";
import type { VoiceResult } from "@/lib/video/voice/types";
import {
  DEMO_COMPOSITION_ID,
  computeDurationInFrames,
  type DemoVideoProps,
  type RemotionScene,
} from "@/lib/remotion/types";
import { transitionForIndex } from "@/lib/remotion/transitions";
import {
  BUMPER_COMPOSITION_ID,
  type BumperVideoProps,
} from "@/lib/remotion/BumperVideo";
import {
  screenshotAssetName,
  stageAssetsInRemotionBundle,
} from "@/lib/video/remotion-assets";
import { toDataUri } from "@/lib/video/media-resolve";

export const RENDER_FPS = 30;

export interface RenderBranding {
  logoUrl?: string;
  brandColor: string;
  bumperEnabled: boolean;
  bumperDurationSeconds: number;
}

export interface RenderBuildInput {
  script: Script;
  scenes: CapturedScene[];
  voice: VoiceResult;
  jobId: string;
  bundleDir: string;
  /** Per-scene clip filenames staged in the bundle public folder. */
  sceneClipAssets?: Map<number, string>;
  branding: RenderBranding;
  reporter: Reporter;
}

const globalForRender = globalThis as unknown as { __remotionBundle__?: string };

function logoAssetName(jobId: string, url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "png";
  return `logo-${jobId}.${ext === "jpeg" ? "jpg" : ext}`;
}

function narrationAssetName(jobId: string, url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "mp3";
  return `narration-${jobId}.${ext}`;
}

/** Bundle Remotion and return the output directory (used as serveUrl). */
export async function ensureBundle(reporter: Reporter): Promise<string> {
  if (globalForRender.__remotionBundle__) return globalForRender.__remotionBundle__;
  const { bundle } = await import("@remotion/bundler");
  await reporter.log("Bundling Remotion composition…");
  const entry = path.join(process.cwd(), "lib", "remotion", "entry.ts");
  const bundleDir = await bundle({
    entryPoint: entry,
    onProgress: () => {},
  });
  globalForRender.__remotionBundle__ = bundleDir;
  return bundleDir;
}

/** Build the 16:9 master composition props from the pipeline artifacts. */
export async function buildBaseProps(
  input: RenderBuildInput,
): Promise<DemoVideoProps> {
  const {
    script,
    scenes,
    voice,
    jobId,
    bundleDir,
    sceneClipAssets,
    branding,
  } = input;
  const segments = voice.segments;
  const introFrames = Math.round((segments[0]?.durationSeconds ?? 5) * RENDER_FPS);
  const outroFrames = Math.round(
    (segments[segments.length - 1]?.durationSeconds ?? 5) * RENDER_FPS,
  );
  const bumperFrames = branding.bumperEnabled
    ? Math.round(branding.bumperDurationSeconds * RENDER_FPS)
    : 0;

  const stageInputs: { assetName: string; buffer: Buffer }[] = [];
  let logoAsset: string | undefined;
  let audioAsset: string | undefined;

  if (branding.logoUrl && !branding.logoUrl.startsWith("data:")) {
    logoAsset = logoAssetName(jobId, branding.logoUrl);
    stageInputs.push({
      assetName: logoAsset,
      buffer: await readAsset(branding.logoUrl),
    });
  }

  if (voice.audioUrl && !voice.audioUrl.startsWith("data:")) {
    audioAsset = narrationAssetName(jobId, voice.audioUrl);
    stageInputs.push({
      assetName: audioAsset,
      buffer: await readAsset(voice.audioUrl),
    });
  }

  const count = Math.min(scenes.length, script.scenes.length);
  const remotionScenes: RemotionScene[] = [];

  for (let i = 0; i < count; i++) {
    const scene = scenes[i];
    const scriptScene = script.scenes[i];
    const seg = segments[i + 1];
    const scriptDuration =
      seg?.durationSeconds ?? scriptScene.durationSeconds ?? 6;
    const hasVideoClip = Boolean(sceneClipAssets?.get(i));

    let screenshotAsset: string | undefined;
    if (!hasVideoClip && scene.screenshot && !scene.screenshot.startsWith("data:")) {
      screenshotAsset = screenshotAssetName(jobId, i, scene.screenshot);
      stageInputs.push({
        assetName: screenshotAsset,
        buffer: await readAsset(scene.screenshot),
      });
    }

    remotionScenes.push({
      src: hasVideoClip || screenshotAsset ? "" : await toDataUri(scene.screenshot),
      heading: scriptScene.heading,
      narration: scriptScene.narration,
      durationInFrames: Math.max(
        RENDER_FPS,
        Math.round(scriptDuration * RENDER_FPS),
      ),
      videoAssetName: sceneClipAssets?.get(i),
      screenshotAssetName: screenshotAsset,
      transition: transitionForIndex(i),
    });
  }

  if (remotionScenes.length === 0 && script.scenes.length > 0) {
    for (let i = 0; i < script.scenes.length; i++) {
      const scriptScene = script.scenes[i];
      remotionScenes.push({
        src: "",
        heading: scriptScene.heading,
        narration: scriptScene.narration,
        durationInFrames: Math.max(
          RENDER_FPS,
          Math.round((scriptScene.durationSeconds || 6) * RENDER_FPS),
        ),
        transition: transitionForIndex(i),
      });
    }
  }

  if (stageInputs.length > 0) {
    await stageAssetsInRemotionBundle(bundleDir, stageInputs);
  }

  const logoSrc =
    logoAsset !== undefined
      ? undefined
      : branding.logoUrl
        ? await toDataUri(branding.logoUrl)
        : undefined;

  const audioSrc =
    audioAsset !== undefined
      ? undefined
      : voice.audioUrl
        ? await toDataUri(voice.audioUrl)
        : undefined;

  const accent = branding.brandColor;

  return {
    title: script.title,
    intro: script.intro,
    outro: script.outro,
    scenes: remotionScenes,
    audioSrc,
    audioAssetName: audioAsset,
    introFrames,
    outroFrames,
    bumperFrames,
    bumperEnabled: branding.bumperEnabled,
    logoSrc,
    logoAssetName: logoAsset,
    delayRenderTimeoutMs: env.remotionTimeoutMs,
    brandColor: branding.brandColor,
    width: 1920,
    height: 1080,
    fps: RENDER_FPS,
    accent,
  };
}

export async function renderToFile(
  props: DemoVideoProps,
  outputPath: string,
  reporter: Reporter,
  onCancelCheck?: () => Promise<void>,
): Promise<void> {
  const { selectComposition, renderMedia, makeCancelSignal } =
    await import("@remotion/renderer");
  const serveUrl = await ensureBundle(reporter);

  const composition = await selectComposition({
    serveUrl,
    id: DEMO_COMPOSITION_ID,
    inputProps: props,
    timeoutInMilliseconds: env.remotionTimeoutMs,
  });

  const verbose = process.env.REMOTION_VERBOSE === "true";
  let lastLoggedPercent = -1;

  const { cancelSignal, cancel } = makeCancelSignal();
  const cancelPoll = onCancelCheck
    ? setInterval(() => {
        void onCancelCheck().catch(() => {
          cancel();
        });
      }, 2000)
    : undefined;

  try {
    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: computeDurationInFrames(props),
        width: props.width,
        height: props.height,
        fps: props.fps,
        props,
      },
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: props,
      verbose,
      logLevel: verbose ? "verbose" : "info",
      cancelSignal,
      timeoutInMilliseconds: env.remotionTimeoutMs,
      concurrency: env.remotionConcurrency ?? 1,
      offthreadVideoCacheSizeInBytes: env.remotionOffthreadCacheBytes,
      offthreadVideoThreads: 1,
      x264Preset: "veryfast",
      crf: 18,
      onProgress: ({ progress }) => {
        const percent = Math.round(progress * 100);
        if (percent >= lastLoggedPercent + 5 || percent === 100) {
          lastLoggedPercent = percent;
          void reporter.log(`Render progress: ${percent}%`);
        }
      },
    });
  } finally {
    if (cancelPoll) clearInterval(cancelPoll);
  }
}

export interface RenderBumperInput {
  title: string;
  tagline?: string;
  logoUrl?: string;
  brandColor: string;
  durationSeconds: number;
  reporter: Reporter;
}

export async function renderBumperToFile(
  input: RenderBumperInput,
  outputPath: string,
): Promise<void> {
  const { selectComposition, renderMedia } = await import("@remotion/renderer");

  const durationInFrames = Math.round(input.durationSeconds * RENDER_FPS);
  const logoSrc = input.logoUrl
    ? await toDataUri(input.logoUrl)
    : undefined;

  const props: BumperVideoProps = {
    title: input.title,
    tagline: input.tagline ?? "",
    logoSrc,
    brandColor: input.brandColor,
    durationInFrames,
    width: 1920,
    height: 1080,
    fps: RENDER_FPS,
  };

  const serveUrl = await ensureBundle(input.reporter);
  const composition = await selectComposition({
    serveUrl,
    id: BUMPER_COMPOSITION_ID,
    inputProps: props,
    timeoutInMilliseconds: env.remotionTimeoutMs,
  });

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames: props.durationInFrames,
      width: props.width,
      height: props.height,
      fps: props.fps,
      props,
    },
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props,
    verbose: true,
    logLevel: "verbose",
    timeoutInMilliseconds: env.remotionTimeoutMs,
    concurrency: env.remotionConcurrency ?? 1,
    offthreadVideoCacheSizeInBytes: env.remotionOffthreadCacheBytes,
    offthreadVideoThreads: 1,
    x264Preset: "veryfast",
    crf: 18,
    onProgress: () => {},
  });
}
