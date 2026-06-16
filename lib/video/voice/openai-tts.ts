import { getOpenAI } from "@/lib/openai/client";
import { storage } from "@/lib/storage";
import {
  buildSegments,
  combinedNarration,
  totalDuration,
  type VoiceGenInput,
  type VoiceProvider,
  type VoiceResult,
} from "@/lib/video/voice/types";

export class OpenAITTSProvider implements VoiceProvider {
  readonly id = "openai_tts" as const;

  async generateAudio(input: VoiceGenInput): Promise<VoiceResult> {
    const { script, projectId, reporter } = input;
    const segments = buildSegments(script);
    const openai = getOpenAI();

    if (!openai) {
      await reporter.missing("OpenAI API key (text-to-speech)");
      return {
        segments,
        totalDuration: totalDuration(segments),
        provider: this.id,
      };
    }

    try {
      await reporter.log("Generating voiceover with OpenAI TTS…");
      const response = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: combinedNarration(script),
      });
      const buffer = Buffer.from(await response.arrayBuffer());
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
        `OpenAI TTS failed (${err instanceof Error ? err.message : String(err)}) — continuing without audio.`,
      );
      await reporter.missing("OpenAI TTS (text-to-speech request failed)");
      return {
        segments,
        totalDuration: totalDuration(segments),
        provider: this.id,
      };
    }
  }
}
