import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handle } from '../../netlify/functions/cashfree-webhook.mjs';
import { ENV, memoryStore, req } from './helpers.mjs';

const ID = 'THabcdefghijkmnopqrstu';
const event = (type) => JSON.stringify({ type, data: { order: { order_id: ID } } });
const signed = (body, secret = ENV.CASHFREE_SECRET_KEY) => {
  const ts = '1730620000';
  return { 'x-webhook-timestamp': ts, 'x-webhook-signature': createHmac('sha256', secret).update(ts + body).digest('base64') };
};
const call = (orders, body, headers) => handle(req('/.netlify/functions/cashfree-webhook', { method: 'POST', body, headers }), { env: ENV, orders });

test('bad signature: 401 and nothing changes', async () => {
  const orders = memoryStore({ [ID]: { id: ID, status: 'CREATED' } });
  const body = event('PAYMENT_SUCCESS_WEBHOOK');
  const res = await call(orders, body, signed(body, 'wrong-secret'));
  assert.equal(res.status, 401);
  assert.equal((await orders.get(ID)).status, 'CREATED');
});

test('success webhook marks PAID; the same webhook twice leaves one PAID record', async () => {
  const orders = memoryStore({ [ID]: { id: ID, status: 'CREATED' } });
  const body = event('PAYMENT_SUCCESS_WEBHOOK');
  assert.equal((await call(orders, body, signed(body))).status, 200);
  const first = await orders.get(ID);
  assert.equal(first.status, 'PAID');
  assert.equal((await call(orders, body, signed(body))).status, 200);
  assert.deepEqual(await orders.get(ID), first);
  assert.equal(orders.map.size, 1);
});

test('a failure only marks a waiting order; it never undoes a payment', async () => {
  const waiting = memoryStore({ [ID]: { id: ID, status: 'CREATED' } });
  const failed = event('PAYMENT_FAILED_WEBHOOK');
  await call(waiting, failed, signed(failed));
  assert.equal((await waiting.get(ID)).status, 'FAILED');

  const paid = memoryStore({ [ID]: { id: ID, status: 'PAID' } });
  await call(paid, failed, signed(failed));
  assert.equal((await paid.get(ID)).status, 'PAID');
});
