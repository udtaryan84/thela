import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../netlify/functions/admin.mjs';
import { ENV, fakeFetch, memoryStore, req } from './helpers.mjs';

const ID = 'THabcdefghijkmnopqrstu';
const AUTH = { authorization: `Bearer ${ENV.ADMIN_TOKEN}` };
const paidOrder = (extra = {}) => ({
  id: ID, store: 'checkouttest', product: 1, title: 'Monthly coaching', price: 1000, vendorId: 'V1', vendorPercent: 97.5,
  status: 'PAID', refunded: 0, vendorRefunded: 0, refunds: [], createdAt: '2026-11-03T10:00:00Z',
  buyer: { name: '<img src=x onerror=alert(1)>', email: 'a@b.co', phone: '9876543210' }, ...extra
});

function setup(order = paidOrder(), env = ENV) {
  const orders = memoryStore({ [ID]: order });
  const links = memoryStore();
  const f = fakeFetch({ [`POST https://sandbox.cashfree.com/pg/orders/${ID}/refunds`]: () => ({ body: { refund_status: 'SUCCESS' } }) });
  const call = (body, headers = AUTH) => handle(req('/.netlify/functions/admin', { method: 'POST', body, headers }), { env, fetchFn: f, orders, links });
  return { orders, links, f, call };
}

test('no or wrong token: 401 for every action', async () => {
  const { call } = setup();
  for (const action of ['orders', 'refund', 'getLinks', 'saveLinks', 'enableEasySplit']) {
    assert.equal((await call({ action }, {})).status, 401);
    assert.equal((await call({ action }, { authorization: 'Bearer ' + 'y'.repeat(40) })).status, 401);
  }
});

test('partial refund of 250 cuts the coach share by 250 (AE4)', async () => {
  const { call, f, orders } = setup();
  const res = await call({ action: 'refund', orderId: ID, amount: 250 });
  assert.equal(res.status, 200);
  const sent = f.calls[0].body;
  assert.equal(sent.refund_amount, 250);
  assert.deepEqual(sent.refund_splits, [{ vendor_id: 'V1', amount: 250 }]);
  assert.equal(sent.refund_note, 'SUCCESS');
  const saved = await orders.get(ID);
  assert.equal(saved.status, 'PART_REFUNDED');
  assert.equal(saved.refunded, 250);
});

test('full refund of 1000 takes only the coach share of 975', async () => {
  const { call, f, orders } = setup();
  assert.equal((await call({ action: 'refund', orderId: ID, amount: 1000 })).status, 200);
  assert.deepEqual(f.calls[0].body.refund_splits, [{ vendor_id: 'V1', amount: 975 }]);
  assert.equal((await orders.get(ID)).status, 'REFUNDED');
});

test('refund after a partial refund caps the coach part at what is left of the share', async () => {
  const { call, f } = setup(paidOrder({ status: 'PART_REFUNDED', refunded: 250, vendorRefunded: 250, refunds: [{}] }));
  assert.equal((await call({ action: 'refund', orderId: ID, amount: 750 })).status, 200);
  assert.deepEqual(f.calls[0].body.refund_splits, [{ vendor_id: 'V1', amount: 725 }]);
});

test('once the coach share is fully refunded, the last refund sends no coach split', async () => {
  const { call, f, orders } = setup(paidOrder({ status: 'PART_REFUNDED', refunded: 975, vendorRefunded: 975, refunds: [{}] }));
  assert.equal((await call({ action: 'refund', orderId: ID, amount: 25 })).status, 200);
  assert.equal('refund_splits' in f.calls[0].body, false);
  assert.equal((await orders.get(ID)).status, 'REFUNDED');
});

test('refund larger than what is left: 400 and no Cashfree call', async () => {
  const { call, f } = setup(paidOrder({ status: 'PART_REFUNDED', refunded: 900, vendorRefunded: 900, refunds: [{}] }));
  const res = await call({ action: 'refund', orderId: ID, amount: 200 });
  assert.equal(res.status, 400);
  assert.equal(f.calls.length, 0);
});

test('switching on Easy Split and creating a test coach are refused in production', async () => {
  const { call } = setup(paidOrder(), { ...ENV, CASHFREE_ENV: 'production' });
  assert.equal((await call({ action: 'enableEasySplit' })).status, 400);
  assert.equal((await call({ action: 'createTestVendor', vendorId: 'thelatestcoach' })).status, 400);
});

test('test coach is created on weekly payouts (schedule 11)', async () => {
  const orders = memoryStore();
  const f = fakeFetch({ 'POST https://sandbox.cashfree.com/pg/easy-split/vendors': () => ({ body: { status: 'ACTIVE' } }) });
  const res = await handle(req('/x', { method: 'POST', body: { action: 'createTestVendor', vendorId: 'thelatestcoach' }, headers: AUTH }), { env: ENV, fetchFn: f, orders, links: memoryStore() });
  assert.equal(res.status, 200);
  assert.equal(f.calls[0].body.schedule_option, 11);
  assert.equal(f.calls[0].body.vendor_id, 'thelatestcoach');
});

test('delivery links: https only, saved per store, buyer name comes back as plain data', async () => {
  const { call } = setup();
  assert.equal((await call({ action: 'saveLinks', store: 'checkouttest', links: { 0: 'http://x.example' } })).status, 400);
  assert.equal((await call({ action: 'saveLinks', store: 'checkouttest', links: { 0: 'https://drive.example.com/a', 1: '' } })).status, 200);
  const got = await (await call({ action: 'getLinks', store: 'checkouttest' })).json();
  assert.deepEqual(got.links, { 0: 'https://drive.example.com/a' });
  const list = await (await call({ action: 'orders' })).json();
  assert.equal(list.orders[0].buyer.name, '<img src=x onerror=alert(1)>');
});
