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

const ProjectSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    loginEmail: { type: String, default: "" },
    encryptedPassword: { type: String, default: "" },
    prompt: { type: String, required: true },
    voiceOption: {
      type: String,
      enum: ["openai_tts", "browser_speech", "elevenlabs", "no_audio"],
      default: "openai_tts",
    },
    platforms: {
      type: [String],
      default: [],
    },
    workflow: { type: [WorkflowStepSchema], default: [] },
    applicationMap: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: [
        "draft",
        "discovering",
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

export type ProjectDoc = InferSchemaType<typeof ProjectSchema>;

export const ProjectModel: Model<ProjectDoc> =
  (mongoose.models.Project as Model<ProjectDoc>) ||
  mongoose.model<ProjectDoc>("Project", ProjectSchema);
