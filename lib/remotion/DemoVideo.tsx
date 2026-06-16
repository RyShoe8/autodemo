import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { DemoVideoProps, RemotionScene } from "./types";

function TitleCard({
  primary,
  secondary,
  accent,
  durationInFrames,
}: {
  primary: string;
  secondary: string;
  accent: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const translateY = interpolate(enter, [0, 1], [40, 0]);
  const isPortrait = width < 1200;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 30% 20%, #1e293b 0%, #0b1120 60%, #05070d 100%)",
        justifyContent: "center",
        alignItems: "center",
        padding: isPortrait ? 64 : 120,
        textAlign: "center",
      }}
    >
      <div style={{ opacity, transform: `translateY(${translateY}px)` }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 24,
            background: accent,
            margin: "0 auto 36px",
            boxShadow: `0 20px 60px ${accent}55`,
          }}
        />
        <h1
          style={{
            color: "white",
            fontSize: isPortrait ? 64 : 88,
            fontWeight: 800,
            fontFamily: "Inter, Arial, sans-serif",
            margin: 0,
            lineHeight: 1.05,
          }}
        >
          {primary}
        </h1>
        <p
          style={{
            color: "#94a3b8",
            fontSize: isPortrait ? 30 : 38,
            fontFamily: "Inter, Arial, sans-serif",
            marginTop: 28,
            maxWidth: 1100,
          }}
        >
          {secondary}
        </p>
      </div>
    </AbsoluteFill>
  );
}

function Scene({
  scene,
  index,
  accent,
}: {
  scene: RemotionScene;
  index: number;
  accent: string;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const duration = scene.durationInFrames;

  // Ken Burns: alternate zoom-in / pan across scenes.
  const zoom = interpolate(frame, [0, duration], [1.08, 1.18]);
  const panX = interpolate(
    frame,
    [0, duration],
    index % 2 === 0 ? [-20, 20] : [20, -20],
  );
  const fade = interpolate(
    frame,
    [0, 14, duration - 14, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const captionRise = interpolate(frame, [6, 24], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isPortrait = height > width;

  return (
    <AbsoluteFill style={{ background: "#05070d", opacity: fade }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: isPortrait ? 24 : 80,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
            border: "1px solid rgba(148,163,184,0.15)",
          }}
        >
          <Img
            src={scene.src}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${zoom}) translateX(${panX}px)`,
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Lower-third caption / title card */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: isPortrait ? 40 : 80,
        }}
      >
        <div
          style={{
            transform: `translateY(${captionRise}px)`,
            background: "rgba(8,11,20,0.82)",
            borderLeft: `6px solid ${accent}`,
            borderRadius: 16,
            padding: isPortrait ? "24px 28px" : "28px 36px",
            maxWidth: isPortrait ? "100%" : "70%",
          }}
        >
          <div
            style={{
              color: accent,
              fontSize: isPortrait ? 22 : 24,
              fontWeight: 700,
              fontFamily: "Inter, Arial, sans-serif",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {scene.heading}
          </div>
          <div
            style={{
              color: "white",
              fontSize: isPortrait ? 30 : 36,
              fontWeight: 600,
              fontFamily: "Inter, Arial, sans-serif",
              marginTop: 10,
              lineHeight: 1.25,
            }}
          >
            {scene.narration}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export const DemoVideo: React.FC<DemoVideoProps> = ({
  title,
  intro,
  outro,
  scenes,
  audioSrc,
  introFrames,
  outroFrames,
  accent,
}) => {
  let cursor = introFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070d" }}>
      {audioSrc ? <Audio src={audioSrc} /> : null}

      <Sequence durationInFrames={introFrames}>
        <TitleCard
          primary={title}
          secondary={intro}
          accent={accent}
          durationInFrames={introFrames}
        />
      </Sequence>

      {scenes.map((scene, index) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence
            key={index}
            from={from}
            durationInFrames={scene.durationInFrames}
          >
            <Scene scene={scene} index={index} accent={accent} />
          </Sequence>
        );
      })}

      <Sequence from={cursor} durationInFrames={outroFrames}>
        <TitleCard
          primary={outro}
          secondary={title}
          accent={accent}
          durationInFrames={outroFrames}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
