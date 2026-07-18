import * as studentService from "../services/student.service.js";

export const dashboard = async (req, res) => {
  res.json(await studentService.getDashboard(req.user));
};

export const notifications = async (req, res) => {
  res.json(await studentService.listNotifications(req.user._id));
};

export const markNotificationRead = async (req, res) => {
  res.json(await studentService.markNotificationRead({ notificationId: req.params.notificationId, userId: req.user._id }));
};

export const lessonPlayer = async (req, res) => {
  res.json(await studentService.getPlayerData({ courseSlug: req.params.courseSlug, lessonSlug: req.params.lessonSlug, user: req.user }));
};

export const updateProgress = async (req, res) => {
  res.json(await studentService.updateLessonProgress({ lessonId: req.params.lessonId, payload: req.body, user: req.user }));
};

