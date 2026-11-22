import jwt from 'jsonwebtoken'; import {env} from '../config/env.js'; import {AppError} from '../utils/errors.js';
export function signUser(user){return jwt.sign({sub:user.id,email:user.email,role:user.role},env.JWT_SECRET,{expiresIn:env.JWT_EXPIRES_IN})}
export function requireAuth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw new AppError(401,'UNAUTHORIZED','Authentication required');req.user=jwt.verify(h.slice(7),env.JWT_SECRET);next()}catch(e){next(e instanceof AppError?e:new AppError(401,'UNAUTHORIZED','Invalid or expired token'))}}
export function requireRole(...roles){return(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return next(new AppError(403,'FORBIDDEN','Insufficient permissions'));next()}}
