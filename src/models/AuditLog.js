import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: String,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

export default mongoose.model("AuditLog", auditLogSchema);

