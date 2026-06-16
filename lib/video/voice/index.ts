import type { VoiceOption } from "@/types";
import type { VoiceGenInput, VoiceProvider, VoiceResult } from "@/lib/video/voice/types";
import { OpenAITTSProvider } from "@/lib/video/voice/openai-tts";
import { ElevenLabsProvider } from "@/lib/video/voice/elevenlabs";
import { BrowserSpeechProvider } from "@/lib/video/voice/browser-speech";
import { NoAudioProvider } from "@/lib/video/voice/no-audio";

const PROVIDERS: Record<VoiceOption, VoiceProvider> = {
  openai_tts: new OpenAITTSProvider(),
  elevenlabs: new ElevenLabsProvider(),
  browser_speech: new BrowserSpeechProvider(),
  no_audio: new NoAudioProvider(),
};

export function getVoiceProvider(option: VoiceOption): VoiceProvider {
  // OpenAI is the default if an unknown option is provided.
  return PROVIDERS[option] ?? PROVIDERS.openai_tts;
}

export async function generateVoice(
  option: VoiceOption,
  input: VoiceGenInput,
): Promise<VoiceResult> {
  return getVoiceProvider(option).generateAudio(input);
}

export type { VoiceProvider, VoiceResult, VoiceGenInput };
