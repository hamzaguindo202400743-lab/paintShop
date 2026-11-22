import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_URL: z.string().min(1).default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('2h'),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  PAYMENT_MODE: z.enum(['cod', 'maya']).default('cod'),
  MAYA_PUBLIC_KEY: z.string().optional(),
  MAYA_SECRET_KEY: z.string().optional(),
  MAYA_API_BASE: z.url().default('https://pg-sandbox.paymaya.com'),
  MAYA_SUCCESS_URL: z.url().optional(),
  MAYA_FAILURE_URL: z.url().optional(),
  MAYA_CANCEL_URL: z.url().optional(),
  MAYA_WEBHOOK_PUBLIC_KEY_1_BASE64: z.string().optional(),
  MAYA_WEBHOOK_PUBLIC_KEY_2_BASE64: z.string().optional(),
  MAYA_WEBHOOK_TIMESTAMP_TOLERANCE_MS: z.coerce.number().int().positive().default(300000)
});
const result = schema.safeParse(process.env);
if (!result.success) {
  console.error('Missing/invalid backend .env variables:', result.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; '));
  process.exit(1);
}
export const env = result.data;
export const frontendOrigins = env.FRONTEND_URL.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\/$/, ''));
if (env.PAYMENT_MODE === 'maya') {
  const required = ['MAYA_PUBLIC_KEY', 'MAYA_SECRET_KEY', 'MAYA_SUCCESS_URL', 'MAYA_FAILURE_URL', 'MAYA_CANCEL_URL', 'MAYA_WEBHOOK_PUBLIC_KEY_1_BASE64', 'MAYA_WEBHOOK_PUBLIC_KEY_2_BASE64'];
  const absent = required.filter(key => !env[key]);
  if (absent.length) {
    console.error('Maya is enabled but credentials are missing:', absent.join(', '));
    process.exit(1);
  }
  if (env.NODE_ENV === 'production' && [env.MAYA_SUCCESS_URL, env.MAYA_FAILURE_URL, env.MAYA_CANCEL_URL].some(s => !s.startsWith('https://'))) {
    console.error('Maya redirect URLs must use HTTPS in production.'); process.exit(1);
  }
}
