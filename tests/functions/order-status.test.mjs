import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../netlify/functions/order-status.mjs';
import { ENV, fakeFetch, memoryStore, req } from './helpers.mjs';

const ID = 'THabcdefghijkmnopqrstu';
const order = (status) => ({ id: ID, store: 'checkouttest', storeName: 'Test Coach', product: 0, title: 'Workout plan PDF', type: 'file', price: 499, status });
const LINKS = { checkouttest: { 0: 'https://drive.example.com/plan' } };
const CF = 'https://sandbox.cashfree.com/pg/orders/' + ID;

async function run(saved, routes = {}, links = LINKS, id = ID) {
  const orders = memoryStore(saved ? { [ID]: saved } : {});
  const f = fakeFetch(routes);
  const res = await handle(req(`/.netlify/functions/order-status?id=${id}`), { env: ENV, fetchFn: f, orders, links: memoryStore(links) });
  return { res, data: await res.json(), orders, f };
}

test('paid order returns the link (AE1)', async () => {
  const { data } = await run(order('PAID'));
  assert.equal(data.status, 'PAID');
  assert.equal(data.link, 'https://drive.example.com/plan');
});

test('unpaid order never returns the link (R3)', async () => {
  const { data } = await run(order('CREATED'), {
    [`GET ${CF}/payments`]: () => ({ body: [] }),
    [`GET ${CF}`]: () => ({ body: { order_status: 'ACTIVE' } })
  });
  assert.equal(data.status, 'PENDING');
  assert.equal(data.link, undefined);
});

test('Cashfree says PAID while the saved order says CREATED: order updated, link returned', async () => {
  const { data, orders } = await run(order('CREATED'), { [`GET ${CF}`]: () => ({ body: { order_status: 'PAID' } }) });
  assert.equal(data.status, 'PAID');
  assert.equal(data.link, 'https://drive.example.com/plan');
  assert.equal((await orders.get(ID)).status, 'PAID');
});

test('ACTIVE order whose latest payment FAILED shows failed (AE3)', async () => {
  const { data } = await run(order('CREATED'), {
    [`GET ${CF}/payments`]: () => ({ body: [
      { payment_status: 'FAILED', payment_time: '2026-11-03T10:00:00+05:30' }
    ] }),
    [`GET ${CF}`]: () => ({ body: { order_status: 'ACTIVE' } })
  });
  assert.equal(data.status, 'FAILED');
  assert.equal(data.link, undefined);
});

test('a FAILED order that later shows PAID returns the link', async () => {
  const { data } = await run(order('FAILED'), { [`GET ${CF}`]: () => ({ body: { order_status: 'PAID' } }) });
  assert.equal(data.status, 'PAID');
  assert.ok(data.link);
});

test('paid order with no saved link says it is on its way', async () => {
  const { data } = await run(order('PAID'), {}, {});
  assert.equal(data.status, 'PAID');
  assert.equal(data.link, null);
});

test('unknown or malformed id returns 404', async () => {
  assert.equal((await run(null)).res.status, 404);
  assert.equal((await run(null, {}, LINKS, 'nonsense')).res.status, 404);
});
