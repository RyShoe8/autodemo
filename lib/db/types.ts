import type {
  JobStatus,
  JobType,
  Platform,
  ProjectStatus,
  VideoStatus,
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
  applicationMap?: ApplicationMap;
  status: ProjectStatus;
  logoUrl?: string;
  brandColor: string;
  bumperEnabled: boolean;
  bumperDurationSeconds: number;
  bumperUrl?: string;
  bumperTitle: string;
  bumperTagline?: string;
  createdAt: Date;
  /** @deprecated migrated to ProjectVideo */
  prompt?: string;
  voiceOption?: VoiceOption;
  platforms?: Platform[];
  workflow?: WorkflowStep[];
}

export interface ProjectVideoRecord {
  id: string;
  projectId: string;
  name: string;
  prompt: string;
  voiceOption: VoiceOption;
  platforms: Platform[];
  workflow: WorkflowStep[];
  status: VideoStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRecord {
  id: string;
  projectId: string;
  videoId?: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  logs: string[];
  missingCredentials: string[];
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  videoId: string;
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
  brandColor?: string;
  bumperEnabled?: boolean;
  bumperDurationSeconds?: number;
  bumperTitle?: string;
  bumperTagline?: string;
}

export interface CreateProjectVideoInput {
  projectId: string;
  name: string;
  prompt: string;
  voiceOption: VoiceOption;
  platforms: Platform[];
  workflow?: WorkflowStep[];
  status?: VideoStatus;
}

export interface CreateJobInput {
  projectId: string;
  videoId?: string;
  type: JobType;
}

export interface CreateAssetInput {
  projectId: string;
  videoId: string;
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

  // Project videos
  createVideo(input: CreateProjectVideoInput): Promise<ProjectVideoRecord>;
  listVideosByProject(projectId: string): Promise<ProjectVideoRecord[]>;
  getVideo(id: string): Promise<ProjectVideoRecord | null>;
  updateVideo(
    id: string,
    patch: Partial<Omit<ProjectVideoRecord, "id" | "projectId" | "createdAt">>,
  ): Promise<ProjectVideoRecord | null>;
  deleteVideo(id: string): Promise<boolean>;

  // Jobs
  createJob(input: CreateJobInput): Promise<JobRecord>;
  getJob(id: string): Promise<JobRecord | null>;
  listJobsByProject(projectId: string): Promise<JobRecord[]>;
  listJobsByVideo(videoId: string): Promise<JobRecord[]>;
  getLatestJobByProject(projectId: string): Promise<JobRecord | null>;
  getLatestJobByVideo(videoId: string): Promise<JobRecord | null>;
  updateJob(
    id: string,
    patch: Partial<Omit<JobRecord, "id" | "createdAt" | "projectId">>,
  ): Promise<JobRecord | null>;
  appendJobLog(id: string, line: string): Promise<void>;
  claimNextJob(): Promise<JobRecord | null>;

  // Assets
  createAsset(input: CreateAssetInput): Promise<AssetRecord>;
  listAssetsByProject(projectId: string): Promise<AssetRecord[]>;
  listAssetsByVideo(videoId: string): Promise<AssetRecord[]>;
  getAsset(id: string): Promise<AssetRecord | null>;
  updateAsset(
    id: string,
    patch: Partial<Omit<AssetRecord, "id" | "createdAt">>,
  ): Promise<AssetRecord | null>;
  deleteAssetsByVideo(videoId: string): Promise<void>;
}

export function firstStatusForType(type: JobType): JobStatus {
  switch (type) {
    case "discover":
      return "discovering";
    case "build_workflow":
      return "building_workflow";
    case "render_bumper":
      return "rendering";
    case "produce":
    default:
      return "recording";
  }
}
