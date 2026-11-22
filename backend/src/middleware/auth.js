import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../config/supabase.js';
import { HttpError, ensureDb, wrap } from '../lib/errors.js';
export const requireAuth = wrap(async (req,res,next) => {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  let payload;
  try { payload = jwt.verify(match[1], env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { throw new HttpError(401, 'TOKEN_INVALID', 'Your session expired. Please sign in again.'); }
  if (typeof payload !== 'object' || typeof payload.sub !== 'string') throw new HttpError(401, 'TOKEN_INVALID', 'Invalid session.');
  const user = ensureDb(await db.from('users').select('id,name,email,role').eq('id', payload.sub).maybeSingle());
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'This account no longer exists.');
  req.user = user;
  next();
});
export function requireAdmin(req,res,next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'FORBIDDEN', 'Administrator access is required.'));
  next();
}
