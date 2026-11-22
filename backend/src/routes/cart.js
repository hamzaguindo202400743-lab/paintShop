import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/supabase.js';
import { HttpError, ensureDb, wrap } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
const router=Router();
const uuid=z.uuid();const qty=z.number().int().min(1).max(99);
const fields='id,user_id,product_id,quantity,products(id,name,price,stock,active,image_url)';
function toAmount(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
router.use(requireAuth);
router.get('/',wrap(async(req,res)=>{
  const items=ensureDb(await db.from('cart_items').select(fields).eq('user_id',req.user.id).order('id'));
  const shaped=items.map(item=>({ ...item, unit_price:Number(item.products?.price||0), line_total:toAmount(Number(item.products?.price||0)*item.quantity) }));
  res.json({items:shaped,subtotal:toAmount(shaped.reduce((sum,item)=>sum+item.line_total,0))});
}));
router.post('/',wrap(async(req,res)=>{
  const body=z.object({productId:uuid,quantity:qty.default(1)}).parse(req.body);
  const product=ensureDb(await db.from('products').select('id,stock,active').eq('id',body.productId).maybeSingle());
  if(!product||!product.active)throw new HttpError(404,'NOT_FOUND','Product is unavailable.');
  const found=ensureDb(await db.from('cart_items').select('id,quantity').eq('user_id',req.user.id).eq('product_id',body.productId).maybeSingle());
  const next=body.quantity+(found?.quantity||0);
  if(next>99 || next>product.stock)throw new HttpError(409,'OUT_OF_STOCK',`Only ${product.stock} item(s) are in stock.`);
  const updated=found
    ? ensureDb(await db.from('cart_items').update({quantity:next}).eq('id',found.id).eq('user_id',req.user.id).select('id,product_id,quantity').single())
    : ensureDb(await db.from('cart_items').insert({user_id:req.user.id,product_id:body.productId,quantity:next}).select('id,product_id,quantity').single());
  res.status(found?200:201).json(updated);
}));
router.patch('/:id',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const {quantity}=z.object({quantity:z.number().int().min(0).max(99)}).parse(req.body);
  const found=ensureDb(await db.from('cart_items').select('id,product_id').eq('id',id).eq('user_id',req.user.id).maybeSingle());
  if(!found)throw new HttpError(404,'NOT_FOUND','Cart item not found.');
  if(quantity===0){ensureDb(await db.from('cart_items').delete().eq('id',id).eq('user_id',req.user.id));return res.status(204).end();}
  const product=ensureDb(await db.from('products').select('stock,active').eq('id',found.product_id).single());
  if(!product.active || quantity>product.stock)throw new HttpError(409,'OUT_OF_STOCK','Not enough stock for that quantity.');
  res.json(ensureDb(await db.from('cart_items').update({quantity}).eq('id',id).eq('user_id',req.user.id).select('id,product_id,quantity').single()));
}));
router.delete('/:id',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const found=ensureDb(await db.from('cart_items').delete().eq('id',id).eq('user_id',req.user.id).select('id'));
  if(!found.length)throw new HttpError(404,'NOT_FOUND','Cart item not found.');
  res.status(204).end();
}));
export default router;
