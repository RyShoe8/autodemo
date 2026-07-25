import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A short-lived remote-login session: the worker drives a real browser that the
 * customer interacts with to sign in to their own application. Only the hashed
 * connect token is stored; the raw token is returned once, to the initiating
 * user, and never persisted.
 */
const ConnectSessionSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Org", required: true, index: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    tokenHash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "live", "captured", "expired", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    startUrl: { type: String, required: true },
    error: { type: String },
    expiresAt: { type: Date, required: true, index: true },
    capturedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

export type ConnectSessionDoc = InferSchemaType<typeof ConnectSessionSchema>;

export const ConnectSessionModel: Model<ConnectSessionDoc> =
  (mongoose.models.ConnectSession as Model<ConnectSessionDoc>) ||
  mongoose.model<ConnectSessionDoc>("ConnectSession", ConnectSessionSchema);
