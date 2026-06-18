import type { Page } from "playwright";
import type { ApplicationMap, InteractiveElement, WorkflowStep } from "@/types";

export interface ResolvedStep {
  url?: string;
  selector?: string;
  value?: string;
  roleName?: string;
  role?: "link" | "button" | "tab";
  /** Matched interactive from discovery catalog. */
  interactiveName?: string;
}

export interface ActionResult {
  success: boolean;
  strategy?: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) {
    if (tb.has(t)) hits += 1;
  }
  return hits;
}

function stepHaystack(step: WorkflowStep): string {
  return `${step.title} ${step.description}`;
}

function bestNavMatch(
  step: WorkflowStep,
  map?: ApplicationMap,
): { label: string; href: string } | undefined {
  const links = map?.navLinks ?? [];
  if (links.length === 0) return undefined;

  const haystack = stepHaystack(step);
  let best: { label: string; href: string; score: number } | undefined;

  for (const link of links) {
    const score = Math.max(
      tokenOverlap(haystack, link.label),
      tokenOverlap(step.title, link.label),
    );
    if (!best || score > best.score) {
      best = { ...link, score };
    }
  }

  return best && best.score > 0 ? best : undefined;
}

function bestPageUrl(
  step: WorkflowStep,
  map?: ApplicationMap,
): string | undefined {
  const pages = map?.pages ?? [];
  if (pages.length === 0) return undefined;

  let best: { url: string; score: number } | undefined;
  const haystack = stepHaystack(step);

  for (const page of pages) {
    const score = Math.max(
      tokenOverlap(haystack, page.title),
      tokenOverlap(step.title, page.title),
    );
    if (!best || score > best.score) {
      best = { url: page.url, score };
    }
  }

  return best && best.score > 0 ? best.url : undefined;
}

