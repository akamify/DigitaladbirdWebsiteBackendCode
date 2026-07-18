import Razorpay from "razorpay";
import { env } from "./env.js";

export const razorpay =
  env.razorpayKeyId && env.razorpayKeySecret
    ? new Razorpay({
        key_id: env.razorpayKeyId,
        key_secret: env.razorpayKeySecret,
      })
    : null;

