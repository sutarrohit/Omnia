import { rateLimiter } from "hono-rate-limiter";
import { AppBinding } from "../lib/types.js";

const limiter = rateLimiter<AppBinding>({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: "draft-7", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    keyGenerator: (c) => c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "anonymous" // Method to generate keys for each user
});

export default limiter;
