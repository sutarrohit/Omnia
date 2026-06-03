import { config } from "dotenv";
import { expand } from "dotenv-expand";
import path from "node:path";
import { z } from "zod";

expand(
  config({
    path: path.resolve(process.cwd(), process.env.NODE_ENV === "test" ? ".env.test" : ".env")
  })
);

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  DATABASE_URL: z.url(),
  DIRECT_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32), // signing key for sessions/cookies
  BETTER_AUTH_URL: z.url(), // server's own public base URL (e.g. http://localhost:4000)
  // 32-byte key (base64) for AES-256-GCM encryption of stored bot tokens.
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes (base64)"),
  PUBLIC_URL: z.url() // public base URL used to register per-bot webhooks
});

export type env = z.infer<typeof EnvSchema>;

const { data: env, error } = EnvSchema.safeParse(process.env);

if (error) {
  console.error("❌ Invalid env | Missing env:");
  console.error(JSON.stringify(z.flattenError(error).fieldErrors, null, 2));
  process.exit(1);
}

export default env!;
