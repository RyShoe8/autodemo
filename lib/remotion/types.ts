export interface RemotionScene {
  src: string;
  heading: string;
  narration: string;
  durationInFrames: number;
}

export interface DemoVideoProps {
  title: string;
  intro: string;
  outro: string;
  scenes: RemotionScene[];
  audioSrc?: string;
  introFrames: number;
  outroFrames: number;
  width: number;
  height: number;
  fps: number;
  accent: string;
  // Remotion requires composition props to be a string-indexed record.
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
  return Math.max(1, props.introFrames + sceneFrames + props.outroFrames);
}
