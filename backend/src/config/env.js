import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),

  JWT_SECRET: z.string().min(20),
  JWT_EXPIRES_IN: z.string().default('2h'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  MAYA_PUBLIC_KEY: z.string().min(5),
  MAYA_SECRET_KEY: z.string().min(5),
  MAYA_API_BASE: z.string().url().default('https://pg-sandbox.paymaya.com'),

  WEBHOOK_TIMESTAMP_TOLERANCE_MS: z.coerce.number().default(300000)
});

export const env = schema.parse(process.env);