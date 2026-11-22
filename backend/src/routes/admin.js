import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/supabase.js';
import { HttpError,ensureDb,wrap } from '../lib/errors.js';
import { requireAuth,requireAdmin } from '../middleware/auth.js';
const router=Router(); router.use(requireAuth,requireAdmin);
const uuid=z.uuid();
const productSchema=z.object({
  name:z.string().trim().min(2).max(120),description:z.string().trim().min(1).max(1000),
  price:z.number().finite().min(0).max(99999999),stock:z.number().int().min(0).max(999999),
  category_id:uuid.nullable().optional(),image_url:z.union([z.url(),z.literal(''),z.null()]).optional(),active:z.boolean().optional()
});
router.get('/dashboard',wrap(async(req,res)=>{
  res.json(ensureDb(await db.rpc('get_store_dashboard')));
}));
router.get('/products',wrap(async(req,res)=>{
  const page=z.coerce.number().int().min(1).default(1).parse(req.query.page);
  const limit=z.coerce.number().int().min(1).max(300).default(100).parse(req.query.limit);
  const result=await db.from('products').select('id,name,description,price,stock,category_id,image_url,active,created_at,categories(id,name)',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*limit,page*limit-1);
  const items=ensureDb(result);res.json({items,page,limit,total:result.count||0,pages:Math.ceil((result.count||0)/limit)});
}));
router.post('/products',wrap(async(req,res)=>{
  const body=productSchema.parse(req.body);
  if(body.category_id){const c=ensureDb(await db.from('categories').select('id').eq('id',body.category_id).maybeSingle());if(!c)throw new HttpError(422,'UNKNOWN_CATEGORY','Category does not exist.');}
  const item=ensureDb(await db.from('products').insert({...body,image_url:body.image_url||null}).select('id,name,description,price,stock,category_id,image_url,active,created_at,categories(id,name)').single());
  res.status(201).json(item);
}));
router.patch('/products/:id',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);const body=productSchema.partial().refine(v=>Object.keys(v).length>0,'At least one field is required.').parse(req.body);
  const item=ensureDb(await db.from('products').update({...body,...('image_url'in body?{image_url:body.image_url||null}:{})}).eq('id',id).select('id,name,description,price,stock,category_id,image_url,active,created_at,categories(id,name)').maybeSingle());
  if(!item)throw new HttpError(404,'NOT_FOUND','Product not found.');res.json(item);
}));
router.delete('/products/:id',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const items=ensureDb(await db.from('products').update({active:false}).eq('id',id).select('id'));
  if(!items.length)throw new HttpError(404,'NOT_FOUND','Product not found.');res.status(204).end();
}));
const ordersFields='id,user_id,status,subtotal,discount,total,shipping_address,idempotency_key,gateway_checkout_id,paid_at,created_at,order_items(id,name,quantity,unit_price,line_total),payments(id,status,amount,currency)';
router.get('/orders',wrap(async(req,res)=>{
  const rows=ensureDb(await db.from('orders').select(ordersFields).order('created_at',{ascending:false}).limit(500));
  res.json(rows.map(o=>({...o,payments:o.payments?Array.isArray(o.payments)?o.payments:[o.payments]:[]})));
}));
router.patch('/orders/:id/status',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);const {status}=z.object({status:z.enum(['processing','shipped','delivered','cancelled'])}).parse(req.body);
  const result=ensureDb(await db.rpc('transition_store_order',{p_order_id:id,p_actor_id:req.user.id,p_status:status}));
  res.json(result);
}));
router.post('/orders/:id/confirm-cod',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const result=ensureDb(await db.rpc('confirm_cod_payment',{p_order_id:id,p_actor_id:req.user.id}));
  res.json(result);
}));
export default router;
