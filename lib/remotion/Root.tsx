import React from "react";
import { Composition } from "remotion";
import { DemoVideo } from "./DemoVideo";
import {
  DEFAULT_DEMO_PROPS,
  DEMO_COMPOSITION_ID,
  computeDurationInFrames,
  type DemoVideoProps,
} from "./types";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={DEMO_COMPOSITION_ID}
      component={DemoVideo}
      durationInFrames={computeDurationInFrames(DEFAULT_DEMO_PROPS)}
      fps={DEFAULT_DEMO_PROPS.fps}
      width={DEFAULT_DEMO_PROPS.width}
      height={DEFAULT_DEMO_PROPS.height}
      defaultProps={DEFAULT_DEMO_PROPS}
      calculateMetadata={({ props }) => {
        const p = props as DemoVideoProps;
        return {
          durationInFrames: computeDurationInFrames(p),
          width: p.width,
          height: p.height,
          fps: p.fps,
        };
      }}
    />
  );
};
