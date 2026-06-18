import { z } from "zod";

export const platformEnum = z.enum([
  "youtube",
  "linkedin",
  "x",
  "bluesky",
  "tiktok",
  "instagram",
]);

export const voiceEnum = z.enum([
  "openai_tts",
  "browser_speech",
  "elevenlabs",
  "no_audio",
]);

export const workflowActionEnum = z.enum([
  "navigate",
  "click",
  "type",
  "scroll",
  "wait",
  "highlight",
  "screenshot",
]);

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(120),
  url: z.string().url("Enter a valid URL (including https://)"),
  loginEmail: z
    .string()
    .email("Enter a valid email")
    .or(z.literal(""))
    .default(""),
  loginPassword: z.string().max(500).default(""),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Enter a valid hex color")
    .default("#38bdf8"),
  bumperEnabled: z.boolean().default(true),
  bumperDurationSeconds: z.number().min(2).max(8).default(4),
  bumperTitle: z.string().max(120).optional(),
  bumperTagline: z.string().max(200).optional(),
});

export type CreateProjectValues = z.input<typeof createProjectSchema>;
export type CreateProjectParsed = z.output<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().extend({
  loginPassword: z.string().max(500).optional(),
});

export type UpdateProjectValues = z.input<typeof updateProjectSchema>;
export type UpdateProjectParsed = z.output<typeof updateProjectSchema>;

export const createProjectVideoSchema = z.object({
  name: z.string().min(1, "Video name is required").max(120),
  prompt: z
    .string()
    .min(10, "Describe what the video should demonstrate (min 10 chars)")
    .max(4000),
  platforms: z.array(platformEnum).min(1, "Select at least one platform"),
  voiceOption: voiceEnum.default("openai_tts"),
});

export type CreateProjectVideoValues = z.input<typeof createProjectVideoSchema>;

export const updateProjectVideoSchema = createProjectVideoSchema.partial();

export type UpdateProjectVideoValues = z.input<typeof updateProjectVideoSchema>;

export const workflowStepSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().default(""),
  actionType: z.string().min(1),
  selector: z.string().optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  enabled: z.boolean().default(true),
  order: z.number().int().nonnegative(),
});

export const workflowSchema = z.array(workflowStepSchema);

export const aiWorkflowStepSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  actionType: workflowActionEnum.default("navigate"),
  selector: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  value: z.string().optional().nullable(),
});

export const aiWorkflowSchema = z.object({
  steps: z.array(aiWorkflowStepSchema).min(1),
});

export const scriptSceneSchema = z.object({
  stepId: z.string().optional().nullable(),
  heading: z.string().min(1),
  narration: z.string().min(1),
  durationSeconds: z.number().positive().max(60).default(6),
});

export const scriptSchema = z.object({
  title: z.string().min(1),
  intro: z.string().min(1),
  scenes: z.array(scriptSceneSchema).min(1),
  outro: z.string().min(1),
});

export const updateWorkflowSchema = z.object({
  videoId: z.string().min(1),
  workflow: workflowSchema,
});

export const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const generateSchema = z.object({
  projectId: z.string().min(1),
  videoId: z.string().min(1).optional(),
  type: z
    .enum(["discover", "build_workflow", "produce", "render_bumper"])
    .default("discover"),
  bumperTitle: z.string().max(120).optional(),
  bumperTagline: z.string().max(200).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Enter a valid hex color")
    .optional(),
  bumperDurationSeconds: z.number().min(2).max(8).optional(),
});

export const workflowActionRequestSchema = z.object({
  videoId: z.string().min(1),
  action: z.enum(["approve", "regenerate"]),
  workflow: workflowSchema.optional(),
});
