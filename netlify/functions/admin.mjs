// The owner page's actions: list orders, refund, save delivery links, switch on test-mode Easy Split.
// Every action needs the owner's token.
import { ownerAllowed } from '../lib/auth.mjs';
import { cashfree, CashfreeError, isProduction } from '../lib/cashfree.mjs';
import { hostAllowed, json, refuse } from '../lib/http.mjs';
import { blobStore, orderIdValid, PAID_STATES } from '../lib/orders.mjs';
import { slugValid } from '../lib/store.mjs';

const money = (n) => Math.round(n * 100) / 100;

async function listOrders(orders) {
  const keys = await orders.keys();
  const all = await Promise.all(keys.map((k) => orders.get(k)));
  return all.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200);
}

async function refund(body, { env, fetchFn, orders }) {
  if (!orderIdValid(body.orderId)) return json(400, { error: 'order' });
  const order = await orders.get(body.orderId);
  if (!order) return json(404, { error: 'order' });
  if (!PAID_STATES.has(order.status)) return json(400, { error: 'not_paid' });
  const amount = money(Number(body.amount));
  const left = money(order.price - order.refunded);
  if (!(amount > 0) || amount > left) return json(400, { error: 'amount', left });

  // The coach gives back at most what is left of their share; Thela's fee share covers the rest.
  const vendorShare = money(order.price * order.vendorPercent / 100);
  const vendorPart = money(Math.min(amount, vendorShare - order.vendorRefunded));
  const refundId = `R${order.id.slice(2, 14)}${order.refunds.length + 1}`;
  try {
    await cashfree({ env, fetchFn }).refund(order.id, {
      refund_amount: amount,
      refund_id: refundId,
      // In test mode Cashfree uses the note "SUCCESS" to simulate a refund that goes through.
      refund_note: isProduction(env) ? 'Refund by Thela' : 'SUCCESS',
      ...(vendorPart > 0 ? { refund_splits: [{ vendor_id: order.vendorId, amount: vendorPart }] } : {})
    });
  } catch (e) {
    return json(502, { error: 'gateway', message: e instanceof CashfreeError ? e.message : 'Cashfree did not answer.' });
  }
  order.refunded = money(order.refunded + amount);
  order.vendorRefunded = money(order.vendorRefunded + vendorPart);
  order.refunds.push({ id: refundId, amount, vendorPart, at: new Date().toISOString() });
  order.status = order.refunded >= order.price ? 'REFUNDED' : 'PART_REFUNDED';
  await orders.set(order.id, order);
  return json(200, { order });
}

async function saveLinks(body, { links }) {
  if (!slugValid(body.store) || typeof body.links !== 'object' || !body.links) return json(400, { error: 'store' });
  const clean = {};
  for (const [k, v] of Object.entries(body.links)) {
    if (!/^\d{1,2}$/.test(k)) return json(400, { error: 'index' });
    const url = String(v || '').trim();
    if (!url) continue;
    let u;
    try { u = new URL(url); } catch { return json(400, { error: 'link', index: k }); }
    if (u.protocol !== 'https:') return json(400, { error: 'link', index: k });
    clean[k] = u.href;
  }
  await links.set(body.store, clean);
  return json(200, { links: clean });
}

export async function handle(req, deps) {
  if (!hostAllowed(req)) return refuse();
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!ownerAllowed(req, deps.env)) return json(401, { error: 'token' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_request' }); }

  switch (body.action) {
    case 'orders': return json(200, { orders: await listOrders(deps.orders) });
    case 'refund': return refund(body, deps);
    case 'getLinks':
      if (!slugValid(body.store)) return json(400, { error: 'store' });
      return json(200, { links: (await deps.links.get(body.store)) || {} });
    case 'saveLinks': return saveLinks(body, deps);
    case 'enableEasySplit':
      if (isProduction(deps.env)) return json(400, { error: 'production' });
      try { return json(200, { result: await cashfree(deps).enableEasySplitSandbox() }); }
      catch (e) { return json(502, { error: 'gateway', message: e.message }); }
    case 'easySplitStatus':
      if (isProduction(deps.env)) return json(400, { error: 'production' });
      try { return json(200, { result: await cashfree(deps).easySplitSandboxStatus() }); }
      catch (e) { return json(502, { error: 'gateway', message: e.message }); }
    case 'createTestVendor':
      // Test mode only: a coach on weekly payouts (schedule 11) with Cashfree's published test details.
      if (isProduction(deps.env)) return json(400, { error: 'production' });
      if (!/^[A-Za-z0-9_]{3,50}$/.test(String(body.vendorId || ''))) return json(400, { error: 'vendorId' });
      try {
        return json(200, { result: await cashfree(deps).createVendor({
          vendor_id: body.vendorId, status: 'ACTIVE', name: 'Thela Test Coach', email: 'testcoach@thela.site', phone: '9999999999',
          verify_account: false, dashboard_access: false, schedule_option: 11,
          bank: { account_number: '00011020001772', account_holder: 'Thela Test Coach', ifsc: 'HDFC0000001' },
          kyc_details: { account_type: 'INDIVIDUAL', business_type: 'Education', pan: 'ABCPV1234D' }
        }) });
      } catch (e) { return json(502, { error: 'gateway', message: e.message }); }
    default: return json(400, { error: 'action' });
  }
}

export default async (req) =>
  handle(req, { env: process.env, fetchFn: fetch, orders: await blobStore('orders'), links: await blobStore('deliverables') });
