import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/supabase.js';
import { HttpError,ensureDb,wrap } from '../lib/errors.js';
import { requireAuth,requireAdmin } from '../middleware/auth.js';
const router=Router();const name=z.object({name:z.string().trim().min(2).max(80)});
router.get('/',wrap(async(req,res)=>res.json(ensureDb(await db.from('categories').select('id,name').order('name')))));
router.post('/',requireAuth,requireAdmin,wrap(async(req,res)=>res.status(201).json(ensureDb(await db.from('categories').insert(name.parse(req.body)).select('id,name').single()))));
router.patch('/:id',requireAuth,requireAdmin,wrap(async(req,res)=>{
  const id=z.uuid().parse(req.params.id);const row=ensureDb(await db.from('categories').update(name.parse(req.body)).eq('id',id).select('id,name').maybeSingle());
  if(!row)throw new HttpError(404,'NOT_FOUND','Category not found.');res.json(row);
}));
router.delete('/:id',requireAuth,requireAdmin,wrap(async(req,res)=>{
  const id=z.uuid().parse(req.params.id);const rows=ensureDb(await db.from('categories').delete().eq('id',id).select('id'));
  if(!rows.length)throw new HttpError(404,'NOT_FOUND','Category not found.');res.status(204).end();
}));
export default router;
