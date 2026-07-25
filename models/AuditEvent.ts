import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Append-only security log. Records who did what to which tenant resource.
 * Metadata must stay non-sensitive: never credentials, cookies, or key material.
 */
const AuditEventSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Org", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorEmail: { type: String },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type AuditEventDoc = InferSchemaType<typeof AuditEventSchema>;

export const AuditEventModel: Model<AuditEventDoc> =
  (mongoose.models.AuditEvent as Model<AuditEventDoc>) ||
  mongoose.model<AuditEventDoc>("AuditEvent", AuditEventSchema);
