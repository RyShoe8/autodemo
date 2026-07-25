import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const MembershipSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Org", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

MembershipSchema.index({ orgId: 1, userId: 1 }, { unique: true });

export type MembershipDoc = InferSchemaType<typeof MembershipSchema>;

export const MembershipModel: Model<MembershipDoc> =
  (mongoose.models.Membership as Model<MembershipDoc>) ||
  mongoose.model<MembershipDoc>("Membership", MembershipSchema);
