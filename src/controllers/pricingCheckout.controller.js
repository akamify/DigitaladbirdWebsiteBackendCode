import * as pricingCheckoutService from "../services/pricingCheckout.service.js";

export const start = async (req, res) => {
  res.status(201).json(await pricingCheckoutService.startCheckout({ payload: req.body, user: req.user }));
};

export const resume = async (req, res) => {
  res.json(await pricingCheckoutService.resumeCheckout(req.params.token));
};

export const updateSelection = async (req, res) => {
  res.json(await pricingCheckoutService.updateSelection({ checkoutId: req.params.id, payload: req.body, user: req.user }));
};

export const updateDetails = async (req, res) => {
  res.json(await pricingCheckoutService.updateDetails({ checkoutId: req.params.id, payload: req.body, user: req.user }));
};

export const sendWhatsappOtp = async (req, res) => {
  res.json(await pricingCheckoutService.sendWhatsappOtp({ checkoutId: req.params.id, payload: req.body, user: req.user }));
};

export const sendEmailOtp = async (req, res) => {
  res.json(await pricingCheckoutService.sendEmailOtp({ checkoutId: req.params.id, payload: req.body, user: req.user }));
};

export const validateWhatsappNumber = async (req, res) => {
  res.json(await pricingCheckoutService.validateWhatsappNumber(req.body));
};

export const verifyWhatsappOtp = async (req, res) => {
  res.json(await pricingCheckoutService.verifyWhatsappOtp({ checkoutId: req.params.id, payload: req.body, user: req.user }));
};

export const verifyEmailOtp = async (req, res) => {
  res.json(await pricingCheckoutService.verifyEmailOtp({ checkoutId: req.params.id, payload: req.body, user: req.user }));
};

export const submit = async (req, res) => {
  res.json(await pricingCheckoutService.submitCheckout({ checkoutId: req.params.id, user: req.user }));
};

export const abandon = async (req, res) => {
  res.json(await pricingCheckoutService.abandonCheckout({ checkoutId: req.params.id, user: req.user }));
};
