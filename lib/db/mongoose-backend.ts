import { connectMongo } from "@/lib/mongodb";
import { ProjectModel } from "@/models/Project";
import { ProjectVideoModel } from "@/models/ProjectVideo";
import { JobModel } from "@/models/Job";
import { VideoAssetModel } from "@/models/VideoAsset";
import { OrgModel } from "@/models/Org";
import { UserModel } from "@/models/User";
import { MembershipModel } from "@/models/Membership";
import { AuditEventModel } from "@/models/AuditEvent";
import { ConnectSessionModel } from "@/models/ConnectSession";
import type {
  AssetRecord,
  AuditEventRecord,
  ConnectSessionRecord,
  CreateAssetInput,
  CreateAuditEventInput,
  CreateConnectSessionInput,
  CreateJobInput,
  CreateMembershipInput,
  CreateOrgInput,
  CreateProjectInput,
  CreateProjectVideoInput,
  CreateUserInput,
  DbBackend,
  JobRecord,
  MembershipRecord,
  OrgRecord,
  ProjectRecord,
  ProjectVideoRecord,
  UserRecord,
} from "@/lib/db/types";
import type { AuditAction, ConnectSessionStatus, OrgRole } from "@/types/tenancy";
import { firstStatusForType } from "@/lib/db/types";
import { ACTIVE_JOB_STATUSES } from "@/lib/workflow/job-status";
import type {
  Platform,
  ProjectStatus,
  VideoStatus,
  VoiceOption,
  WorkflowStep,
  ApplicationMap,
} from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapOrg(doc: any): OrgRecord {
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    wrappedDek: doc.wrappedDek ?? "",
    kekId: doc.kekId ?? "",
    dekId: doc.dekId ?? "",
    createdAt: doc.createdAt ?? new Date(),
  };
}

function mapUser(doc: any): UserRecord {
  return {
    id: String(doc._id),
    email: doc.email,
    passwordHash: doc.passwordHash,
    name: doc.name ?? undefined,
    createdAt: doc.createdAt ?? new Date(),
  };
}

function mapMembership(doc: any): MembershipRecord {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    userId: String(doc.userId),
    role: doc.role as OrgRole,
    createdAt: doc.createdAt ?? new Date(),
  };
}

function mapAuditEvent(doc: any): AuditEventRecord {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    userId: doc.userId ? String(doc.userId) : undefined,
    actorEmail: doc.actorEmail ?? undefined,
    action: doc.action as AuditAction,
    targetType: doc.targetType ?? undefined,
    targetId: doc.targetId ?? undefined,
    metadata: doc.metadata ?? undefined,
    ip: doc.ip ?? undefined,
    createdAt: doc.createdAt ?? new Date(),
  };
}

function mapConnectSession(doc: any): ConnectSessionRecord {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    projectId: String(doc.projectId),
    userId: doc.userId ? String(doc.userId) : undefined,
    tokenHash: doc.tokenHash,
    status: doc.status as ConnectSessionStatus,
    startUrl: doc.startUrl,
    error: doc.error ?? undefined,
    expiresAt: doc.expiresAt,
    capturedAt: doc.capturedAt ?? undefined,
    createdAt: doc.createdAt ?? new Date(),
  };
}

function mapProject(doc: any): ProjectRecord {
  return {
    id: String(doc._id),
    orgId: doc.orgId ? String(doc.orgId) : "",
    name: doc.name,
    url: doc.url,
    loginEmail: doc.loginEmail ?? "",
    encryptedPassword: doc.encryptedPassword ?? "",
    encryptedStorageState: doc.encryptedStorageState ?? undefined,
    storageStateSavedAt: doc.storageStateSavedAt ?? undefined,
    discoveryMaxPages: doc.discoveryMaxPages ?? undefined,
    applicationMap: doc.applicationMap as ApplicationMap | undefined,
    logoUrl: doc.logoUrl ?? undefined,
    brandColor: doc.brandColor ?? "#38bdf8",
    bumperEnabled: doc.bumperEnabled !== false,
    bumperDurationSeconds: doc.bumperDurationSeconds ?? 4,
    bumperUrl: doc.bumperUrl ?? undefined,
    bumperTitle: doc.bumperTitle ?? doc.name,
    bumperTagline: doc.bumperTagline ?? undefined,
    status: doc.status as ProjectStatus,
    createdAt: doc.createdAt ?? new Date(),
    prompt: doc.prompt,
    voiceOption: doc.voiceOption as VoiceOption | undefined,
    platforms: (doc.platforms ?? []) as Platform[],
    workflow: (doc.workflow ?? []) as WorkflowStep[],
  };
}

