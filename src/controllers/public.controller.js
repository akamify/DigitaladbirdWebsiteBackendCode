import * as publicService from "../services/public.service.js";
import * as paymentService from "../services/payment.service.js";

export const listCourses = async (req, res) => {
  res.json(await publicService.listCourses({ query: req.query, user: req.user }));
};

export const getCourse = async (req, res) => {
  res.json(await publicService.getCourseBySlug({ slug: req.params.slug, user: req.user }));
};

export const enrollFree = async (req, res) => {
  res.json(await publicService.enrollInFreeCourse({ slug: req.params.slug, user: req.user }));
};

export const checkoutPreview = async (req, res) => {
  res.json(await paymentService.previewCheckout({ slug: req.params.slug, couponCode: req.body.couponCode, user: req.user }));
};

export const submitWebinarRegistration = async (req, res) => {
  res.json(await publicService.submitWebinarRegistration({ payload: req.body }));
};
