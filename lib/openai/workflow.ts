import { jsonCompletion } from "@/lib/openai/client";
import { aiWorkflowSchema } from "@/lib/validation/schemas";
import { uid } from "@/lib/utils";
import type { ApplicationMap, WorkflowStep } from "@/types";
import type { Reporter } from "@/lib/workflow/context";

export interface WorkflowGenInput {
  prompt: string;
  applicationMap: ApplicationMap;
  reporter: Reporter;
}

const SYSTEM_PROMPT = `You are a product marketing expert that designs short demo video walkthroughs of SaaS applications.
Given a video goal and an application map (navigation, page titles, and visible UI text), produce an ordered list of concrete steps a screen-recording bot should perform to demonstrate the requested flow.
Return STRICT JSON of the form: { "steps": [ { "title": string, "description": string, "actionType": "navigate"|"click"|"type"|"scroll"|"highlight"|"wait"|"screenshot", "selector": string|null, "url": string|null, "value": string|null } ] }.
Rules:
- 5 to 9 steps.
- Start with a navigate step to the most relevant page.
- Prefer using the provided navigation labels.
- Keep titles under 8 words and descriptions one sentence.
- Use selectors only if you are confident; otherwise null.`;

function buildUserPrompt(input: WorkflowGenInput): string {
  const { prompt, applicationMap } = input;
  return [
    `VIDEO GOAL:\n${prompt}`,
    `NAVIGATION:\n${applicationMap.navigation.join(", ") || "(none discovered)"}`,
    `PAGE TITLES:\n${applicationMap.pages.map((p) => p.title).join(", ") || "(none)"}`,
    `VISIBLE UI TEXT (sample):\n${applicationMap.uiText.slice(0, 40).join(", ")}`,
  ].join("\n\n");
}

function toWorkflowSteps(
  steps: {
    title: string;
    description: string;
    actionType: string;
    selector?: string | null;
    url?: string | null;
    value?: string | null;
  }[],
): WorkflowStep[] {
  return steps.map((s, i) => ({
    id: uid("step"),
    title: s.title,
    description: s.description ?? "",
    actionType: s.actionType,
    selector: s.selector ?? undefined,
    url: s.url ?? undefined,
    value: s.value ?? undefined,
    enabled: true,
    order: i,
  }));
}

function buildTemplateWorkflow(input: WorkflowGenInput): WorkflowStep[] {
  const nav =
    input.applicationMap.navigation.length > 0
      ? input.applicationMap.navigation
      : ["Dashboard", "Projects", "Reports", "Settings"];

  const raw: Omit<WorkflowStep, "id" | "order" | "enabled">[] = [
    {
      title: "Open the application",
      description: "Navigate to the landing page after signing in.",
      actionType: "navigate",
    },
    ...nav.slice(0, 4).map((section) => ({
      title: `Visit ${section}`,
      description: `Showcase the ${section} area of the product.`,
      actionType: "navigate" as const,
    })),
    {
      title: "Highlight a key feature",
      description: "Draw attention to the most relevant control for the goal.",
      actionType: "highlight",
    },
    {
      title: "Demonstrate an interaction",
      description: "Perform the primary action described in the video goal.",
      actionType: "click",
    },
    {
      title: "Wrap up",
      description: "Return to an overview screen to close the demo.",
      actionType: "scroll",
    },
  ];

  return raw.map((s, i) => ({
    ...s,
    id: uid("step"),
    enabled: true,
    order: i,
  }));
}

/**
 * Generate a proposed workflow from the application map and the user's prompt.
 * Falls back to a deterministic template if OpenAI is unavailable or returns
 * invalid data.
 */
export async function generateWorkflow(
  input: WorkflowGenInput,
): Promise<WorkflowStep[]> {
  const { reporter } = input;
  const result = await jsonCompletion({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input),
  });

  if (result === null) {
    await reporter.missing("OpenAI API key (workflow generation)");
    return buildTemplateWorkflow(input);
  }

  const parsed = aiWorkflowSchema.safeParse(result);
  if (!parsed.success) {
    await reporter.log(
      "OpenAI returned an invalid workflow shape — using template fallback.",
    );
    return buildTemplateWorkflow(input);
  }

  await reporter.log(`OpenAI proposed ${parsed.data.steps.length} workflow steps.`);
  return toWorkflowSteps(parsed.data.steps);
}
