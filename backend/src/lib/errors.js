import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export function ensureDb(result) {
  if (!result.error) return result.data;
  const err = result.error;
  if (err.code === '23505') throw new HttpError(409, 'DUPLICATE', 'That record already exists.');
  if (err.code === '23503') throw new HttpError(409, 'IN_USE', 'This record is referenced by other data.');
  if (err.code === 'P0001' || err.code === 'P0002') throw new HttpError(422, 'BUSINESS_RULE', err.message);
  if (err.code === 'PGRST202' || err.code === '42883') throw new HttpError(503, 'MIGRATION_REQUIRED', 'Checkout database functions are missing. Run backend/sql/01_atomic_orders.sql in Supabase SQL Editor.');
  console.error('Supabase operation failed:', { code: err.code, message: err.message });
  throw new HttpError(502, 'DATABASE_ERROR', 'Database request failed. Check the Supabase connection and server logs.');
}
export const wrap = handler => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next);
export function notFound(req,res) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }); }
export function errorHandler(err,req,res,next) {
  if (res.headersSent) return next(err);
  if (err instanceof ZodError) return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request data.', details: err.issues.map(x=>({path:x.path.join('.'),message:x.message})) } });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' } });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code: err.code || 'INTERNAL_ERROR', message: status >= 500 && !(err instanceof HttpError) ? 'Internal server error.' : err.message || 'Internal server error.', ...(err.details ? { details: err.details } : {}) } });
}
