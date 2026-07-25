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
import type {
  AuditAction,
  ConnectSessionStatus,
  OrgRole,
} from "@/types/tenancy";

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  /** Wrapped (never raw) tenant data key. Empty once revoked. */
  wrappedDek: string;
  kekId: string;
  dekId: string;
  createdAt: Date;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  createdAt: Date;
}

export interface MembershipRecord {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  createdAt: Date;
}

export interface AuditEventRecord {
  id: string;
  orgId: string;
  userId?: string;
  actorEmail?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean>;
  ip?: string;
  createdAt: Date;
}

export interface ConnectSessionRecord {
  id: string;
  orgId: string;
  projectId: string;
  userId?: string;
  tokenHash: string;
  status: ConnectSessionStatus;
  startUrl: string;
  error?: string;
  expiresAt: Date;
  capturedAt?: Date;
  createdAt: Date;
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  wrappedDek: string;
  kekId: string;
  dekId: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string;
}

export interface CreateMembershipInput {
  orgId: string;
  userId: string;
  role: OrgRole;
}

export interface CreateAuditEventInput {
  orgId: string;
  userId?: string;
  actorEmail?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean>;
  ip?: string;
}

export interface CreateConnectSessionInput {
  orgId: string;
  projectId: string;
  userId?: string;
  tokenHash: string;
  startUrl: string;
  expiresAt: Date;
}

export interface ProjectRecord {
  id: string;
  /** Owning organization. Every project query is scoped by this. */
  orgId: string;
  name: string;
  url: string;
  loginEmail: string;
  encryptedPassword: string;
  /** Encrypted Playwright storageState JSON (cookies + localStorage). */
  encryptedStorageState?: string;
  storageStateSavedAt?: Date;
  discoveryMaxPages?: number;
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
  orgId: string;
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
  // Organizations
  createOrg(input: CreateOrgInput): Promise<OrgRecord>;
  getOrg(id: string): Promise<OrgRecord | null>;
  getOrgBySlug(slug: string): Promise<OrgRecord | null>;
  listOrgs(): Promise<OrgRecord[]>;
  updateOrg(
    id: string,
    patch: Partial<Omit<OrgRecord, "id" | "createdAt">>,
  ): Promise<OrgRecord | null>;

  // Users
  createUser(input: CreateUserInput): Promise<UserRecord>;
  getUser(id: string): Promise<UserRecord | null>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  countUsers(): Promise<number>;

  // Memberships
  createMembership(input: CreateMembershipInput): Promise<MembershipRecord>;
  getMembership(orgId: string, userId: string): Promise<MembershipRecord | null>;
  listMembershipsByUser(userId: string): Promise<MembershipRecord[]>;
  listMembershipsByOrg(orgId: string): Promise<MembershipRecord[]>;
  updateMembership(
    id: string,
    patch: Partial<Pick<MembershipRecord, "role">>,
  ): Promise<MembershipRecord | null>;
  deleteMembership(id: string): Promise<boolean>;

  // Audit log (append-only)
  createAuditEvent(input: CreateAuditEventInput): Promise<AuditEventRecord>;
  listAuditEvents(orgId: string, limit?: number): Promise<AuditEventRecord[]>;

  // Remote-login sessions
  createConnectSession(
    input: CreateConnectSessionInput,
  ): Promise<ConnectSessionRecord>;
  getConnectSession(id: string): Promise<ConnectSessionRecord | null>;
  getConnectSessionByTokenHash(
    tokenHash: string,
  ): Promise<ConnectSessionRecord | null>;
  updateConnectSession(
    id: string,
    patch: Partial<Omit<ConnectSessionRecord, "id" | "orgId" | "createdAt">>,
  ): Promise<ConnectSessionRecord | null>;
  claimPendingConnectSession(): Promise<ConnectSessionRecord | null>;
  expireStaleConnectSessions(): Promise<number>;

  // Projects
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  listProjects(orgId: string): Promise<ProjectRecord[]>;
  /** Pre-tenancy rows with no owning org — used only by the migration. */
  listProjectsWithoutOrg(): Promise<ProjectRecord[]>;
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
  listInProgressJobs(): Promise<JobRecord[]>;

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
    case "recapture":
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
