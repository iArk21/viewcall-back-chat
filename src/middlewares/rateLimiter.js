import rateLimit from "express-rate-limit";

export const apiLimiter = (windowMs = 60000, max = 200) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, try again later." }
  });
