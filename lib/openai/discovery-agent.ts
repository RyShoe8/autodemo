import { jsonCompletion, jsonCompletionWithImage } from "@/lib/openai/client";
import { env } from "@/lib/env";
import { z } from "zod";
import type { InteractiveElement } from "@/types";

/**
 * Verbs that mutate or leave app state. Exploration must never trigger these:
 * discovery runs against real accounts, and its job is to observe, not act.
 */
export const MUTATION_RISK_PATTERN =
  /delete|remove|archive|deactivate|disable|destroy|revoke|pay|purchase|buy|checkout|subscribe|upgrade|downgrade|invite|send|share|publish|submit|save|confirm|approve|reject|merge|transfer|export|import|upload|sign out|log ?out/i;

export const discoveryActionSchema = z.object({
  action: z.enum(["click", "type", "done"]),
  role: z.string().optional(),
  name: z.string().optional(),
  value: z.string().optional(),
  reason: z.string(),
});

export type DiscoveryAction = z.infer<typeof discoveryActionSchema>;

const SYSTEM_PROMPT = `You are an autonomous web explorer Agent testing a SaaS application.
You are ALREADY AUTHENTICATED with valid credentials. Your goal is to discover as many unique pages, modals, and interactive elements of the application as possible.
You will be given the current URL, a history of elements you have already interacted with, and a list of visible interactive elements on the page.

Return STRICT JSON: { "action": "click" | "type" | "done", "role"?: string, "name"?: string, "value"?: string, "reason": string }

Rules:
1. Pick ONE interactive element to interact with. Use its exact "role" and "name".
2. DO NOT pick an element you have already interacted with in your history, unless absolutely necessary to proceed.
3. DO NOT click destructive actions (e.g., "Delete", "Remove", "Sign out", "Log out").
4. NEVER click third-party authentication ("Continue with Google", "Sign in with Apple/Microsoft/GitHub", "SSO"), registration ("Register", "Sign up", "Create account"), or password-reset ("Forgot password", "Reset password") elements. You are already logged in — these flows waste time and leave the application.
5. NEVER leave the application domain. If the current URL is not on the app's origin, return action "done".
6. If you see a login form or you appear logged out, return action "done" with reason "unauthenticated" — do NOT interact with the login form.
7. If you want to click a button or link, return action: "click".
8. If you want to type into a textbox or search bar, return action: "type" and provide a realistic "value" to type.
9. If there are no new interesting elements to explore and you feel you have exhausted the application, return action: "done".
10. Prioritize elements that likely open modals, navigate to new pages, or create new items (e.g., "New", "Create", "Settings", "Add", "Edit", "Menu").
11. Prefer exploring within the KNOWN MODULES of the application (its primary navigation sections).
12. LOWEST PRIORITY: Avoid public marketing links (e.g., "Pricing", "About Us", "Start Free Trial", "Features").`;

export interface DiscoveryAgentContext {
  origin?: string;
  knownModules?: string[];
}

export async function resolveDiscoveryNextAction(
  currentUrl: string,
  history: string[],
  interactives: InteractiveElement[],
  context?: DiscoveryAgentContext,
): Promise<DiscoveryAction | null> {
  const userPrompt = [
    context?.origin ? `APP ORIGIN (never leave): ${context.origin}` : null,
    `CURRENT URL: ${currentUrl}`,
    context?.knownModules?.length
      ? `KNOWN MODULES (primary navigation): ${context.knownModules.join(", ")}`
      : null,
    `PAST ACTIONS: ${history.length > 0 ? history.join(" -> ") : "None"}`,
    `AVAILABLE INTERACTIVES:`,
    JSON.stringify(interactives.map(i => ({ role: i.role, name: i.name }))),
  ]
    .filter(Boolean)
    .join("\n");

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

/* ------------------------------------------------------------------------- */
/* Per-page exploration (crawler layer 2): observe-only, vision-guided.      */
/* ------------------------------------------------------------------------- */

const PAGE_EXPLORE_SYSTEM_PROMPT = `You are cataloging a SaaS application page for documentation. You are already authenticated.
You see a screenshot of the page plus a list of interactive elements. Pick ONE element that reveals hidden UI worth a screenshot: a modal, dropdown menu, side panel, tab, or expandable section.

Return STRICT JSON: { "action": "click" | "done", "role"?: string, "name"?: string, "reason": string }

HARD RULES — you are in OBSERVE-ONLY mode:
1. NEVER pick anything that mutates data or account state: no Delete/Remove/Archive, no Save/Submit/Confirm/Send, no purchases or plan changes, no invites, no Sign out.
2. NEVER pick login/registration/OAuth/password-reset elements.
3. NEVER pick plain navigation links to other pages — those are crawled separately. Prefer buttons that open overlays ON this page ("New…", "Add…", "Create…", "Filter", "Settings", "Options", "⋯", tab labels). Opening a "New X" dialog is fine — submitting it is forbidden and will not happen.
4. Do not repeat an element listed in ALREADY EXPLORED.
5. If nothing safe and interesting remains, return { "action": "done", "reason": "..." }.
Use the exact "role" and "name" from the element list.`;

export const pageExploreActionSchema = z.object({
  action: z.enum(["click", "done"]),
  role: z.string().optional(),
  name: z.string().optional(),
  reason: z.string(),
});

export type PageExploreAction = z.infer<typeof pageExploreActionSchema>;

/**
 * Pick the next observe-only action on the current page. Sends the screenshot
 * when available so the model can see what it is exploring. Returns null on
 * any model failure and re-checks the mutation blocklist on the way out.
 */
export async function resolvePageExploreAction(opts: {
  url: string;
  routePattern: string;
  interactives: InteractiveElement[];
  explored: string[];
  screenshotBase64?: string;
}): Promise<PageExploreAction | null> {
  const safeInteractives = opts.interactives.filter(
    (i) => !MUTATION_RISK_PATTERN.test(i.name),
  );
  if (safeInteractives.length === 0) return null;

  const user = [
    `PAGE URL: ${opts.url}`,
    `ROUTE PATTERN: ${opts.routePattern}`,
    `ALREADY EXPLORED: ${opts.explored.length > 0 ? opts.explored.join("; ") : "none"}`,
    `INTERACTIVE ELEMENTS:`,
    JSON.stringify(safeInteractives.map((i) => ({ role: i.role, name: i.name }))),
  ].join("\n");

  const raw = opts.screenshotBase64
    ? await jsonCompletionWithImage({
        system: PAGE_EXPLORE_SYSTEM_PROMPT,
        user,
        imageBase64: opts.screenshotBase64,
        model: env.openaiModelRecord,
      })
    : await jsonCompletion({
        system: PAGE_EXPLORE_SYSTEM_PROMPT,
        user,
        model: env.openaiModelRecord,
      });

  const parsed = pageExploreActionSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (
    parsed.data.action === "click" &&
    parsed.data.name &&
    MUTATION_RISK_PATTERN.test(parsed.data.name)
  ) {
    return null;
  }
  return parsed.data;
}
