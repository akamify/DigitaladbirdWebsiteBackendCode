import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR", "USER"],
      default: "USER",
    },
    avatarUrl: String,
    bio: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    resetPasswordToken: String,
    resetPasswordExpiresAt: Date,
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userSchema);

