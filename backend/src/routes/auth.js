import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { db } from '../config/supabase.js';
import { HttpError, ensureDb, wrap } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
const router=Router();
const credentials = z.object({ email: z.email().max(254).transform(x=>x.trim().toLowerCase()), password: z.string().min(1).max(100) });
function token(user) { return jwt.sign({sub:user.id},env.JWT_SECRET,{algorithm:'HS256',expiresIn:env.JWT_EXPIRES_IN,issuer:'paint-hardware-shop'}); }
router.post('/register',wrap(async(req,res)=>{
  const input=credentials.extend({name:z.string().trim().min(2).max(80), password:z.string().min(8).max(100)}).parse(req.body);
  const password_hash=await bcrypt.hash(input.password,12);
  const newUser=ensureDb(await db.from('users').insert({name:input.name,email:input.email,password_hash,role:'customer'}).select('id,name,email,role,created_at').single());
  res.status(201).json({user:newUser,token:token(newUser)});
}));
router.post('/login',wrap(async(req,res)=>{
  const input=credentials.parse(req.body);
  const user=ensureDb(await db.from('users').select('id,name,email,role,password_hash,created_at').eq('email',input.email).maybeSingle());
  const valid= user ? await bcrypt.compare(input.password,user.password_hash) : await bcrypt.compare(input.password,'$2b$12$C6UzMDM.H6dfI/f/IKcEe.kla5L4R5rDxYx/PMgEbSrwxumHZH2kW').catch(()=>false);
  if (!user || !valid) throw new HttpError(401,'BAD_CREDENTIALS','Email or password is incorrect.');
  const {password_hash,...safe}=user; res.json({user:safe,token:token(user)});
}));
router.get('/me',requireAuth,(req,res)=>res.json(req.user));
export default router;
