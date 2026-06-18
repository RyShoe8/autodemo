import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const VideoAssetSchema = new Schema(
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
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["youtube", "linkedin", "x", "bluesky", "tiktok", "instagram"],
      required: true,
    },
    videoUrl: { type: String, required: true },
    audioUrl: { type: String },
    thumbnailUrl: { type: String },
    captionUrl: { type: String },
    script: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type VideoAssetDoc = InferSchemaType<typeof VideoAssetSchema>;

export const VideoAssetModel: Model<VideoAssetDoc> =
  (mongoose.models.VideoAsset as Model<VideoAssetDoc>) ||
  mongoose.model<VideoAssetDoc>("VideoAsset", VideoAssetSchema);
