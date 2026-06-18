export type SceneTransition =
  | "fade"
  | "slideLeft"
  | "slideUp"
  | "zoom"
  | "crossfade";

const TRANSITIONS: SceneTransition[] = [
  "fade",
  "slideLeft",
  "slideUp",
  "zoom",
  "crossfade",
];

export function transitionForIndex(index: number): SceneTransition {
  return TRANSITIONS[index % TRANSITIONS.length];
}

export function transitionStyle(
  transition: SceneTransition,
  frame: number,
  duration: number,
): { opacity: number; transform: string } {
  const enterEnd = Math.min(18, Math.floor(duration * 0.25));
  const exitStart = Math.max(duration - enterEnd, enterEnd + 1);

  const opacity = (() => {
    if (transition === "crossfade") {
      return frame < enterEnd
        ? frame / enterEnd
        : frame >= exitStart
          ? (duration - frame) / (duration - exitStart)
          : 1;
    }
    if (frame < enterEnd) return frame / enterEnd;
    if (frame >= exitStart) return (duration - frame) / (duration - exitStart);
    return 1;
  })();

  let transform = "none";
  if (frame < enterEnd) {
    const t = frame / enterEnd;
    switch (transition) {
      case "slideLeft":
        transform = `translateX(${(1 - t) * 80}px)`;
        break;
      case "slideUp":
        transform = `translateY(${(1 - t) * 60}px)`;
        break;
      case "zoom":
        transform = `scale(${0.92 + t * 0.08})`;
        break;
      default:
        break;
    }
  }

  return { opacity, transform };
}
