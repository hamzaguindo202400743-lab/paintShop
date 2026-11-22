import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/supabase.js';
import { ensureDb, HttpError, wrap } from '../lib/errors.js';
const router=Router();
const uuid=z.uuid();
const querySchema=z.object({
  search:z.string().trim().max(100).optional(),category:uuid.optional(),
  minPrice:z.coerce.number().min(0).optional(),maxPrice:z.coerce.number().min(0).optional(),
  page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(12),
  sort:z.enum(['newest','price','name']).default('newest')
});
router.get('/',wrap(async(req,res)=>{
  const q=querySchema.parse(req.query);
  if (q.minPrice!==undefined && q.maxPrice!==undefined && q.minPrice>q.maxPrice) throw new HttpError(422,'VALIDATION_ERROR','Minimum price must not exceed maximum price.');
  let query=db.from('products').select('id,name,description,price,stock,category_id,image_url,active,created_at,categories(id,name)',{count:'exact'}).eq('active',true);
  if(q.search)query=query.ilike('name',`%${q.search.replaceAll('%','\\%').replaceAll('_','\\_')}%`);
  if(q.category)query=query.eq('category_id',q.category);
  if(q.minPrice!==undefined)query=query.gte('price',q.minPrice);
  if(q.maxPrice!==undefined)query=query.lte('price',q.maxPrice);
  if(q.sort==='price')query=query.order('price',{ascending:true}).order('id');
  else if(q.sort==='name')query=query.order('name',{ascending:true}).order('id');
  else query=query.order('created_at',{ascending:false}).order('id');
  const from=(q.page-1)*q.limit;
  const result=await query.range(from,from+q.limit-1);
  const items=ensureDb(result);
  res.json({items,page:q.page,limit:q.limit,total:result.count||0,pages:Math.ceil((result.count||0)/q.limit)});
}));
router.get('/:id',wrap(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const product=ensureDb(await db.from('products').select('id,name,description,price,stock,category_id,image_url,active,created_at,categories(id,name)').eq('id',id).eq('active',true).maybeSingle());
  if(!product)throw new HttpError(404,'NOT_FOUND','Product not found.');
  res.json(product);
}));
export default router;
