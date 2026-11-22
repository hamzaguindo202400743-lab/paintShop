import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { db } from '../config/supabase.js';
import { HttpError,ensureDb,wrap } from '../lib/errors.js';
import { verifyMayaWebhook } from '../services/maya.js';
const router=Router();
router.post('/maya',wrap(async(req,res)=>{
  if(env.PAYMENT_MODE!=='maya')throw new HttpError(404,'NOT_FOUND','Maya payment integration is disabled.');
  if(!req.body || typeof req.body!=='object' || !verifyMayaWebhook(req.body,req.headers))throw new HttpError(401,'BAD_SIGNATURE','Maya webhook signature or timestamp is invalid.');
  const payload=req.body;
  const orderId=z.uuid().safeParse(payload.requestReferenceNumber);
  if(!orderId.success)throw new HttpError(422,'INVALID_EVENT','Webhook has no valid order reference.');
  const status=payload.paymentStatus||payload.status;
  if(!['PAYMENT_SUCCESS','PAYMENT_FAILED','PAYMENT_CANCELLED'].includes(status))return res.status(200).json({acknowledged:true,ignored:true});
  const amount=Number(payload.totalAmount?.value ?? payload.amount);
  const currency=payload.totalAmount?.currency||payload.currency;
  if(!Number.isFinite(amount)||amount<0||currency!=='PHP')throw new HttpError(422,'INVALID_EVENT','Webhook payment amount or currency is invalid.');
  const eventId=`${String(payload.id||'')}:${status}:${String(payload.updatedAt||'')}`;
  if(eventId.length<12||eventId.length>255)throw new HttpError(422,'INVALID_EVENT','Invalid Maya payment event ID.');
  ensureDb(await db.rpc('record_maya_payment_event',{
    p_order_id:orderId.data,p_event_id:eventId,p_payment_id:String(payload.id||''),
    p_status:status,p_amount:amount,p_currency:currency,p_payload:payload
  }));
  res.json({acknowledged:true});
}));
export default router;
