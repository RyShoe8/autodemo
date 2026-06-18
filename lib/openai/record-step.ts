import { jsonCompletion, jsonCompletionWithImage } from "@/lib/openai/client";
import { env } from "@/lib/env";
import { aiRecordStepSchema } from "@/lib/validation/schemas";
import type { WorkflowStep } from "@/types";
import { z } from "zod";

export type AiRecordTarget = z.infer<typeof aiRecordStepSchema>;

const SYSTEM_PROMPT = `You help a screen-recording bot locate UI elements on a web page.
Given an approved workflow step and the current page context, return the single best target to interact with.
Return STRICT JSON: { "strategy": "role"|"label"|"placeholder"|"text"|"css", "role": "button"|"link"|"textbox"|"tab"|"checkbox"|"menuitem"|null, "name": string, "selector": string|null, "value": string|null, "expectModal": boolean }
Rules:
- Pick ONE target that matches the step intent — do not invent new steps.
- Prefer accessible role+name over CSS selectors.
- For "type" steps, target the input field and include a realistic "value" if not obvious from the step.
- Set expectModal true when the step opens a dialog or the target is inside a modal.
- Use strategy "role" with role+name when possible; "label"/"placeholder"/"text" for form fields; "css" only when necessary.`;

function buildUserPrompt(
  step: WorkflowStep,
  a11ySnapshot: string,
  withVision: boolean,
): string {
  return [
    `STEP ACTION: ${step.actionType}`,
    `STEP TITLE: ${step.title}`,
    `STEP DESCRIPTION: ${step.description}`,
    step.selector ? `HINT SELECTOR: ${step.selector}` : null,
    step.value ? `HINT VALUE: ${step.value}` : null,
    withVision
      ? "PAGE CONTEXT: see attached screenshot; accessibility tree below may supplement."
      : "PAGE CONTEXT (accessibility tree):",
    a11ySnapshot || "(empty — use screenshot if provided)",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseTarget(raw: unknown): AiRecordTarget | null {
  const parsed = aiRecordStepSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Resolve a click/type target from the accessibility tree. */
export async function resolveRecordStepA11y(
  step: WorkflowStep,
  a11ySnapshot: string,
): Promise<AiRecordTarget | null> {
  const result = await jsonCompletion({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(step, a11ySnapshot, false),
    model: env.openaiModelRecord,
  });
  return parseTarget(result);
}

/** Resolve a click/type target using a viewport screenshot (vision). */
export async function resolveRecordStepVision(
  step: WorkflowStep,
  a11ySnapshot: string,
  imageBase64: string,
): Promise<AiRecordTarget | null> {
  const result = await jsonCompletionWithImage({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(step, a11ySnapshot, true),
    imageBase64,
    mimeType: "image/jpeg",
    model: env.openaiModelRecord,
  });
  return parseTarget(result);
}