function mapVideo(doc: any): ProjectVideoRecord {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    name: doc.name,
    prompt: doc.prompt,
    voiceOption: doc.voiceOption as VoiceOption,
    platforms: (doc.platforms ?? []) as Platform[],
    workflow: (doc.workflow ?? []) as WorkflowStep[],
    status: doc.status as VideoStatus,
    createdAt: doc.createdAt ?? new Date(),
    updatedAt: doc.updatedAt ?? doc.createdAt ?? new Date(),
  };
}

function mapJob(doc: any): JobRecord {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    videoId: doc.videoId ? String(doc.videoId) : undefined,
    type: doc.type,
    status: doc.status,
    progress: doc.progress ?? 0,
    logs: doc.logs ?? [],
    missingCredentials: doc.missingCredentials ?? [],
    error: doc.error,
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt ?? new Date(),
    updatedAt: doc.updatedAt ?? doc.createdAt ?? new Date(),
  };
}

function mapAsset(doc: any): AssetRecord {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    videoId: doc.videoId ? String(doc.videoId) : "",
    platform: doc.platform,
    videoUrl: doc.videoUrl,
    audioUrl: doc.audioUrl,
    thumbnailUrl: doc.thumbnailUrl,
    captionUrl: doc.captionUrl,
    script: doc.script,
    createdAt: doc.createdAt ?? new Date(),
  };
}

export class MongooseBackend implements DbBackend {
  /* ----------------------------- Organizations ---------------------------- */

  async createOrg(input: CreateOrgInput): Promise<OrgRecord> {
    await connectMongo();
    const doc = await OrgModel.create(input);
    return mapOrg(doc.toObject());
  }

  async getOrg(id: string): Promise<OrgRecord | null> {
    await connectMongo();
    const doc = await OrgModel.findById(id).lean();
    return doc ? mapOrg(doc) : null;
  }

  async getOrgBySlug(slug: string): Promise<OrgRecord | null> {
    await connectMongo();
    const doc = await OrgModel.findOne({ slug }).lean();
    return doc ? mapOrg(doc) : null;
  }

  async listOrgs(): Promise<OrgRecord[]> {
    await connectMongo();
    const docs = await OrgModel.find().sort({ createdAt: 1 }).lean();
    return docs.map(mapOrg);
  }

  async updateOrg(
    id: string,
    patch: Partial<Omit<OrgRecord, "id" | "createdAt">>,
  ): Promise<OrgRecord | null> {
    await connectMongo();
    const doc = await OrgModel.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    return doc ? mapOrg(doc) : null;
  }

