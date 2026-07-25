import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const OrgSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    /** Data key wrapped under the master key — never the raw key. */
    wrappedDek: { type: String, default: "" },
    /** Which master key wrapped it (supports KEK rotation). */
    kekId: { type: String, default: "" },
    /** Identifier of the current data key (recorded in each ciphertext). */
    dekId: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

export type OrgDoc = InferSchemaType<typeof OrgSchema>;

export const OrgModel: Model<OrgDoc> =
  (mongoose.models.Org as Model<OrgDoc>) ||
  mongoose.model<OrgDoc>("Org", OrgSchema);
