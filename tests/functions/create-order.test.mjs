import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../netlify/functions/create-order.mjs';
import { ENV, STORE, fakeFetch, memoryStore, req, storeRoute } from './helpers.mjs';

const buyer = { name: 'Asha', email: 'asha@example.com', phone: '9876543210' };
const cashfreeOk = { 'POST https://sandbox.cashfree.com/pg/orders': () => ({ body: { payment_session_id: 'sess_1' } }) };

async function run(body, { env = ENV, routes = {} } = {}) {
  const f = fakeFetch({ ...storeRoute(), ...cashfreeOk, ...routes });
  const orders = memoryStore();
  const res = await handle(req('/.netlify/functions/create-order', { method: 'POST', body }), { env, fetchFn: f, orders });
  return { res, data: await res.json(), f, orders };
}

test('charges the store price even when the browser sends another price (AE2)', async () => {
  const { res, data, f, orders } = await run({ store: 'checkouttest', product: 1, price: 1, ...buyer });
  assert.equal(res.status, 200);
  assert.equal(data.paymentSessionId, 'sess_1');
  assert.equal(data.mode, 'sandbox');
  const sent = f.calls.find((c) => c.url.endsWith('/pg/orders')).body;
  assert.equal(sent.order_amount, 1000);
  assert.equal(sent.order_id, data.orderId);
  assert.deepEqual(sent.order_splits, [{ vendor_id: 'V1', percentage: 97.5 }]);
  assert.equal(sent.order_meta.return_url, 'https://thela.site/order.html?id={order_id}');
  const saved = await orders.get(data.orderId);
  assert.equal(saved.status, 'CREATED');
  assert.equal(saved.price, 1000);
  assert.equal(saved.type, 'plan');
});

test('split follows THELA_FEE_PERCENT when set', async () => {
  const { f } = await run({ store: 'checkouttest', product: 0, ...buyer }, { env: { ...ENV, THELA_FEE_PERCENT: '3' } });
  assert.deepEqual(f.calls.find((c) => c.url.endsWith('/pg/orders')).body.order_splits, [{ vendor_id: 'V1', percentage: 97 }]);
});

test('unknown store, bad product index or a store without checkout: 400 and no Cashfree call', async () => {
  for (const body of [
    { store: 'nosuchstore', product: 0, ...buyer },
    { store: 'checkouttest', product: 5, ...buyer },
    { store: 'checkouttest', product: -1, ...buyer }
  ]) {
    const { res, f } = await run(body);
    assert.equal(res.status, 400);
    assert.equal(f.calls.some((c) => c.url.includes('cashfree')), false);
  }
  const plain = { ...STORE, checkout: undefined };
  const f = fakeFetch({ ...storeRoute(plain), ...cashfreeOk });
  const res = await handle(req('/x', { method: 'POST', body: { store: 'checkouttest', product: 0, ...buyer } }), { env: ENV, fetchFn: f, orders: memoryStore() });
  assert.equal(res.status, 400);
});

test('rejects a bad phone, a name with angle brackets and an over-long name', async () => {
  assert.equal((await run({ store: 'checkouttest', product: 0, ...buyer, phone: '12345' })).res.status, 400);
  assert.equal((await run({ store: 'checkouttest', product: 0, ...buyer, name: '<img src=x>' })).res.status, 400);
  assert.equal((await run({ store: 'checkouttest', product: 0, ...buyer, name: 'a'.repeat(81) })).res.status, 400);
  assert.equal((await run({ store: 'checkouttest', product: 0, ...buyer, phone: '+91 98765 43210' })).res.status, 200);
});

test('Cashfree error gives a 502 with a safe message and saves nothing', async () => {
  const { res, data, orders } = await run(
    { store: 'checkouttest', product: 0, ...buyer },
    { routes: { 'POST https://sandbox.cashfree.com/pg/orders': () => ({ status: 400, body: { message: 'order_splits invalid' } }) } }
  );
  assert.equal(res.status, 502);
  assert.equal(data.error, 'gateway');
  assert.equal(orders.map.size, 0);
});
