import * as authService from "../services/auth.service.js";

export const signup = async (req, res) => {
  res.status(201).json(await authService.signup(req.body));
};

export const login = async (req, res) => {
  res.json(await authService.login(req.body));
};

export const me = async (req, res) => {
  res.json(await authService.me(req.user._id));
};

export const updateProfile = async (req, res) => {
  res.json(await authService.updateProfile(req.user._id, req.body));
};

export const forgotPassword = async (req, res) => {
  res.json(await authService.forgotPassword(req.body));
};

export const resetPassword = async (req, res) => {
  res.json(await authService.resetPassword(req.body));
};

export const logout = async (req, res) => {
  res.json({ message: "Logged out successfully." });
};

