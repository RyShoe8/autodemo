import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export function BumperIntro({
  title,
  tagline,
  logoSrc,
  brandColor,
  durationInFrames,
}: {
  title: string;
  tagline: string;
  logoSrc?: string;
  brandColor: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = interpolate(enter, [0, 1], [0.85, 1]);
  const logoSize = 120;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 30% 20%, ${brandColor}33 0%, #0b1120 55%, #05070d 100%)`,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ opacity, transform: `scale(${scale})` }}>
        {logoSrc ? (
          <Img
            src={logoSrc}
            style={{
              width: logoSize,
              height: logoSize,
              objectFit: "contain",
              margin: "0 auto 32px",
              borderRadius: 20,
            }}
          />
        ) : (
          <div
            style={{
              width: logoSize,
              height: logoSize,
              borderRadius: 24,
              background: brandColor,
              margin: "0 auto 32px",
              boxShadow: `0 20px 60px ${brandColor}55`,
            }}
          />
        )}
        <h1
          style={{
            color: "white",
            fontSize: 72,
            fontWeight: 800,
            fontFamily: "Inter, Arial, sans-serif",
            margin: 0,
            lineHeight: 1.05,
          }}
        >
          {title}
        </h1>
        {tagline ? (
          <p
            style={{
              color: "#94a3b8",
              fontSize: 32,
              fontFamily: "Inter, Arial, sans-serif",
              marginTop: 20,
              maxWidth: 900,
            }}
          >
            {tagline}
          </p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
