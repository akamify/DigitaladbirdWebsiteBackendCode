import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import User from "../models/User.js";

const run = async () => {
  await connectDatabase();

  const email = env.defaultSuperAdminEmail.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(env.defaultSuperAdminPassword, 10);

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.findOne({ role: "SUPER_ADMIN" }).sort({ createdAt: 1 });
  }

  if (!user) {
    user = await User.create({
      name: "Digital AdBird Owner",
      email,
      password: passwordHash,
      role: "SUPER_ADMIN",
      bio: "Platform owner",
      isActive: true,
    });

    console.log(`Created SUPER_ADMIN: ${user.email}`);
  } else {
    user.name = user.name || "Digital AdBird Owner";
    user.email = email;
    user.password = passwordHash;
    user.role = "SUPER_ADMIN";
    user.bio = user.bio || "Platform owner";
    user.isActive = true;
    await user.save();

    console.log(`Updated SUPER_ADMIN: ${user.email}`);
  }

  console.log(`Login email: ${email}`);
  console.log(`Login password: ${env.defaultSuperAdminPassword}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Failed to sync super admin", error);
  await mongoose.disconnect();
  process.exit(1);
});
