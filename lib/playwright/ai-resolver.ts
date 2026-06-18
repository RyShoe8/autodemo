import type { Page } from "playwright";
import { env } from "@/lib/env";
import {
  resolveRecordStepA11y,
  resolveRecordStepVision,
  type AiRecordTarget,
} from "@/lib/openai/record-step";
import { captureA11ySnapshot, captureStepScreenshot } from "@/lib/playwright/page-context";
import type { ActionResult } from "@/lib/playwright/step-resolver";
import type { WorkflowStep } from "@/types";

export type RecordAiMode = "failure_only" | "modal_steps" | "all_interactive";

const MODAL_PRONE_RE = /\b(create|add|new|edit|submit|open|save|delete|invite|upload)\b/i;

export function isModalProneStep(
  step: WorkflowStep,
  previousStep?: WorkflowStep,
): boolean {
  if (step.actionType === "type" && previousStep?.actionType === "click") {
    return true;
  }
  if (step.actionType !== "click") return false;
  const haystack = `${step.title} ${step.description}`;
  return MODAL_PRONE_RE.test(haystack);
}

export function shouldUseAiFallback(
  step: WorkflowStep,
  previousStep: WorkflowStep | undefined,
  mode: RecordAiMode,
): boolean {
  const interactive =
    step.actionType === "click" || step.actionType === "type";
  if (!interactive) return false;
  switch (mode) {
    case "failure_only":
      return true;
    case "all_interactive":
      return true;
    case "modal_steps":
      return isModalProneStep(step, previousStep);
    default:
      return false;
  }
}

export function buildLocatorFromAiTarget(
  page: Page,
  target: AiRecordTarget,
): ReturnType<Page["locator"]> | null {
  switch (target.strategy) {
    case "role": {
      if (!target.role) return null;
      return page.getByRole(target.role, { name: target.name, exact: false });
    }
    case "label":
      return page.getByLabel(target.name, { exact: false });
    case "placeholder":
      return page.getByPlaceholder(target.name, { exact: false });
    case "text":
      return page.getByText(target.name, { exact: false });
    case "css":
      if (target.selector) return page.locator(target.selector);
      return null;
    default:
      return null;
  }
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

async function tryTypeLocator(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  text: string,
  strategy: string,
): Promise<ActionResult> {
  if ((await locator.count()) === 0) return { success: false };
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
    return { success: true, strategy };
  } catch {
    return { success: false };
  }
}

export interface AiResolveResult extends ActionResult {
  expectModal?: boolean;
}

async function executeAiTarget(
  page: Page,
  step: WorkflowStep,
  target: AiRecordTarget,
  strategyLabel: string,
): Promise<AiResolveResult> {
  const locator = buildLocatorFromAiTarget(page, target);
  if (!locator) return { success: false };

  if (step.actionType === "type") {
    const text = target.value ?? step.value ?? "Demo input";
    const result = await tryTypeLocator(page, locator, text, strategyLabel);
    return { ...result, expectModal: target.expectModal };
  }

  const result = await tryClickLocator(page, locator, strategyLabel);
  return { ...result, expectModal: target.expectModal };
}

/** Resolve and execute a step via OpenAI (a11y first, optional vision). */
export async function resolveAndExecuteViaAi(
  page: Page,
  step: WorkflowStep,
  useVision: boolean,
): Promise<AiResolveResult> {
  const a11y = await captureA11ySnapshot(page);
  const a11yTarget = await resolveRecordStepA11y(step, a11y);
  if (a11yTarget) {
    const result = await executeAiTarget(page, step, a11yTarget, "openai-a11y");
    if (result.success) return result;
  }

  if (!useVision) return { success: false };

  const screenshot = await captureStepScreenshot(page);
  const visionTarget = await resolveRecordStepVision(
    step,
    a11y,
    screenshot.toString("base64"),
  );
  if (!visionTarget) return { success: false };
  return executeAiTarget(page, step, visionTarget, "openai-vision");
}

export function recordAiMode(): RecordAiMode {
  return env.recordAiMode;
}

export function recordUseVision(): boolean {
  return env.recordUseVision;
}
