import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { env } from "../config/env.js";

const sanitizeFilename = (filename) => filename.replace(/[^a-zA-Z0-9.\-_]/g, "-");

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const wantsProtected =
      req.body.visibility === "PROTECTED" ||
      file.mimetype.startsWith("video/") ||
      file.mimetype === "application/pdf";

    const directory = wantsProtected ? env.protectedUploadsDir : env.publicUploadsDir;

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    callback(null, directory);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname);
    const base = path.basename(file.originalname, extension);
    callback(null, `${Date.now()}-${sanitizeFilename(base)}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 300,
  },
});