  /* --------------------------------- Users -------------------------------- */

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    await connectMongo();
    const doc = await UserModel.create({
      ...input,
      email: input.email.toLowerCase(),
    });
    return mapUser(doc.toObject());
  }

  async getUser(id: string): Promise<UserRecord | null> {
    await connectMongo();
    const doc = await UserModel.findById(id).lean();
    return doc ? mapUser(doc) : null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    await connectMongo();
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean();
    return doc ? mapUser(doc) : null;
  }

  async countUsers(): Promise<number> {
    await connectMongo();
    return UserModel.countDocuments();
  }

  /* ------------------------------ Memberships ----------------------------- */

  async createMembership(
    input: CreateMembershipInput,
  ): Promise<MembershipRecord> {
    await connectMongo();
    const doc = await MembershipModel.create(input);
    return mapMembership(doc.toObject());
  }

  async getMembership(
    orgId: string,
    userId: string,
  ): Promise<MembershipRecord | null> {
    await connectMongo();
    const doc = await MembershipModel.findOne({ orgId, userId }).lean();
    return doc ? mapMembership(doc) : null;
  }

  async listMembershipsByUser(userId: string): Promise<MembershipRecord[]> {
    await connectMongo();
    const docs = await MembershipModel.find({ userId })
      .sort({ createdAt: 1 })
      .lean();
    return docs.map(mapMembership);
  }

  async listMembershipsByOrg(orgId: string): Promise<MembershipRecord[]> {
    await connectMongo();
    const docs = await MembershipModel.find({ orgId })
      .sort({ createdAt: 1 })
      .lean();
    return docs.map(mapMembership);
  }

  async updateMembership(
    id: string,
    patch: Partial<Pick<MembershipRecord, "role">>,
  ): Promise<MembershipRecord | null> {
    await connectMongo();
    const doc = await MembershipModel.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    return doc ? mapMembership(doc) : null;
  }

  async deleteMembership(id: string): Promise<boolean> {
    await connectMongo();
    const res = await MembershipModel.findByIdAndDelete(id);
    return Boolean(res);
  }

  /* ------------------------------- Audit log ------------------------------ */

  async createAuditEvent(
    input: CreateAuditEventInput,
  ): Promise<AuditEventRecord> {
    await connectMongo();
    const doc = await AuditEventModel.create(input);
    return mapAuditEvent(doc.toObject());
  }

  async listAuditEvents(
    orgId: string,
    limit = 200,
  ): Promise<AuditEventRecord[]> {
    await connectMongo();
    const docs = await AuditEventModel.find({ orgId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.map(mapAuditEvent);
  }

  /* --------------------------- Connect sessions --------------------------- */

  async createConnectSession(
    input: CreateConnectSessionInput,
  ): Promise<ConnectSessionRecord> {
    await connectMongo();
    const doc = await ConnectSessionModel.create({ ...input, status: "pending" });
    return mapConnectSession(doc.toObject());
  }

  async getConnectSession(id: string): Promise<ConnectSessionRecord | null> {
    await connectMongo();
    const doc = await ConnectSessionModel.findById(id).lean();
    return doc ? mapConnectSession(doc) : null;
  }

  async getConnectSessionByTokenHash(
    tokenHash: string,
  ): Promise<ConnectSessionRecord | null> {
    await connectMongo();
    const doc = await ConnectSessionModel.findOne({ tokenHash }).lean();
    return doc ? mapConnectSession(doc) : null;
  }

  async updateConnectSession(
    id: string,
    patch: Partial<Omit<ConnectSessionRecord, "id" | "orgId" | "createdAt">>,
  ): Promise<ConnectSessionRecord | null> {
    await connectMongo();
    const doc = await ConnectSessionModel.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    return doc ? mapConnectSession(doc) : null;
  }

  async claimPendingConnectSession(): Promise<ConnectSessionRecord | null> {
    await connectMongo();
    const doc = await ConnectSessionModel.findOneAndUpdate(
      { status: "pending", expiresAt: { $gt: new Date() } },
      { $set: { status: "live" } },
      { returnDocument: "after", sort: { createdAt: 1 } },
    ).lean();
    return doc ? mapConnectSession(doc) : null;
  }

  async expireStaleConnectSessions(): Promise<number> {
    await connectMongo();
    const res = await ConnectSessionModel.updateMany(
      { status: { $in: ["pending", "live"] }, expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } },
    );
    return res.modifiedCount ?? 0;
  }

  /* -------------------------------- Projects ------------------------------ */

  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    await connectMongo();
    const doc = await ProjectModel.create({
      ...input,
      bumperTitle: input.bumperTitle ?? input.name,
      status: "draft",
    });
    return mapProject(doc.toObject());
  }

  async listProjects(orgId: string): Promise<ProjectRecord[]> {
    await connectMongo();
    const docs = await ProjectModel.find({ orgId }).sort({ createdAt: -1 }).lean();
    return docs.map(mapProject);
  }

  async listProjectsWithoutOrg(): Promise<ProjectRecord[]> {
    await connectMongo();
    const docs = await ProjectModel.find({
      $or: [{ orgId: { $exists: false } }, { orgId: null }],
    }).lean();
    return docs.map(mapProject);
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    await connectMongo();
    const doc = await ProjectModel.findById(id).lean();
    return doc ? mapProject(doc) : null;
  }

  async updateProject(
    id: string,
    patch: Partial<Omit<ProjectRecord, "id" | "createdAt">>,
  ): Promise<ProjectRecord | null> {
    await connectMongo();
    const doc = await ProjectModel.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    return doc ? mapProject(doc) : null;
  }

  async deleteProject(id: string): Promise<boolean> {
    await connectMongo();
    const res = await ProjectModel.findByIdAndDelete(id);
    await JobModel.deleteMany({ projectId: id });
    await VideoAssetModel.deleteMany({ projectId: id });
    await ProjectVideoModel.deleteMany({ projectId: id });
    return Boolean(res);
  }

  async createVideo(input: CreateProjectVideoInput): Promise<ProjectVideoRecord> {
    await connectMongo();
    const doc = await ProjectVideoModel.create({
      projectId: input.projectId,
      name: input.name,
      prompt: input.prompt,
      voiceOption: input.voiceOption,
      platforms: input.platforms,
      workflow: input.workflow ?? [],
      status: input.status ?? "draft",
    });
    return mapVideo(doc.toObject());
  }

  async listVideosByProject(projectId: string): Promise<ProjectVideoRecord[]> {
    await connectMongo();
    const docs = await ProjectVideoModel.find({ projectId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(mapVideo);
  }

  async getVideo(id: string): Promise<ProjectVideoRecord | null> {
    await connectMongo();
    const doc = await ProjectVideoModel.findById(id).lean();
    return doc ? mapVideo(doc) : null;
  }

  async updateVideo(
    id: string,
    patch: Partial<Omit<ProjectVideoRecord, "id" | "projectId" | "createdAt">>,
  ): Promise<ProjectVideoRecord | null> {
    await connectMongo();
    const doc = await ProjectVideoModel.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    return doc ? mapVideo(doc) : null;
  }

  async deleteVideo(id: string): Promise<boolean> {
    await connectMongo();
    const res = await ProjectVideoModel.findByIdAndDelete(id);
    await VideoAssetModel.deleteMany({ videoId: id });
    await JobModel.deleteMany({ videoId: id });
    return Boolean(res);
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    await connectMongo();
    const doc = await JobModel.create({
      projectId: input.projectId,
      videoId: input.videoId,
      type: input.type,
      status: "queued",
      progress: 0,
      logs: [],
      missingCredentials: [],
    });
    return mapJob(doc.toObject());
  }

  async getJob(id: string): Promise<JobRecord | null> {
    await connectMongo();
    const doc = await JobModel.findById(id).lean();
    return doc ? mapJob(doc) : null;
  }

  async listJobsByProject(projectId: string): Promise<JobRecord[]> {
    await connectMongo();
    const docs = await JobModel.find({ projectId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(mapJob);
  }

  async listJobsByVideo(videoId: string): Promise<JobRecord[]> {
    await connectMongo();
    const docs = await JobModel.find({ videoId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(mapJob);
  }

  async getLatestJobByProject(projectId: string): Promise<JobRecord | null> {
    await connectMongo();
    const doc = await JobModel.findOne({ projectId })
      .sort({ createdAt: -1 })
      .lean();
    return doc ? mapJob(doc) : null;
  }

  async getLatestJobByVideo(videoId: string): Promise<JobRecord | null> {
    await connectMongo();
    const doc = await JobModel.findOne({ videoId })
      .sort({ createdAt: -1 })
      .lean();
    return doc ? mapJob(doc) : null;
  }

  async updateJob(
    id: string,
    patch: Partial<Omit<JobRecord, "id" | "createdAt" | "projectId">>,
  ): Promise<JobRecord | null> {
    await connectMongo();
    const doc = await JobModel.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    return doc ? mapJob(doc) : null;
  }

  async appendJobLog(id: string, line: string): Promise<void> {
    await connectMongo();
    await JobModel.findByIdAndUpdate(id, { $push: { logs: line } });
  }

  async claimNextJob(): Promise<JobRecord | null> {
    await connectMongo();
    const queued = await JobModel.findOne({ status: "queued" })
      .sort({ createdAt: 1 })
      .lean();
    if (!queued) return null;
    const doc = await JobModel.findOneAndUpdate(
      { _id: queued._id, status: "queued" },
      {
        $set: {
          status: firstStatusForType(queued.type as JobRecord["type"]),
          startedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    ).lean();
    return doc ? mapJob(doc) : null;
  }

  async listInProgressJobs(): Promise<JobRecord[]> {
    await connectMongo();
    const statuses = ACTIVE_JOB_STATUSES.filter((s) => s !== "queued");
    const docs = await JobModel.find({ status: { $in: statuses } })
      .sort({ updatedAt: 1 })
      .lean();
    return docs.map(mapJob);
  }

  async createAsset(input: CreateAssetInput): Promise<AssetRecord> {
    await connectMongo();
    const doc = await VideoAssetModel.create(input);
    return mapAsset(doc.toObject());
  }

  async listAssetsByProject(projectId: string): Promise<AssetRecord[]> {
    await connectMongo();
    const docs = await VideoAssetModel.find({ projectId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(mapAsset);
  }

  async listAssetsByVideo(videoId: string): Promise<AssetRecord[]> {
    await connectMongo();
    const docs = await VideoAssetModel.find({ videoId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(mapAsset);
  }

  async getAsset(id: string): Promise<AssetRecord | null> {
    await connectMongo();
    const doc = await VideoAssetModel.findById(id).lean();
    return doc ? mapAsset(doc) : null;
  }

  async updateAsset(
    id: string,
    patch: Partial<Omit<AssetRecord, "id" | "createdAt">>,
  ): Promise<AssetRecord | null> {
    await connectMongo();
    const doc = await VideoAssetModel.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    return doc ? mapAsset(doc) : null;
  }

  async deleteAssetsByVideo(videoId: string): Promise<void> {
    await connectMongo();
    await VideoAssetModel.deleteMany({ videoId });
  }
}
