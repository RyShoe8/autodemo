import { connectMongo } from "@/lib/mongodb";
import { ProjectModel } from "@/models/Project";
import { JobModel } from "@/models/Job";
import { VideoAssetModel } from "@/models/VideoAsset";
import type {
  AssetRecord,
  CreateAssetInput,
  CreateJobInput,
  CreateProjectInput,
  DbBackend,
  JobRecord,
  ProjectRecord,
} from "@/lib/db/types";
import { firstStatusForType } from "@/lib/db/types";
import type {
  Platform,
  ProjectStatus,
  VoiceOption,
  WorkflowStep,
  ApplicationMap,
} from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapProject(doc: any): ProjectRecord {
  return {
    id: String(doc._id),
    name: doc.name,
    url: doc.url,
    loginEmail: doc.loginEmail ?? "",
    encryptedPassword: doc.encryptedPassword ?? "",
    prompt: doc.prompt,
    voiceOption: doc.voiceOption as VoiceOption,
    platforms: (doc.platforms ?? []) as Platform[],
    workflow: (doc.workflow ?? []) as WorkflowStep[],
    applicationMap: doc.applicationMap as ApplicationMap | undefined,
    logoUrl: doc.logoUrl ?? undefined,
    brandColor: doc.brandColor ?? "#38bdf8",
    bumperEnabled: doc.bumperEnabled !== false,
    bumperDurationSeconds: doc.bumperDurationSeconds ?? 4,
    status: doc.status as ProjectStatus,
    createdAt: doc.createdAt ?? new Date(),
  };
}

function mapJob(doc: any): JobRecord {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    type: doc.type,
    status: doc.status,
    progress: doc.progress ?? 0,
    logs: doc.logs ?? [],
    missingCredentials: doc.missingCredentials ?? [],
    error: doc.error,
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt ?? new Date(),
  };
}

function mapAsset(doc: any): AssetRecord {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
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
  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    await connectMongo();
    const doc = await ProjectModel.create({
      ...input,
      workflow: [],
      status: "draft",
    });
    return mapProject(doc.toObject());
  }

  async listProjects(): Promise<ProjectRecord[]> {
    await connectMongo();
    const docs = await ProjectModel.find().sort({ createdAt: -1 }).lean();
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
      new: true,
    }).lean();
    return doc ? mapProject(doc) : null;
  }

  async deleteProject(id: string): Promise<boolean> {
    await connectMongo();
    const res = await ProjectModel.findByIdAndDelete(id);
    await JobModel.deleteMany({ projectId: id });
    await VideoAssetModel.deleteMany({ projectId: id });
    return Boolean(res);
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    await connectMongo();
    const doc = await JobModel.create({
      projectId: input.projectId,
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

  async getLatestJobByProject(projectId: string): Promise<JobRecord | null> {
    await connectMongo();
    const doc = await JobModel.findOne({ projectId })
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
      new: true,
    }).lean();
    return doc ? mapJob(doc) : null;
  }

  async appendJobLog(id: string, line: string): Promise<void> {
    await connectMongo();
    await JobModel.findByIdAndUpdate(id, { $push: { logs: line } });
  }

  async claimNextJob(): Promise<JobRecord | null> {
    await connectMongo();
    // Atomically claim the oldest queued job and transition it to its first
    // running status to prevent other workers from re-claiming it.
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
      { new: true },
    ).lean();
    return doc ? mapJob(doc) : null;
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

  async getAsset(id: string): Promise<AssetRecord | null> {
    await connectMongo();
    const doc = await VideoAssetModel.findById(id).lean();
    return doc ? mapAsset(doc) : null;
  }

  async deleteAssetsByProject(projectId: string): Promise<void> {
    await connectMongo();
    await VideoAssetModel.deleteMany({ projectId });
  }
}
