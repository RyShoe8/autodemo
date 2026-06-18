import path from "node:path";
import { toDataUri } from "@/lib/video/media-resolve";
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
  rawVideo?: string;
  branding: RenderBranding;
  reporter: Reporter;
}

const globalForRender = globalThis as unknown as { __remotionBundle__?: string };

export async function ensureBundle(reporter: Reporter): Promise<string> {
  if (globalForRender.__remotionBundle__) return globalForRender.__remotionBundle__;
  const { bundle } = await import("@remotion/bundler");
  await reporter.log("Bundling Remotion composition…");
  const entry = path.join(process.cwd(), "lib", "remotion", "entry.ts");
  const serveUrl = await bundle({
    entryPoint: entry,
    onProgress: () => {},
  });
  globalForRender.__remotionBundle__ = serveUrl;
  return serveUrl;
}

/** Build the 16:9 master composition props from the pipeline artifacts. */
export async function buildBaseProps(
  input: RenderBuildInput,
): Promise<DemoVideoProps> {
  const { script, scenes, voice, rawVideo, branding } = input;
  const segments = voice.segments;
  const introFrames = Math.round((segments[0]?.durationSeconds ?? 5) * RENDER_FPS);
  const outroFrames = Math.round(
    (segments[segments.length - 1]?.durationSeconds ?? 5) * RENDER_FPS,
  );
  const bumperFrames = branding.bumperEnabled
    ? Math.round(branding.bumperDurationSeconds * RENDER_FPS)
    : 0;

  const videoDataUri = rawVideo ? await toDataUri(rawVideo) : undefined;
  const logoSrc = branding.logoUrl
    ? await toDataUri(branding.logoUrl)
    : undefined;

  const count = Math.min(scenes.length, script.scenes.length);
  const remotionScenes: RemotionScene[] = [];
  for (let i = 0; i < count; i++) {
    const scene = scenes[i];
    const scriptScene = script.scenes[i];
    const seg = segments[i + 1];
    const scriptDuration =
      seg?.durationSeconds ?? scriptScene.durationSeconds ?? 6;

    let clipDuration = scriptDuration;
    if (
      scene.videoStartMs !== undefined &&
      scene.videoEndMs !== undefined
    ) {
      const clipSec = (scene.videoEndMs - scene.videoStartMs) / 1000;
      clipDuration = Math.max(scriptDuration, clipSec);
    }

    remotionScenes.push({
      src: await toDataUri(scene.screenshot),
      heading: scriptScene.heading,
      narration: scriptScene.narration,
      durationInFrames: Math.max(
        RENDER_FPS,
        Math.round(clipDuration * RENDER_FPS),
      ),
      videoSrc: videoDataUri,
      videoStartMs: scene.videoStartMs,
      videoEndMs: scene.videoEndMs,
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

  const audioSrc = voice.audioUrl
    ? await toDataUri(voice.audioUrl)
    : undefined;

  const accent = branding.brandColor;

  return {
    title: script.title,
    intro: script.intro,
    outro: script.outro,
    scenes: remotionScenes,
    audioSrc,
    introFrames,
    outroFrames,
    bumperFrames,
    bumperEnabled: branding.bumperEnabled,
    logoSrc,
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
): Promise<void> {
  const { selectComposition, renderMedia } = await import("@remotion/renderer");
  const serveUrl = await ensureBundle(reporter);

  const composition = await selectComposition({
    serveUrl,
    id: DEMO_COMPOSITION_ID,
    inputProps: props,
  });

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
    onProgress: () => {},
  });
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
    onProgress: () => {},
  });
}
