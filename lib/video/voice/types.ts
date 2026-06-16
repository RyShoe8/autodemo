import type { Script, VoiceOption } from "@/types";
import type { Reporter } from "@/lib/workflow/context";

export interface AudioSegment {
  text: string;
  durationSeconds: number;
}

export interface VoiceResult {
  /** URL to a single combined narration track (mp3). Absent for silent modes. */
  audioUrl?: string;
  segments: AudioSegment[];
  totalDuration: number;
  provider: VoiceOption;
}

export interface VoiceGenInput {
  script: Script;
  projectId: string;
  reporter: Reporter;
}

export interface VoiceProvider {
  readonly id: VoiceOption;
  generateAudio(input: VoiceGenInput): Promise<VoiceResult>;
}

const INTRO_SECONDS = 5;
const OUTRO_SECONDS = 5;

/** Build ordered narration segments (intro, scenes…, outro) with durations. */
export function buildSegments(script: Script): AudioSegment[] {
  return [
    { text: script.intro, durationSeconds: INTRO_SECONDS },
    ...script.scenes.map((s) => ({
      text: s.narration,
      durationSeconds: Math.max(3, Math.min(10, s.durationSeconds || 6)),
    })),
    { text: script.outro, durationSeconds: OUTRO_SECONDS },
  ];
}

export function combinedNarration(script: Script): string {
  return buildSegments(script)
    .map((s) => s.text)
    .join(" ");
}

export function totalDuration(segments: AudioSegment[]): number {
  return segments.reduce((sum, s) => sum + s.durationSeconds, 0);
}
