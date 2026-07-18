import fs from "node:fs";
import Media from "../models/Media.js";
import { verifyMediaToken } from "../utils/jwt.js";

export const streamMedia = async (req, res) => {
  const token = req.query.token;

  if (!token || typeof token !== "string") {
    return res.status(401).json({ message: "A signed media token is required." });
  }

  let payload;

  try {
    payload = verifyMediaToken(token);
  } catch {
    return res.status(401).json({ message: "The media token is invalid or expired." });
  }

  if (payload.scope !== "lesson-stream" || payload.mediaId !== req.params.mediaId) {
    return res.status(403).json({ message: "This media token cannot access the requested file." });
  }

  const media = await Media.findById(req.params.mediaId);

  if (!media || !fs.existsSync(media.storagePath)) {
    return res.status(404).json({ message: "Media file not found." });
  }

  const stat = fs.statSync(media.storagePath);
  const range = req.headers.range;

  res.setHeader("Content-Type", media.mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=60");

  if (!range) {
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(media.storagePath).pipe(res);
    return;
  }

  const [startValue, endValue] = range.replace(/bytes=/, "").split("-");
  const start = Number(startValue);
  const end = endValue ? Number(endValue) : stat.size - 1;
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Content-Length": chunkSize,
  });

  fs.createReadStream(media.storagePath, { start, end }).pipe(res);
};
