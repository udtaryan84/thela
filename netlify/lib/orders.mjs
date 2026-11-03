// Where orders and private delivery links are kept: Netlify Blobs, strong consistency.
// Any object with get(key), set(key, value) and keys() works, so tests pass an in-memory one.
import { randomBytes } from 'node:crypto';

export async function blobStore(name) {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name, consistency: 'strong' });
  return {
    get: (key) => store.get(key, { type: 'json' }),
    set: (key, value) => store.setJSON(key, value),
    async keys() { const { blobs } = await store.list(); return blobs.map((b) => b.key); }
  };
}

// Unguessable order ids: the order page shows the product to anyone holding one.
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function newOrderId() {
  const bytes = randomBytes(20);
  let s = 'TH';
  for (const b of bytes) s += ABC[b % ABC.length];
  return s;
}

export const orderIdValid = (id) => typeof id === 'string' && /^TH[A-Za-z0-9]{20}$/.test(id);

// Paid orders keep their product even after a partial refund.
export const PAID_STATES = new Set(['PAID', 'PART_REFUNDED']);
