import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// This privileged key must stay on the Express server; the React app only talks to /api/v1.
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { 'X-Client-Info': 'paint-hardware-shop-server' } }
});
