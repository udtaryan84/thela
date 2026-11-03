// A store's public settings (prices, coach's vendor id), written by scripts/build.ps1 as
// site/s/<slug>/store.json. Always read from the production site, never from the request's address.
import { siteUrl } from './http.mjs';

export const slugValid = (s) => typeof s === 'string' && /^[a-z0-9]{3,30}$/.test(s);

export async function loadStore(slug, { env = process.env, fetchFn = fetch } = {}) {
  if (!slugValid(slug)) return null;
  const res = await fetchFn(`${siteUrl(env)}/s/${slug}/store.json`, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

// The product a buyer can pay for through checkout, or null.
export function checkoutProduct(store, index) {
  if (!store || store.checkout !== 'cashfree' || !store.vendorId) return null;
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= (store.products || []).length) return null;
  const p = store.products[i];
  if (!p || !(Number(p.price) >= 1)) return null;
  return { index: i, title: String(p.title), price: Number(p.price), type: p.type || (p.monthly ? 'plan' : 'file') };
}
