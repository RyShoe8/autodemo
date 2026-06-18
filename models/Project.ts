import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ProjectSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    loginEmail: { type: String, default: "" },
    encryptedPassword: { type: String, default: "" },
    prompt: { type: String, default: "" },
    voiceOption: {
      type: String,
      enum: ["openai_tts", "browser_speech", "elevenlabs", "no_audio"],
      default: "openai_tts",
    },
    platforms: { type: [String], default: [] },
    workflow: { type: Schema.Types.Mixed, default: [] },
    applicationMap: { type: Schema.Types.Mixed },
    logoUrl: { type: String },
    brandColor: { type: String, default: "#38bdf8" },
    bumperEnabled: { type: Boolean, default: true },
    bumperDurationSeconds: { type: Number, default: 4, min: 2, max: 8 },
    bumperUrl: { type: String },
    bumperTitle: { type: String },
    bumperTagline: { type: String },
    status: {
      type: String,
      enum: [
        "draft",
        "discovering",
        "ready",
        "failed",
        "awaiting_approval",
        "recording",
        "rendering",
        "completed",
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
