import { jsonCompletion } from "@/lib/openai/client";
import { env } from "@/lib/env";
import { z } from "zod";
import type { InteractiveElement } from "@/types";

export const discoveryActionSchema = z.object({
  action: z.enum(["click", "type", "done"]),
  role: z.string().optional(),
  name: z.string().optional(),
  value: z.string().optional(),
  reason: z.string(),
});

export type DiscoveryAction = z.infer<typeof discoveryActionSchema>;

const SYSTEM_PROMPT = `You are an autonomous web explorer Agent testing a SaaS application.
Your goal is to discover as many unique pages, modals, and interactive elements as possible.
You will be given the current URL, a history of elements you have already interacted with, and a list of visible interactive elements on the page.

Return STRICT JSON: { "action": "click" | "type" | "done", "role"?: string, "name"?: string, "value"?: string, "reason": string }

Rules:
1. Pick ONE interactive element to interact with. Use its exact "role" and "name".
2. DO NOT pick an element you have already interacted with in your history, unless absolutely necessary to proceed.
3. DO NOT click destructive actions (e.g., "Delete", "Remove", "Sign out", "Log out").
4. If you want to click a button or link, return action: "click".
5. If you want to type into a textbox or search bar, return action: "type" and provide a realistic "value" to type.
6. If there are no new interesting elements to explore and you feel you have exhausted the application, return action: "done".
7. Prioritize elements that likely open modals, navigate to new pages, or create new items (e.g., "New", "Create", "Settings", "Add", "Edit", "Menu").
8. HIGHEST PRIORITY: If you see links or buttons leading to the main application interface (e.g., "Dashboard", "Portal", "Console", "App", "Go to App"), click them immediately.
9. LOWEST PRIORITY: Avoid public marketing links (e.g., "Pricing", "About Us", "Start Free Trial", "Features") unless there's nothing else to explore.`;

export async function resolveDiscoveryNextAction(
  currentUrl: string,
  history: string[],
  interactives: InteractiveElement[]
): Promise<DiscoveryAction | null> {
  const userPrompt = [
    `CURRENT URL: ${currentUrl}`,
    `PAST ACTIONS: ${history.length > 0 ? history.join(" -> ") : "None"}`,
    `AVAILABLE INTERACTIVES:`,
    JSON.stringify(interactives.map(i => ({ role: i.role, name: i.name }))),
  ].join("\n");

  const raw = await jsonCompletion({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    model: env.openaiModelRecord,
  });

  const parsed = discoveryActionSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}
