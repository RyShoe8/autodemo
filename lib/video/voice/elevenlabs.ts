import { env, flags } from "@/lib/env";
import { storage } from "@/lib/storage";
import {
  buildSegments,
  combinedNarration,
  totalDuration,
  type VoiceGenInput,
  type VoiceProvider,
  type VoiceResult,
} from "@/lib/video/voice/types";

// Default public ElevenLabs voice ("Rachel").
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export class ElevenLabsProvider implements VoiceProvider {
  readonly id = "elevenlabs" as const;

  async generateAudio(input: VoiceGenInput): Promise<VoiceResult> {
    const { script, projectId, reporter } = input;
    const segments = buildSegments(script);

    if (!flags.hasElevenLabs) {
      await reporter.missing("ELEVENLABS_API_KEY");
      return {
        segments,
        totalDuration: totalDuration(segments),
        provider: this.id,
      };
    }

    try {
      await reporter.log("Generating voiceover with ElevenLabs…");
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": env.elevenLabsApiKey as string,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: combinedNarration(script),
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      );
      if (!res.ok) {
        throw new Error(`ElevenLabs responded ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const { url } = await storage.save(
        `projects/${projectId}/audio/narration.mp3`,
        buffer,
        "audio/mpeg",
      );
      await reporter.log("Voiceover generated.");
      return {
        audioUrl: url,
        segments,
        totalDuration: totalDuration(segments),
        provider: this.id,
      };
    } catch (err) {
      await reporter.log(
        `ElevenLabs failed (${err instanceof Error ? err.message : String(err)}) — continuing without audio.`,
      );
      await reporter.missing("ElevenLabs (text-to-speech request failed)");
      return {
        segments,
        totalDuration: totalDuration(segments),
        provider: this.id,
      };
    }
  }
}
