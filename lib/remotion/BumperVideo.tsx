import React from "react";
import { AbsoluteFill } from "remotion";
import { BumperIntro } from "./BumperIntro";

export const BUMPER_COMPOSITION_ID = "BumperVideo";

export interface BumperVideoProps {
  title: string;
  tagline: string;
  logoSrc?: string;
  brandColor: string;
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
  [key: string]: unknown;
}

export const DEFAULT_BUMPER_PROPS: BumperVideoProps = {
  title: "AutoDemo",
  tagline: "",
  brandColor: "#38bdf8",
  durationInFrames: 120,
  width: 1920,
  height: 1080,
  fps: 30,
};

export function BumperVideo({
  title,
  tagline,
  logoSrc,
  brandColor,
  durationInFrames,
}: BumperVideoProps) {
  return (
    <AbsoluteFill>
      <BumperIntro
        title={title}
        tagline={tagline}
        logoSrc={logoSrc}
        brandColor={brandColor}
        durationInFrames={durationInFrames}
      />
    </AbsoluteFill>
  );
}
