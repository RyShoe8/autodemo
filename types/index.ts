/**
 * Shared domain types used across the Next.js app and the standalone worker.
 */

export type ProjectStatus =
  | "draft"
  | "discovering"
  | "ready"
  | "failed"
  /** @deprecated legacy values from single-video model */
  | "awaiting_approval"
  | "recording"
  | "rendering"
  | "completed";

export type VideoStatus =
  | "draft"
  | "building_workflow"
  | "awaiting_approval"
  | "recording"
  | "rendering"
  | "completed"
  | "failed";

export type JobStatus =
  | "queued"
  | "discovering"
  | "building_workflow"
  | "awaiting_approval"
  | "recording"
  | "generating_script"
  | "generating_audio"
  | "rendering"
  | "exporting"
  | "completed"
  | "failed";

export type JobType =
  | "discover"
  | "build_workflow"
  | "produce"
  | "render_bumper";

export type Platform =
  | "youtube"
  | "linkedin"
  | "x"
  | "bluesky"
  | "tiktok"
  | "instagram";

export type VoiceOption =
  | "openai_tts"
  | "browser_speech"
  | "elevenlabs"
  | "no_audio";

export type WorkflowActionType =
  | "navigate"
  | "click"
  | "type"
  | "scroll"
  | "wait"
  | "highlight"
  | "screenshot";

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  actionType: WorkflowActionType | string;
  selector?: string;
  url?: string;
  value?: string;
  enabled: boolean;
  order: number;
}

export interface DiscoveredPage {
  url: string;
  title: string;
  screenshot?: string;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface InteractiveElement {
  role: string;
  name: string;
  tag: string;
}

export interface ApplicationMap {
  pages: DiscoveredPage[];
  navigation: string[];
  navLinks?: NavLink[];
  interactives?: InteractiveElement[];
  screenshots: string[];
  uiText: string[];
  /** Favicon fetched during discovery when no user logo exists. */
  discoveredLogoUrl?: string;
}

export interface ScriptScene {
  stepId?: string;
  heading: string;
  narration: string;
  durationSeconds: number;
}

export interface Script {
  title: string;
  intro: string;
  scenes: ScriptScene[];
  outro: string;
}

export interface CapturedScene {
  stepId: string;
  title: string;
  screenshot: string;
  durationSeconds: number;
  videoStartMs?: number;
  videoEndMs?: number;
}

export interface RecordingResult {
  scenes: CapturedScene[];
  screenshots: string[];
  rawVideo?: string;
}

export interface PlatformSpec {
  platform: Platform;
  width: number;
  height: number;
  minSeconds: number;
  maxSeconds: number;
  label: string;
}

export interface AssetSummary {
  id: string;
  projectId: string;
  videoId: string;
  platform: Platform;
  videoUrl: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  captionUrl?: string;
  script?: string;
  createdAt: string;
}

export interface ProjectVideoDTO {
  id: string;
  projectId: string;
  name: string;
  prompt: string;
  voiceOption: VoiceOption;
  platforms: Platform[];
  workflow: WorkflowStep[];
  status: VideoStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  url: string;
  loginEmail: string;
  status: ProjectStatus;
  logoUrl?: string;
  brandColor: string;
  bumperEnabled: boolean;
  bumperDurationSeconds: number;
  bumperUrl?: string;
  bumperTitle: string;
  bumperTagline?: string;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  projectId: string;
  videoId?: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  logs: string[];
  missingCredentials: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  youtube: {
    platform: "youtube",
    width: 1920,
    height: 1080,
    minSeconds: 60,
    maxSeconds: 120,
    label: "YouTube",
  },
  linkedin: {
    platform: "linkedin",
    width: 1920,
    height: 1080,
    minSeconds: 30,
    maxSeconds: 90,
    label: "LinkedIn",
  },
  x: {
    platform: "x",
    width: 1920,
    height: 1080,
    minSeconds: 15,
    maxSeconds: 140,
    label: "X",
  },
  bluesky: {
    platform: "bluesky",
    width: 1080,
    height: 1920,
    minSeconds: 15,
    maxSeconds: 60,
    label: "Bluesky",
  },
  tiktok: {
    platform: "tiktok",
    width: 1080,
    height: 1920,
    minSeconds: 15,
    maxSeconds: 60,
    label: "TikTok",
  },
  instagram: {
    platform: "instagram",
    width: 1080,
    height: 1920,
    minSeconds: 15,
    maxSeconds: 90,
    label: "Instagram",
  },
};

/** Group key for platforms that share the same render dimensions. */
export function exportVariantKey(platform: Platform): string {
  const { width, height } = PLATFORM_SPECS[platform];
  return `${width}x${height}`;
}

/** Max duration (seconds) when trimming a variant shared by multiple platforms. */
export function exportVariantMaxSeconds(platforms: Platform[]): number {
  return Math.min(...platforms.map((p) => PLATFORM_SPECS[p].maxSeconds));
}

export const VOICE_LABELS: Record<VoiceOption, string> = {
  openai_tts: "OpenAI TTS",
  browser_speech: "Browser Speech",
  elevenlabs: "ElevenLabs",
  no_audio: "No Audio",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  discovering: "Discovering",
  ready: "Ready",
  failed: "Failed",
  awaiting_approval: "Awaiting approval",
  recording: "Recording",
  rendering: "Rendering",
  completed: "Completed",
};

export const VIDEO_STATUS_LABELS: Record<VideoStatus, string> = {
  draft: "Draft",
  building_workflow: "Building workflow",
  awaiting_approval: "Awaiting approval",
  recording: "Recording",
  rendering: "Rendering",
  completed: "Completed",
  failed: "Failed",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  discovering: "Discovering application",
  building_workflow: "Building workflow",
  awaiting_approval: "Awaiting approval",
  recording: "Recording",
  generating_script: "Generating script",
  generating_audio: "Generating audio",
  rendering: "Rendering video",
  exporting: "Exporting platforms",
  completed: "Completed",
  failed: "Failed",
};
