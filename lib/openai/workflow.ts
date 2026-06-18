import { jsonCompletion } from "@/lib/openai/client";
import { enrichWorkflowSteps } from "@/lib/playwright/step-resolver";
import { aiWorkflowSchema } from "@/lib/validation/schemas";
import { uid } from "@/lib/utils";
import { env } from "@/lib/env";
import type { ApplicationMap, WorkflowStep } from "@/types";
import type { Reporter } from "@/lib/workflow/context";

export interface WorkflowGenInput {
  prompt: string;
  applicationMap: ApplicationMap;
  reporter: Reporter;
}

const SYSTEM_PROMPT = `You are a product marketing expert that designs short demo video walkthroughs of SaaS applications.
Given a video goal and an application map (navigation links with URLs, page titles, and visible UI text), produce an ordered list of concrete steps a screen-recording bot should perform to demonstrate the requested flow.
Return STRICT JSON of the form: { "steps": [ { "title": string, "description": string, "actionType": "navigate"|"click"|"type"|"scroll"|"highlight"|"wait"|"screenshot", "selector": string|null, "url": string|null, "value": string|null } ] }.
Rules:
- 5 to 9 steps.
- Start with a navigate step to the most relevant page using a url from NAV LINKS when available.
- At least 3 steps must be "click" or "type" — show real product usage, not static screenshots.
- Avoid bare "screenshot" steps; every step should change UI state.
- For "type" steps, provide a realistic value string to enter.
- Prefer navigation labels and URLs from the provided map.
- Keep titles under 8 words and descriptions one sentence.
- Use CSS selectors only if you are confident; otherwise null (the bot will resolve by label).`;

function buildUserPrompt(input: WorkflowGenInput): string {
  const { prompt, applicationMap } = input;
  const navLinks =
    (applicationMap.navLinks?.length
      ? applicationMap.navLinks
      : applicationMap.pages.map((p) => ({ label: p.title, href: p.url }))
    )
      .slice(0, 12)
      .map((l) => `${l.label} → ${l.href}`)
      .join("\n") || "(none discovered)";

  const interactives =
    applicationMap.interactives
      ?.slice(0, 25)
      .map((i) => `${i.role}: ${i.name}`)
      .join(", ") || "(none)";

  return [
    `VIDEO GOAL:\n${prompt.slice(0, 500)}`,
    `NAV LINKS (label → url):\n${navLinks}`,
    `NAVIGATION LABELS:\n${applicationMap.navigation.slice(0, 12).join(", ") || "(none)"}`,
    `PAGE TITLES:\n${applicationMap.pages.map((p) => p.title).join(", ") || "(none)"}`,
    `INTERACTIVE CONTROLS:\n${interactives}`,
    `VISIBLE UI TEXT (sample):\n${applicationMap.uiText.slice(0, 25).join(", ")}`,
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
  const links =
    input.applicationMap.navLinks ??
    input.applicationMap.pages.map((p) => ({
      label: p.title,
      href: p.url,
    }));

  const nav =
    input.applicationMap.navigation.length > 0
      ? input.applicationMap.navigation
      : ["Dashboard", "Projects", "Reports", "Settings"];

  const raw: Omit<WorkflowStep, "id" | "order" | "enabled">[] = [
    {
      title: "Open the application",
      description: "Navigate to the main dashboard after signing in.",
      actionType: "navigate",
      url: links[0]?.href,
    },
    ...nav.slice(0, 3).map((section, i) => ({
      title: `Visit ${section}`,
      description: `Showcase the ${section} area of the product.`,
      actionType: "navigate" as const,
      url: links[i + 1]?.href ?? links[0]?.href,
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
      title: "Enter sample data",
      description: "Type into a form field to show data entry.",
      actionType: "type",
      value: "Demo project",
    },
    {
      title: "Wrap up",
      description: "Return to an overview screen to close the demo.",
      actionType: "scroll",
    },
  ];

  return enrichWorkflowSteps(
    raw.map((s, i) => ({
      ...s,
      id: uid("step"),
      enabled: true,
      order: i,
    })),
    input.applicationMap,
  );
}

/**
 * Generate a proposed workflow from the application map and the user's prompt.
 * Falls back to a deterministic template if OpenAI is unavailable or returns
 * invalid data.
 */
export async function generateWorkflow(
  input: WorkflowGenInput,
): Promise<WorkflowStep[]> {
  const { reporter, applicationMap } = input;
  const model = env.openaiModelWorkflow;
  await reporter.log(`OpenAI: generating workflow (${model})…`);

  const result = await jsonCompletion({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input),
    model,
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
  return enrichWorkflowSteps(
    toWorkflowSteps(parsed.data.steps),
    applicationMap,
  );
}
