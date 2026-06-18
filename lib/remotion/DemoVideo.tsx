import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BumperIntro } from "./BumperIntro";
import { transitionForIndex, transitionStyle } from "./transitions";
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

function SceneMedia({
  scene,
  index,
}: {
  scene: RemotionScene;
  index: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const duration = scene.durationInFrames;
  const isPortrait = height > width;
  const transition = scene.transition ?? transitionForIndex(index);
  const { opacity, transform } = transitionStyle(transition, frame, duration);

  const hasVideo =
    scene.videoSrc &&
    scene.videoStartMs !== undefined &&
    scene.videoEndMs !== undefined;

  if (hasVideo) {
    const startFrame = Math.round((scene.videoStartMs! / 1000) * fps);
    return (
      <OffthreadVideo
        src={scene.videoSrc!}
        startFrom={startFrame}
        style={{
          width: "100%",
          height: "100%",
          objectFit: isPortrait ? "contain" : "cover",
          backgroundColor: "#05070d",
          opacity,
          transform,
        }}
      />
    );
  }

  const zoom = interpolate(frame, [0, duration], [1.08, 1.18]);
  const panX = interpolate(
    frame,
    [0, duration],
    index % 2 === 0 ? [-20, 20] : [20, -20],
  );

  return (
    <Img
      src={scene.src}
      style={{
        width: "100%",
        height: "100%",
        objectFit: isPortrait ? "contain" : "cover",
        backgroundColor: isPortrait ? "#05070d" : undefined,
        opacity,
        transform: isPortrait
          ? transform
          : `${transform === "none" ? "" : transform + " "}${isPortrait ? "" : `scale(${zoom}) translateX(${panX}px)`}`.trim(),
      }}
    />
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
  const isPortrait = height > width;

  const captionRise = interpolate(frame, [12, 30], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#05070d" }}>
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
          <SceneMedia scene={scene} index={index} />
        </div>
      </AbsoluteFill>

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
  bumperFrames,
  bumperEnabled,
  logoSrc,
  brandColor,
  accent,
}) => {
  const bumperOffset =
    bumperEnabled && bumperFrames > 0 ? bumperFrames : 0;
  const introOffset =
    !bumperEnabled && introFrames > 0 ? introFrames : 0;
  const scenesStart =
    bumperOffset +
    introOffset +
    scenes.reduce((sum, s) => sum + s.durationInFrames, 0);

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070d" }}>
      {audioSrc ? <Audio src={audioSrc} /> : null}

      {bumperEnabled && bumperFrames > 0 ? (
        <Sequence from={0} durationInFrames={bumperFrames}>
          <BumperIntro
            title={title}
            tagline={intro}
            logoSrc={logoSrc}
            brandColor={brandColor}
            durationInFrames={bumperFrames}
          />
        </Sequence>
      ) : null}

      {!bumperEnabled && introFrames > 0 ? (
        <Sequence from={0} durationInFrames={introFrames}>
          <TitleCard
            primary={title}
            secondary={intro}
            accent={accent}
            durationInFrames={introFrames}
          />
        </Sequence>
      ) : null}

      {scenes.map((scene, index) => {
        const from = bumperOffset + introOffset + scenes
          .slice(0, index)
          .reduce((sum, s) => sum + s.durationInFrames, 0);
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

      <Sequence from={scenesStart} durationInFrames={outroFrames}>
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
