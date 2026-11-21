import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({PORT:z.coerce.number().default(4000),NODE_ENV:z.string().default('development'),FRONTEND_URL:z.string().url(),JWT_SECRET:z.string().min(20),JWT_EXPIRES_IN:z.string().default('2h'),SUPABASE_URL:z.string().url(),SUPABASE_SERVICE_ROLE_KEY:z.string().min(20),MAYA_PUBLIC_KEY:z.string().min(5),MAYA_SECRET_KEY:z.string().min(5),MAYA_API_BASE:z.string().url().default('https://pg-sandbox.paymaya.com'),MAYA_SUCCESS_URL:z.string().url(),MAYA_FAILURE_URL:z.string().url(),MAYA_CANCEL_URL:z.string().url(),MAYA_WEBHOOK_PUBLIC_KEY_1:z.string().min(20),MAYA_WEBHOOK_PUBLIC_KEY_2:z.string().min(20),WEBHOOK_TIMESTAMP_TOLERANCE_MS:z.coerce.number().default(300000)});
export const env=schema.parse(process.env);
