import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const JobSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    videoId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectVideo",
      index: true,
    },
    type: { type: String, required: true },
    status: { type: String, required: true, default: "queued", index: true },
    progress: { type: Number, default: 0 },
    logs: { type: [String], default: [] },
    missingCredentials: { type: [String], default: [] },
    error: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

export type JobDoc = InferSchemaType<typeof JobSchema>;

export const JobModel: Model<JobDoc> =
  (mongoose.models.Job as Model<JobDoc>) ||
  mongoose.model<JobDoc>("Job", JobSchema);
