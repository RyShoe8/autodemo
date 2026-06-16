import OpenAI from "openai";
import { env, flags } from "@/lib/env";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!flags.hasOpenAI) return null;
  if (!client) {
    client = new OpenAI({ apiKey: env.openaiApiKey });
  }
  return client;
}

/**
 * Request a JSON object completion. Returns the parsed JSON, or null on any
 * failure (so callers can fall back to deterministic templates).
 */
export async function jsonCompletion(opts: {
  system: string;
  user: string;
}): Promise<unknown | null> {
  const openai = getOpenAI();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: env.openaiModel,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
