import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/supabase.js';
import { env } from '../config/env.js';
import { HttpError,ensureDb,wrap } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { createMayaCheckout } from '../services/maya.js';
const router=Router();
const uuid=z.uuid();
const select='id,user_id,status,subtotal,discount,total,shipping_address,idempotency_key,gateway_checkout_id,paid_at,created_at,order_items(id,product_id,name,unit_price,quantity,line_total),payments(id,status,amount,currency,gateway_checkout_id,gateway_payment_id)';
function formatOrder(order){return {...order,payments:order.payments?Array.isArray(order.payments)?order.payments:[order.payments]:[]};}
router.use(requireAuth);
router.get('/',wrap(async(req,res)=>{
  const rows=ensureDb(await db.from('orders').select(select).eq('user_id',req.user.id).order('created_at',{ascending:false}).limit(200));
  res.json(rows.map(formatOrder));
}));
router.get('/:id',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const order=ensureDb(await db.from('orders').select(select).eq('id',id).eq('user_id',req.user.id).maybeSingle());
  if(!order)throw new HttpError(404,'NOT_FOUND','Order not found.');
  res.json(formatOrder(order));
}));
router.post('/',wrap(async(req,res)=>{
  const {shipping,couponCode}=z.object({shipping:z.string().trim().min(10).max(500),couponCode:z.string().trim().max(30).optional()}).parse(req.body);
  const key=(req.get('idempotency-key')||'').trim();
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(key))throw new HttpError(422,'VALIDATION_ERROR','An Idempotency-Key header of 8–100 letters, numbers, hyphens or underscores is required.');
  const result=ensureDb(await db.rpc('place_store_order',{
    p_user_id:req.user.id,p_shipping:shipping,p_idempotency_key:key,p_coupon_code:couponCode||null,p_method:env.PAYMENT_MODE
  }));
  const order=result?.order;
  if(!order?.id)throw new HttpError(502,'DATABASE_ERROR','Order creation returned an invalid result.');
  if(result?.created===false && order.shipping_address!==shipping)throw new HttpError(409,'IDEMPOTENCY_CONFLICT','This checkout key was previously used for a different address.');
  const prior=ensureDb(await db.from('payments').select('id,status,gateway_checkout_id,raw_payload').eq('order_id',order.id).single());
  const originalMode=prior.raw_payload?.method || (prior.status==='cod_pending'?'cod':'maya');
  if(originalMode!==env.PAYMENT_MODE)throw new HttpError(409,'PAYMENT_MODE_CHANGED','This existing order uses a different payment method. Review My Orders or use a new checkout key.');
  if(env.PAYMENT_MODE==='cod'){
    res.status(result.created?201:200).json({...order,payment_method:'cod',payment_status:prior.status,checkout_url:null,message:'Order placed. Pay on delivery.'});
    return;
  }
  if(prior.gateway_checkout_id) {
    res.status(200).json({...order,payment_method:'maya',payment_status:prior.status,checkout_url:prior.raw_payload?.checkout_url||null,message:'Existing checkout session. If the session expired, contact the store.'});
    return;
  }
  // Maya network call is made after the DB transaction. The order persists if Maya is offline;
  // repeating the same idempotency key resumes the uninitialized checkout.
  const session=await createMayaCheckout(order);
  const saved=ensureDb(await db.rpc('attach_maya_checkout',{
    p_order_id:order.id,p_checkout_id:session.checkoutId,p_checkout_url:session.redirectUrl
  }));
  res.status(result.created?201:200).json({...order,gateway_checkout_id:saved.gateway_checkout_id,payment_method:'maya',payment_status:'maya_pending',checkout_url:saved.checkout_url});
}));
export default router;
