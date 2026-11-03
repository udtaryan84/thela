// Tells the order page whether an order is paid, and only then hands over the product link.
import { cashfree } from '../lib/cashfree.mjs';
import { hostAllowed, json, refuse } from '../lib/http.mjs';
import { blobStore, orderIdValid, PAID_STATES } from '../lib/orders.mjs';
import { applyOutcome, cashfreeState } from '../lib/status.mjs';

export async function handle(req, { env, fetchFn, orders, links }) {
  if (!hostAllowed(req)) return refuse();
  const id = new URL(req.url).searchParams.get('id');
  if (!orderIdValid(id)) return json(404, { status: 'NOT_FOUND' });
  const order = await orders.get(id);
  if (!order) return json(404, { status: 'NOT_FOUND' });

  if (order.status === 'CREATED' || order.status === 'FAILED') {
    try {
      const state = await cashfreeState(cashfree({ env, fetchFn }), id);
      // Re-read before saving: a refund or webhook may have changed the order while Cashfree answered.
      const fresh = (await orders.get(id)) || order;
      if (applyOutcome(fresh, state)) await orders.set(id, fresh);
      Object.assign(order, fresh);
    } catch (e) {
      console.error('order-status: Cashfree check failed', e.message);
    }
  }

  const base = { status: order.status, store: order.store, storeName: order.storeName, lang: order.lang || 'en', title: order.title, type: order.type };
  if (!PAID_STATES.has(order.status)) return json(200, { ...base, status: order.status === 'CREATED' ? 'PENDING' : order.status });
  const saved = (await links.get(order.store)) || {};
  const link = saved[String(order.product)] || null;
  return json(200, { ...base, status: 'PAID', link });
}

export default async (req) =>
  handle(req, { env: process.env, fetchFn: fetch, orders: await blobStore('orders'), links: await blobStore('deliverables') });
