import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const root=new URL('../',import.meta.url);
const sql=readFileSync(new URL('sql/01_atomic_orders.sql',root),'utf8');
const server=readFileSync(new URL('src/server.js',root),'utf8');
test('database migrations provide atomic checkout and guarded payment transitions',()=>{
  for(const proc of ['place_store_order','transition_store_order','confirm_cod_payment','record_maya_payment_event','attach_maya_checkout','get_store_dashboard'])
    assert.ok(sql.includes(`FUNCTION public.${proc}`), `${proc} missing`);
  assert.match(sql,/FOR UPDATE OF c,p/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public.place_store_order/);
});
test('frontend contract API routers are mounted',()=>{
  for(const endpoint of ['/api/v1/auth','/api/v1/products','/api/v1/categories','/api/v1/cart','/api/v1/orders','/api/v1/admin','/api/v1/store/config'])
    assert.ok(server.includes(endpoint),`${endpoint} not mounted`);
});
