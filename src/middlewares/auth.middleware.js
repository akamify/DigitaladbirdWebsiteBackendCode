import User from "../models/User.js";
import { verifyAccessToken } from "../utils/jwt.js";

const getBearerToken = (headerValue = "") => {
  if (!headerValue.startsWith("Bearer ")) {
    return null;
  }

  return headerValue.slice(7).trim();
};

export const optionalAuth = async (req, res, next) => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = await User.findById(payload.sub).select("name email phone phoneNormalized role avatarUrl bio isActive");
  } catch {
    req.user = null;
  }

  return next();
};

export const protect = async (req, res, next) => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select("name email phone phoneNormalized role avatarUrl bio isActive");

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Account is inactive or unavailable." });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: "You do not have permission to access this resource." });
  }

  return next();
};

