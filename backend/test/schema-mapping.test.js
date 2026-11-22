import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const file=(p)=>readFileSync(new URL(`../src/routes/${p}`,import.meta.url),'utf8');
test('backend uses actual user schema fields',()=>{
  const content=file('auth.js');
  for(const column of ['name','email','password_hash','role'])assert.ok(content.includes(column));
});
test('frontend compatible cart body and response keys',()=>{
  const content=file('cart.js');
  for(const key of ['productId','quantity','unit_price','line_total','products','subtotal'])assert.ok(content.includes(key));
});
