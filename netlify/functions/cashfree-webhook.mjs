// Cashfree tells Thela about payments here, as a backup to the order page check.
// Signed calls only; repeat calls change nothing.
import { signatureValid } from '../lib/cashfree.mjs';
import { json } from '../lib/http.mjs';
import { blobStore } from '../lib/orders.mjs';
import { applyOutcome } from '../lib/status.mjs';

const OUTCOME = {
  PAYMENT_SUCCESS_WEBHOOK: 'PAID',
  PAYMENT_FAILED_WEBHOOK: 'FAILED',
  PAYMENT_USER_DROPPED_WEBHOOK: 'FAILED'
};

export async function handle(req, { env, orders }) {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const raw = await req.text();
  const ok = signatureValid(raw, req.headers.get('x-webhook-timestamp'), req.headers.get('x-webhook-signature'), env.CASHFREE_SECRET_KEY);
  if (!ok) return json(401, { error: 'signature' });

  let event;
  try { event = JSON.parse(raw); } catch { return json(200, { ok: true }); }
  const outcome = OUTCOME[event.type];
  const id = event.data && event.data.order && event.data.order.order_id;
  if (!outcome || !id) return json(200, { ok: true });

  const order = await orders.get(id);
  if (!order) return json(200, { ok: true });
  if (applyOutcome(order, outcome)) await orders.set(id, order);
  return json(200, { ok: true });
}

export default async (req) => handle(req, { env: process.env, orders: await blobStore('orders') });
