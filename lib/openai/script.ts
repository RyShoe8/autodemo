import { jsonCompletion } from "@/lib/openai/client";
import { scriptSchema } from "@/lib/validation/schemas";
import type { Script, WorkflowStep } from "@/types";
import type { Reporter } from "@/lib/workflow/context";

export interface ScriptGenInput {
  prompt: string;
  projectName: string;
  steps: WorkflowStep[];
  reporter: Reporter;
}

const SYSTEM_PROMPT = `You are a professional voiceover scriptwriter for short SaaS product demo videos.
Given a video goal and an ordered list of workflow steps, write a concise narration.
Return STRICT JSON: { "title": string, "intro": string, "scenes": [ { "stepId": string, "heading": string, "narration": string, "durationSeconds": number } ], "outro": string }.
Rules:
- One scene per provided step, in the same order, reusing the given stepId.
- Narration per scene: 1-2 short sentences, energetic but clear.
- durationSeconds between 4 and 8.
- intro: a punchy hook (1 sentence). outro: a call to action (1 sentence).
- title: under 10 words.`;

function buildUserPrompt(input: ScriptGenInput): string {
  const steps = input.steps
    .map((s, i) => `${i + 1}. [${s.id}] ${s.title} — ${s.description}`)
    .join("\n");
  return [
    `PRODUCT: ${input.projectName}`,
    `VIDEO GOAL:\n${input.prompt}`,
    `STEPS:\n${steps}`,
  ].join("\n\n");
}

function buildTemplateScript(input: ScriptGenInput): Script {
  return {
    title: `${input.projectName} — Product Demo`,
    intro: `Here's a quick look at ${input.projectName} and how it helps you get more done.`,
    scenes: input.steps.map((s) => ({
      stepId: s.id,
      heading: s.title,
      narration: s.description || `Let's take a look at ${s.title}.`,
      durationSeconds: 6,
    })),
    outro: `That's ${input.projectName}. Try it today and see the difference.`,
  };
}

/**
 * Generate the narration script for the demo. Falls back to a deterministic
 * template if OpenAI is unavailable or returns invalid data.
 */
export async function generateScript(input: ScriptGenInput): Promise<Script> {
  const { reporter } = input;

  if (input.steps.length === 0) {
    return {
      title: `${input.projectName} — Product Demo`,
      intro: `A quick overview of ${input.projectName}.`,
      scenes: [
        {
          heading: "Overview",
          narration: `Welcome to ${input.projectName}.`,
          durationSeconds: 6,
        },
      ],
      outro: "Thanks for watching.",
    };
  }

  const result = await jsonCompletion({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input),
  });

  if (result === null) {
    await reporter.missing("OpenAI API key (script generation)");
    return buildTemplateScript(input);
  }

  const parsed = scriptSchema.safeParse(result);
  if (!parsed.success) {
    await reporter.log(
      "OpenAI returned an invalid script shape — using template fallback.",
    );
    return buildTemplateScript(input);
  }

  await reporter.log(`OpenAI wrote a script with ${parsed.data.scenes.length} scenes.`);
  return {
    title: parsed.data.title,
    intro: parsed.data.intro,
    outro: parsed.data.outro,
    scenes: parsed.data.scenes.map((s) => ({
      stepId: s.stepId ?? undefined,
      heading: s.heading,
      narration: s.narration,
      durationSeconds: s.durationSeconds,
    })),
  };
}
