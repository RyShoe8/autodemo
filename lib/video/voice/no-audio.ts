import {
  buildSegments,
  totalDuration,
  type VoiceGenInput,
  type VoiceProvider,
  type VoiceResult,
} from "@/lib/video/voice/types";

export class NoAudioProvider implements VoiceProvider {
  readonly id = "no_audio" as const;

  async generateAudio(input: VoiceGenInput): Promise<VoiceResult> {
    const { script, reporter } = input;
    const segments = buildSegments(script);
    await reporter.log("Voice set to No Audio — rendering a silent video.");
    return {
      segments,
      totalDuration: totalDuration(segments),
      provider: this.id,
    };
  }
}