function bestInteractiveMatch(
  step: WorkflowStep,
  map?: ApplicationMap,
): InteractiveElement | undefined {
  const items = map?.interactives ?? [];
  if (items.length === 0) return undefined;

  const haystack = stepHaystack(step);
  let best: { item: InteractiveElement; score: number } | undefined;

  for (const item of items) {
    const score = Math.max(
      tokenOverlap(haystack, item.name),
      tokenOverlap(step.title, item.name),
    );
    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best && best.score > 0 ? best.item : undefined;
}

function bestUiTextMatch(
  step: WorkflowStep,
  map?: ApplicationMap,
): string | undefined {
  const texts = map?.uiText ?? [];
  if (texts.length === 0) return undefined;

  const haystack = stepHaystack(step);
  let best: { text: string; score: number } | undefined;

  for (const text of texts) {
    const score = Math.max(
      tokenOverlap(haystack, text),
      tokenOverlap(step.title, text),
    );
    if (!best || score > best.score) {
      best = { text, score };
    }
  }

  return best && best.score > 0 ? best.text : undefined;
}

function roleFromTag(tag: string): "link" | "button" | "tab" {
  if (tag === "a") return "link";
  if (tag === "tab") return "tab";
  return "button";
}

/** Resolve missing url/selector/value on a workflow step using the application map. */
export function resolveStep(
  step: WorkflowStep,
  map?: ApplicationMap,
): ResolvedStep {
  const resolved: ResolvedStep = {
    url: step.url,
    selector: step.selector,
    value: step.value,
  };

  const nav = bestNavMatch(step, map);
  const interactive = bestInteractiveMatch(step, map);
  const uiText = bestUiTextMatch(step, map);

  if (step.actionType === "navigate") {
    if (!resolved.url) {
      resolved.url = bestPageUrl(step, map) ?? nav?.href;
    }
    return resolved;
  }

  if (step.actionType === "click" || step.actionType === "highlight") {
    if (!resolved.selector && interactive) {
      resolved.role = roleFromTag(interactive.tag);
      resolved.roleName = interactive.name;
      resolved.interactiveName = interactive.name;
    } else if (!resolved.selector && nav) {
      resolved.role = "link";
      resolved.roleName = nav.label;
    } else if (!resolved.selector && uiText) {
      resolved.role = "button";
      resolved.roleName = uiText;
    } else if (!resolved.selector) {
      resolved.role = "button";
      resolved.roleName = step.title;
    }
    return resolved;
  }

  if (step.actionType === "type") {
    if (!resolved.value) {
      resolved.value = step.description?.slice(0, 40) || "Demo input";
    }
    return resolved;
  }

  return resolved;
}

/** Apply enrichWorkflowSteps to attach urls from the application map. */
export function enrichWorkflowSteps(
  steps: WorkflowStep[],
  map?: ApplicationMap,
): WorkflowStep[] {
  return steps.map((step) => {
    const resolved = resolveStep(step, map);
    return {
      ...step,
      url: step.url ?? resolved.url,
      selector: step.selector ?? resolved.selector,
      value: step.value ?? resolved.value,
    };
  });
}

async function tryClickLocator(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  strategy: string,
): Promise<ActionResult> {
  if ((await locator.count()) === 0) return { success: false };
  try {
    await locator.first().click({ timeout: 8000 });
    return { success: true, strategy };
  } catch {
    return { success: false };
  }
}

/** Execute a resolved click with a cascade of locator strategies. */
export async function clickResolved(
  page: Page,
  resolved: ResolvedStep,
  step?: WorkflowStep,
  map?: ApplicationMap,
): Promise<ActionResult> {
  if (resolved.selector) {
    const result = await tryClickLocator(
      page,
      page.locator(resolved.selector),
      "css selector",
    );
    if (result.success) return result;
  }

  if (resolved.role && resolved.roleName) {
    const result = await tryClickLocator(
      page,
      page.getByRole(resolved.role, { name: resolved.roleName }),
      `getByRole(${resolved.role})`,
    );
    if (result.success) return result;

    const partial = await tryClickLocator(
      page,
      page.getByRole(resolved.role, { name: new RegExp(resolved.roleName, "i") }),
      `getByRole(${resolved.role}, partial)`,
    );
    if (partial.success) return partial;
  }

  const label = step?.title ?? resolved.roleName;
  const interactive = step ? bestInteractiveMatch(step, map) : undefined;
  if (interactive) {
    const role = roleFromTag(interactive.tag);
    const result = await tryClickLocator(
      page,
      page.getByRole(role, { name: interactive.name }),
      "getByRole(interactive catalog)",
    );
    if (result.success) return result;
  }

  if (label) {
    for (const role of ["button", "link", "tab"] as const) {
      const result = await tryClickLocator(
        page,
        page.getByRole(role, { name: new RegExp(label.slice(0, 30), "i") }),
        `getByRole(${role}, step title)`,
      );
      if (result.success) return result;
    }

    const textResult = await tryClickLocator(
      page,
      page.getByText(label, { exact: false }),
      "getByText(step title)",
    );
    if (textResult.success) return textResult;
  }

  const uiMatch = step ? bestUiTextMatch(step, map) : undefined;
  if (uiMatch) {
    const result = await tryClickLocator(
      page,
      page.getByText(uiMatch, { exact: false }),
      "getByText(uiText match)",
    );
    if (result.success) return result;
  }

  return { success: false };
}

/** Execute a resolved type action with visible keystrokes. */
export async function typeResolved(
  page: Page,
  resolved: ResolvedStep,
  step?: WorkflowStep,
): Promise<ActionResult> {
  const text = resolved.value ?? "Demo input";
  const label = step?.title ?? step?.description ?? "";

  const strategies: { locator: ReturnType<Page["locator"]>; name: string }[] =
    [];

  if (resolved.selector) {
    strategies.push({
      locator: page.locator(resolved.selector),
      name: "css selector",
    });
  }
  strategies.push({
    locator: page.locator('[role="dialog"] input:not([type="hidden"])'),
    name: "dialog input",
  });
  strategies.push({
    locator: page.locator('[role="dialog"] textarea'),
    name: "dialog textarea",
  });
  strategies.push({
    locator: page.locator('[role="dialog"] [contenteditable="true"]'),
    name: "dialog contenteditable",
  });
  strategies.push({
    locator: page.getByRole("textbox"),
    name: "getByRole(textbox)",
  });
  if (label) {
    strategies.push({
      locator: page.getByLabel(new RegExp(label.slice(0, 40), "i")),
      name: "getByLabel",
    });
    strategies.push({
      locator: page.getByPlaceholder(new RegExp(label.slice(0, 40), "i")),
      name: "getByPlaceholder",
    });
  }
  strategies.push({
    locator: page.locator(
      'input:not([type="hidden"]):visible, textarea:visible, [contenteditable="true"]:visible',
    ),
    name: "visible input/textarea",
  });

  for (const { locator, name } of strategies) {
    if ((await locator.count()) === 0) continue;
    try {
      const target = locator.first();
      await target.click({ timeout: 8000 }).catch(() => {});
      const isEditable = await target
        .evaluate((el) => {
          const html = el as HTMLElement;
          return (
            html.isContentEditable ||
            html.getAttribute("contenteditable") === "true"
          );
        })
        .catch(() => false);

      if (isEditable) {
        await target.pressSequentially(text, { delay: 40 });
      } else {
        await target.fill("");
        await target.pressSequentially(text, { delay: 40 });
      }
      return { success: true, strategy: name };
    } catch {
      /* try next */
    }
  }

  return { success: false };
}

/** Outline a resolved element for highlight steps. */
export async function highlightResolved(
  page: Page,
  resolved: ResolvedStep,
  step?: WorkflowStep,
  map?: ApplicationMap,
): Promise<ActionResult> {
  const outline = async (locator: ReturnType<Page["locator"]>, strategy: string) => {
    if ((await locator.count()) === 0) return null;
    await locator
      .first()
      .evaluate((el) => {
        (el as HTMLElement).style.outline = "3px solid #38bdf8";
        (el as HTMLElement).scrollIntoView({ block: "center" });
      })
      .catch(() => {});
    return strategy;
  };

  if (resolved.selector) {
    const s = await outline(page.locator(resolved.selector), "css selector");
    if (s) return { success: true, strategy: s };
  }

  if (resolved.role && resolved.roleName) {
    const s = await outline(
      page.getByRole(resolved.role, { name: resolved.roleName }),
      `getByRole(${resolved.role})`,
    );
    if (s) return { success: true, strategy: s };
  }

  const label = step?.title ?? resolved.roleName;
  if (label) {
    for (const role of ["button", "link", "tab"] as const) {
      const s = await outline(
        page.getByRole(role, { name: new RegExp(label.slice(0, 30), "i") }),
        `getByRole(${role}, step title)`,
      );
      if (s) return { success: true, strategy: s };
    }
  }

  const interactive = step ? bestInteractiveMatch(step, map) : undefined;
  if (interactive) {
    const s = await outline(
      page.getByRole(roleFromTag(interactive.tag), { name: interactive.name }),
      "getByRole(interactive catalog)",
    );
    if (s) return { success: true, strategy: s };
  }

  return { success: false };
}
