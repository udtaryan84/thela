// Starts a Cashfree checkout for one product on a checkout-enabled store.
// The price and the coach's vendor id come from the store's settings, never from the browser.
import { cashfree, CashfreeError, isProduction } from '../lib/cashfree.mjs';
import { hostAllowed, json, refuse, siteUrl } from '../lib/http.mjs';
import { blobStore, newOrderId } from '../lib/orders.mjs';
import { loadStore, checkoutProduct } from '../lib/store.mjs';

const DEFAULT_FEE_PERCENT = 2.5; // Thela's share to cover Cashfree's fee; THELA_FEE_PERCENT overrides it
const BAD_TEXT = /[<>\u0000-\u001f\u007f]/;

export async function handle(req, { env, fetchFn, orders }) {
  if (!hostAllowed(req)) return refuse();
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_request' }); }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!name || name.length > 80 || BAD_TEXT.test(name)) return json(400, { error: 'name' });
  if (email.length > 254 || BAD_TEXT.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'email' });
  if (!/^[6-9]\d{9}$/.test(phone)) return json(400, { error: 'phone' });

  const store = await loadStore(String(body.store || ''), { env, fetchFn });
  const product = checkoutProduct(store, body.product);
  if (!product) return json(400, { error: 'product' });

  const fee = Number(env.THELA_FEE_PERCENT ?? DEFAULT_FEE_PERCENT);
  const vendorPercent = Math.round((100 - (Number.isFinite(fee) && fee >= 0 && fee < 100 ? fee : DEFAULT_FEE_PERCENT)) * 100) / 100;
  const orderId = newOrderId();
  const site = siteUrl(env);
  let created;
  try {
    created = await cashfree({ env, fetchFn }).createOrder({
      order_id: orderId,
      order_amount: product.price,
      order_currency: 'INR',
      customer_details: { customer_id: `c${phone}`, customer_name: name, customer_email: email, customer_phone: phone },
      order_meta: {
        return_url: `${site}/order.html?id={order_id}`,
        notify_url: `${site}/.netlify/functions/cashfree-webhook`
      },
      order_note: product.title.slice(0, 200),
      order_tags: { store: store.slug, product: String(product.index) },
      order_splits: [{ vendor_id: store.vendorId, percentage: vendorPercent }]
    });
  } catch (e) {
    console.error('create-order: Cashfree refused the order', e instanceof CashfreeError ? e.status : '', e.message);
    return json(502, { error: 'gateway' });
  }

  await orders.set(orderId, {
    id: orderId, store: store.slug, storeName: store.name, lang: store.lang === 'hi' ? 'hi' : 'en', product: product.index, title: product.title,
    type: product.type, price: product.price, vendorId: store.vendorId, vendorPercent,
    buyer: { name, email, phone }, status: 'CREATED', refunded: 0, vendorRefunded: 0, refunds: [],
    createdAt: new Date().toISOString()
  });
  return json(200, {
    orderId,
    paymentSessionId: created.payment_session_id,
    mode: isProduction(env) ? 'production' : 'sandbox'
  });
}

export default async (req) =>
  handle(req, { env: process.env, fetchFn: fetch, orders: await blobStore('orders') });
