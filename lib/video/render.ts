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

export const RENDER_FPS = 30;
const ACCENT = "#38bdf8";

export interface RenderBuildInput {
  script: Script;
  scenes: CapturedScene[];
  voice: VoiceResult;
  reporter: Reporter;
}

const globalForRender = globalThis as unknown as { __remotionBundle__?: string };

/** Bundle the Remotion project once and cache the served URL for reuse. */
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
  const { script, scenes, voice } = input;
  const segments = voice.segments;
  const introFrames = Math.round((segments[0]?.durationSeconds ?? 5) * RENDER_FPS);
  const outroFrames = Math.round(
    (segments[segments.length - 1]?.durationSeconds ?? 5) * RENDER_FPS,
  );

  const count = Math.min(scenes.length, script.scenes.length);
  const remotionScenes: RemotionScene[] = [];
  for (let i = 0; i < count; i++) {
    const scene = scenes[i];
    const scriptScene = script.scenes[i];
    const seg = segments[i + 1];
    const durationSeconds = seg?.durationSeconds ?? scriptScene.durationSeconds ?? 6;
    remotionScenes.push({
      src: await toDataUri(scene.screenshot),
      heading: scriptScene.heading,
      narration: scriptScene.narration,
      durationInFrames: Math.max(
        RENDER_FPS,
        Math.round(durationSeconds * RENDER_FPS),
      ),
    });
  }

  // If recording produced no scenes, still show scripted scenes without imagery.
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
      });
    }
  }

  const audioSrc = voice.audioUrl
    ? await toDataUri(voice.audioUrl)
    : undefined;

  return {
    title: script.title,
    intro: script.intro,
    outro: script.outro,
    scenes: remotionScenes,
    audioSrc,
    introFrames,
    outroFrames,
    width: 1920,
    height: 1080,
    fps: RENDER_FPS,
    accent: ACCENT,
  };
}

/** Render the given composition props to an mp4 file on disk. */
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
    },
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props,
    onProgress: () => {},
  });
}
