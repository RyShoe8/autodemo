import type { SceneTransition } from "./transitions";

export interface RemotionScene {
  src: string;
  heading: string;
  narration: string;
  durationInFrames: number;
  /** Filename under bundle public/ — resolved via staticFile() in the composition. */
  videoAssetName?: string;
  videoStartMs?: number;
  videoEndMs?: number;
  transition?: SceneTransition;
}

export interface DemoVideoProps {
  title: string;
  intro: string;
  outro: string;
  scenes: RemotionScene[];
  audioSrc?: string;
  introFrames: number;
  outroFrames: number;
  bumperFrames: number;
  bumperEnabled: boolean;
  logoSrc?: string;
  brandColor: string;
  width: number;
  height: number;
  fps: number;
  accent: string;
  [key: string]: unknown;
}

export const DEMO_COMPOSITION_ID = "DemoVideo";

export const DEFAULT_DEMO_PROPS: DemoVideoProps = {
  title: "AutoDemo AI",
  intro: "A quick look at what this product can do.",
  outro: "Get started today.",
  scenes: [],
  introFrames: 90,
  outroFrames: 90,
  bumperFrames: 120,
  bumperEnabled: true,
  brandColor: "#38bdf8",
  width: 1920,
  height: 1080,
  fps: 30,
  accent: "#38bdf8",
};

export function computeDurationInFrames(props: DemoVideoProps): number {
  const sceneFrames = props.scenes.reduce(
    (sum, s) => sum + s.durationInFrames,
    0,
  );
  const bumper = props.bumperEnabled ? props.bumperFrames : 0;
  const intro = props.bumperEnabled ? 0 : props.introFrames;
  return Math.max(1, bumper + intro + sceneFrames + props.outroFrames);
}
