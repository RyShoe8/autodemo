import {
  buildSegments,
  totalDuration,
  type VoiceGenInput,
  type VoiceProvider,
  type VoiceResult,
} from "@/lib/video/voice/types";

/**
 * Browser Speech narration is synthesized on the client at playback time using
 * the Web Speech API, so no audio is embedded into the rendered video. The
 * script is still produced and stored for client-side narration/captions.
 */
export class BrowserSpeechProvider implements VoiceProvider {
  readonly id = "browser_speech" as const;

  async generateAudio(input: VoiceGenInput): Promise<VoiceResult> {
    const { script, reporter } = input;
    const segments = buildSegments(script);
    await reporter.log(
      "Voice set to Browser Speech — narration plays client-side; rendered video is silent with captions.",
    );
    return {
      segments,
      totalDuration: totalDuration(segments),
      provider: this.id,
    };
  }
}
