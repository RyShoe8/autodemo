import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WorkflowStepSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    actionType: { type: String, required: true },
    selector: { type: String },
    url: { type: String },
    value: { type: String },
    enabled: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const ProjectVideoSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    prompt: { type: String, required: true },
    voiceOption: {
      type: String,
      enum: ["openai_tts", "browser_speech", "elevenlabs", "no_audio"],
      default: "openai_tts",
    },
    platforms: { type: [String], default: [] },
    workflow: { type: [WorkflowStepSchema], default: [] },
    status: {
      type: String,
      enum: [
        "draft",
        "building_workflow",
        "awaiting_approval",
        "recording",
        "rendering",
        "completed",
        "failed",
      ],
      default: "draft",
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

export type ProjectVideoDoc = InferSchemaType<typeof ProjectVideoSchema>;

export const ProjectVideoModel: Model<ProjectVideoDoc> =
  (mongoose.models.ProjectVideo as Model<ProjectVideoDoc>) ||
  mongoose.model<ProjectVideoDoc>("ProjectVideo", ProjectVideoSchema);
