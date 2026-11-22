import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';

const basic = key => `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
function safeRedirect(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['maya.ph','paymaya.com'].some(base => u.hostname === base || u.hostname.endsWith(`.${base}`));
  } catch { return false; }
}
export async function createMayaCheckout(order) {
  const controller = new AbortController();
  const timeout=setTimeout(()=>controller.abort(), 15000);
  let response;
  try {
    response=await fetch(`${env.MAYA_API_BASE.replace(/\/$/,'')}/checkout/v1/checkouts`,{
      method:'POST', signal:controller.signal,
      headers:{accept:'application/json','content-type':'application/json',authorization:basic(env.MAYA_PUBLIC_KEY)},
      body:JSON.stringify({
        totalAmount:{value:Number(order.total),currency:'PHP'},
        requestReferenceNumber:order.id,
        redirectUrl:{ success:env.MAYA_SUCCESS_URL,failure:env.MAYA_FAILURE_URL,cancel:env.MAYA_CANCEL_URL }
      })
    });
  } catch {throw new HttpError(502,'MAYA_UNAVAILABLE','Maya Checkout could not be reached. Your order was saved; check My Orders before trying again.');}
  finally {clearTimeout(timeout);}
  const body=await response.json().catch(()=>null);
  if(!response.ok || !body?.checkoutId || !safeRedirect(body.redirectUrl)) {
    console.error('Maya checkout response:',response.status,body?.code||body?.message||'missing fields');
    throw new HttpError(502,'MAYA_CHECKOUT_FAILED','Maya Checkout did not create a valid secure session. Your order was saved; check My Orders.');
  }
  return { checkoutId: String(body.checkoutId), redirectUrl:body.redirectUrl };
}
export function flattenSignatureData(obj,prefix='',acc=[]) {
  if (!obj || typeof obj!=='object') throw new Error('Expected object');
  for(const [key,val] of Object.entries(obj)){
    const path=prefix?`${prefix}.${key}`:key;
    if(val==null || val==='' || (typeof val==='object' && Object.keys(val).length===0))continue;
    if(typeof val==='object')flattenSignatureData(val,path,acc);
    else acc.push(`${path}=${String(val)}`);
  }
  return acc;
}
function parseSignature(raw){
  return Object.fromEntries(String(raw||'').split(',').map(piece=>piece.trim().split(/=(.*)/s).slice(0,2)).filter(pair=>pair.length===2));
}
export function verifyMayaWebhook(payload,headers) {
  if(env.PAYMENT_MODE!=='maya')return false;
  const sent=Number(headers['x-maya-webhook-timestamp']);
  if(!Number.isFinite(sent) || Math.abs(Date.now()-sent)>env.MAYA_WEBHOOK_TIMESTAMP_TOLERANCE_MS)return false;
  const {nonce,v1}=parseSignature(headers['x-maya-webhook-signature']);
  if(!nonce || !/^[\da-f]{100,}$/i.test(v1||''))return false;
  const signingString=`${flattenSignatureData(payload).sort().join('&')}&nonce=${nonce}`;
  return [env.MAYA_WEBHOOK_PUBLIC_KEY_1_BASE64,env.MAYA_WEBHOOK_PUBLIC_KEY_2_BASE64].some(encoded=>{
    try {
      const key=Buffer.from(encoded,'base64').toString('utf8');
      return crypto.verify('RSA-SHA256',Buffer.from(signingString),key,Buffer.from(v1,'hex'));
    }catch{return false;}
  });
}
