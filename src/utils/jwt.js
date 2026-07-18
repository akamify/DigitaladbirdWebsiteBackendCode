import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    env.jwtSecret,
    { expiresIn: "7d" },
  );

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret);

export const signMediaToken = (payload) =>
  jwt.sign(payload, env.mediaTokenSecret, { expiresIn: "15m" });

export const verifyMediaToken = (token) => jwt.verify(token, env.mediaTokenSecret);

