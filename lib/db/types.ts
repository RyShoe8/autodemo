import type {
  JobStatus,
  JobType,
  Platform,
  ProjectStatus,
  VoiceOption,
  WorkflowStep,
  ApplicationMap,
} from "@/types";

export interface ProjectRecord {
  id: string;
  name: string;
  url: string;
  loginEmail: string;
  encryptedPassword: string;
  prompt: string;
  voiceOption: VoiceOption;
  platforms: Platform[];
  workflow: WorkflowStep[];
  applicationMap?: ApplicationMap;
  status: ProjectStatus;
  logoUrl?: string;
  brandColor: string;
  bumperEnabled: boolean;
  bumperDurationSeconds: number;
  createdAt: Date;
}

export interface JobRecord {
  id: string;
  projectId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  logs: string[];
  missingCredentials: string[];
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  platform: Platform;
  videoUrl: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  captionUrl?: string;
  script?: string;
  createdAt: Date;
}

export interface CreateProjectInput {
  name: string;
  url: string;
  loginEmail: string;
  encryptedPassword: string;
  prompt: string;
  voiceOption: VoiceOption;
  platforms: Platform[];
  brandColor?: string;
  bumperEnabled?: boolean;
  bumperDurationSeconds?: number;
}

export interface CreateJobInput {
  projectId: string;
  type: JobType;
}

export interface CreateAssetInput {
  projectId: string;
  platform: Platform;
  videoUrl: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  captionUrl?: string;
  script?: string;
}

export interface DbBackend {
  // Projects
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  listProjects(): Promise<ProjectRecord[]>;
  getProject(id: string): Promise<ProjectRecord | null>;
  updateProject(
    id: string,
    patch: Partial<Omit<ProjectRecord, "id" | "createdAt">>,
  ): Promise<ProjectRecord | null>;
  deleteProject(id: string): Promise<boolean>;

  // Jobs
  createJob(input: CreateJobInput): Promise<JobRecord>;
  getJob(id: string): Promise<JobRecord | null>;
  listJobsByProject(projectId: string): Promise<JobRecord[]>;
  getLatestJobByProject(projectId: string): Promise<JobRecord | null>;
  updateJob(
    id: string,
    patch: Partial<Omit<JobRecord, "id" | "createdAt" | "projectId">>,
  ): Promise<JobRecord | null>;
  appendJobLog(id: string, line: string): Promise<void>;
  claimNextJob(): Promise<JobRecord | null>;

  // Assets
  createAsset(input: CreateAssetInput): Promise<AssetRecord>;
  listAssetsByProject(projectId: string): Promise<AssetRecord[]>;
  getAsset(id: string): Promise<AssetRecord | null>;
  deleteAssetsByProject(projectId: string): Promise<void>;
}

export function firstStatusForType(type: JobType): JobStatus {
  return type === "discover" ? "discovering" : "recording";
}
