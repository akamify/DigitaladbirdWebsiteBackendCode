import * as adminService from "../services/admin.service.js";

export const overview = async (req, res) => {
  res.json(await adminService.getOverview());
};

export const listCourses = async (req, res) => {
  res.json(await adminService.listCourses({ query: req.query, user: req.user }));
};

export const getCourse = async (req, res) => {
  res.json(await adminService.getCourse({ courseId: req.params.courseId, user: req.user }));
};

export const createCourse = async (req, res) => {
  res.status(201).json(await adminService.createCourse({ payload: req.body, user: req.user }));
};

export const updateCourse = async (req, res) => {
  res.json(await adminService.updateCourse({ courseId: req.params.courseId, payload: req.body, user: req.user }));
};

export const archiveCourse = async (req, res) => {
  res.json(await adminService.archiveCourse({ courseId: req.params.courseId, user: req.user }));
};

export const restoreCourse = async (req, res) => {
  res.json(await adminService.restoreCourse({ courseId: req.params.courseId, user: req.user }));
};

export const publishCourse = async (req, res) => {
  res.json(await adminService.changeCourseStatus({ courseId: req.params.courseId, status: "PUBLISHED", user: req.user }));
};

export const unpublishCourse = async (req, res) => {
  res.json(await adminService.changeCourseStatus({ courseId: req.params.courseId, status: "DRAFT", user: req.user }));
};

export const addChapter = async (req, res) => {
  res.status(201).json(await adminService.addChapter({ courseId: req.params.courseId, payload: req.body, user: req.user }));
};

export const updateChapter = async (req, res) => {
  res.json(await adminService.updateChapter({ chapterId: req.params.chapterId, payload: req.body, user: req.user }));
};

export const removeChapter = async (req, res) => {
  res.json(await adminService.removeChapter({ chapterId: req.params.chapterId, user: req.user }));
};

export const reorderChapters = async (req, res) => {
  res.json(await adminService.reorderChapters({ courseId: req.params.courseId, ids: req.body.ids, user: req.user }));
};

export const addLesson = async (req, res) => {
  res.status(201).json(await adminService.addLesson({ chapterId: req.params.chapterId, payload: req.body, user: req.user }));
};

export const updateLesson = async (req, res) => {
  res.json(await adminService.updateLesson({ lessonId: req.params.lessonId, payload: req.body, user: req.user }));
};

export const removeLesson = async (req, res) => {
  res.json(await adminService.removeLesson({ lessonId: req.params.lessonId, user: req.user }));
};

export const reorderLessons = async (req, res) => {
  res.json(await adminService.reorderLessons({ chapterId: req.params.chapterId, ids: req.body.ids, user: req.user }));
};

export const uploadMedia = async (req, res) => {
  res.status(201).json(await adminService.saveMediaRecord({ file: req.file, payload: req.body, user: req.user }));
};

export const listMedia = async (req, res) => {
  res.json(await adminService.listMedia({ query: req.query, user: req.user }));
};

export const deleteMedia = async (req, res) => {
  res.json(await adminService.removeMediaRecord({ mediaId: req.params.mediaId, user: req.user }));
};

export const auditLogs = async (req, res) => {
  res.json(await adminService.listAuditLogs(req.query));
};

export const listUsers = async (req, res) => {
  res.json(await adminService.listUsers(req.query));
};

export const listPayments = async (req, res) => {
  res.json(await adminService.listPayments());
};

export const listCoupons = async (req, res) => {
  res.json(await adminService.listCoupons());
};

export const createCoupon = async (req, res) => {
  res.status(201).json(await adminService.createCoupon({ payload: req.body, user: req.user }));
};

export const updateCoupon = async (req, res) => {
  res.json(await adminService.updateCoupon({ couponId: req.params.couponId, payload: req.body, user: req.user }));
};

export const disableCoupon = async (req, res) => {
  res.json(await adminService.disableCoupon({ couponId: req.params.couponId, user: req.user }));
};

export const listSettings = async (req, res) => {
  res.json(await adminService.listSettings());
};

export const updateSetting = async (req, res) => {
  res.json(await adminService.updateSetting({ key: req.params.key, value: req.body, user: req.user }));
};

export const salesReport = async (req, res) => {
  const csv = await adminService.getSalesCsv();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=sales-report.csv");
  res.send(csv);
};

export const enrollmentsReport = async (req, res) => {
  const csv = await adminService.getEnrollmentsCsv();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=enrollments-report.csv");
  res.send(csv);
};
