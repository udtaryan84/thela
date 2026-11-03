import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { baseUrl, signatureValid } from '../../netlify/lib/cashfree.mjs';
import { newOrderId, orderIdValid } from '../../netlify/lib/orders.mjs';
import { ownerAllowed } from '../../netlify/lib/auth.mjs';
import { loadStore } from '../../netlify/lib/store.mjs';
import { handle as createOrder } from '../../netlify/functions/create-order.mjs';
import { ENV, STORE, fakeFetch, memoryStore, req, storeRoute } from './helpers.mjs';

const sign = (ts, body, secret) => createHmac('sha256', secret).update(ts + body).digest('base64');

test('webhook signature: passes for the right body, fails when one byte changes', () => {
  const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}';
  const sig = sign('1700000000', body, 'secret-key');
  assert.equal(signatureValid(body, '1700000000', sig, 'secret-key'), true);
  assert.equal(signatureValid(body.replace('S', 'X'), '1700000000', sig, 'secret-key'), false);
  assert.equal(signatureValid(body, '1700000001', sig, 'secret-key'), false);
});

test('test mode unless CASHFREE_ENV is production', () => {
  assert.equal(baseUrl({}), 'https://sandbox.cashfree.com/pg');
  assert.equal(baseUrl({ CASHFREE_ENV: 'sandbox' }), 'https://sandbox.cashfree.com/pg');
  assert.equal(baseUrl({ CASHFREE_ENV: 'live' }), 'https://sandbox.cashfree.com/pg');
  assert.equal(baseUrl({ CASHFREE_ENV: 'production' }), 'https://api.cashfree.com/pg');
});

test('order ids are long, random and valid', () => {
  const ids = new Set(Array.from({ length: 1000 }, newOrderId));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.ok(orderIdValid(id) && id.length === 22);
  assert.equal(orderIdValid('TH123'), false);
});

test('owner token: wrong token refused, short ADMIN_TOKEN refused even when it matches', () => {
  const good = 'a'.repeat(40);
  const r = (t) => new Request('https://thela.site/x', { headers: { authorization: `Bearer ${t}` } });
  assert.equal(ownerAllowed(r(good), { ADMIN_TOKEN: good }), true);
  assert.equal(ownerAllowed(r('b'.repeat(40)), { ADMIN_TOKEN: good }), false);
  assert.equal(ownerAllowed(r('short-token-16ch'), { ADMIN_TOKEN: 'short-token-16ch' }), false);
  assert.equal(ownerAllowed(r(good), {}), false);
});

test('store settings are read from the production site address', async () => {
  const f = fakeFetch(storeRoute());
  const s = await loadStore('checkouttest', { env: ENV, fetchFn: f });
  assert.equal(s.vendorId, 'V1');
  assert.equal(f.calls[0].url, 'https://thela.site/s/checkouttest/store.json');
  assert.equal(await loadStore('../etc', { env: ENV, fetchFn: f }), null);
});

test('a request from an old deploy address is refused before any call', async () => {
  const f = fakeFetch(storeRoute());
  const orders = memoryStore();
  const res = await createOrder(
    req('/.netlify/functions/create-order', { method: 'POST', host: '6ae97ee64442d83524aed1c9--thela-store.netlify.app', body: { store: 'checkouttest', product: 0 } }),
    { env: ENV, fetchFn: f, orders }
  );
  assert.equal(res.status, 403);
  assert.equal(f.calls.length, 0);
  assert.equal(orders.map.size, 0);
});
