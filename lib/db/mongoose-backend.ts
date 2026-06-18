import { connectMongo } from "@/lib/mongodb";
import { ProjectModel } from "@/models/Project";
import { ProjectVideoModel } from "@/models/ProjectVideo";
import { JobModel } from "@/models/Job";
import { VideoAssetModel } from "@/models/VideoAsset";
import type {
  AssetRecord,
  CreateAssetInput,
  CreateJobInput,
  CreateProjectInput,
  CreateProjectVideoInput,
  DbBackend,
  JobRecord,
  ProjectRecord,
  ProjectVideoRecord,
} from "@/lib/db/types";
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

function mapProject(doc: any): ProjectRecord {
  return {
    id: String(doc._id),
    name: doc.name,
    url: doc.url,
    loginEmail: doc.loginEmail ?? "",
    encryptedPassword: doc.encryptedPassword ?? "",
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
  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    await connectMongo();
    const doc = await ProjectModel.create({
      ...input,
      bumperTitle: input.bumperTitle ?? input.name,
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
