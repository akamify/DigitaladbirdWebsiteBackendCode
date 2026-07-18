import express from "express";
import * as mediaController from "../controllers/media.controller.js";
import catchAsync from "../utils/catchAsync.js";

const router = express.Router();

router.get("/:mediaId/stream", catchAsync(mediaController.streamMedia));

export default router;
