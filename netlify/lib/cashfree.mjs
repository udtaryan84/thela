// Cashfree Payment Gateway calls. Test mode (sandbox) unless CASHFREE_ENV is "production".
import { createHmac, timingSafeEqual } from 'node:crypto';

export const API_VERSION = '2026-01-01';

export const isProduction = (env = process.env) => env.CASHFREE_ENV === 'production';

export function baseUrl(env = process.env) {
  return isProduction(env) ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

export class CashfreeError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function cashfree({ env = process.env, fetchFn = fetch } = {}) {
  async function call(method, path, body) {
    const res = await fetchFn(baseUrl(env) + path, {
      method,
      headers: {
        'x-client-id': env.CASHFREE_APP_ID || '',
        'x-client-secret': env.CASHFREE_SECRET_KEY || '',
        'x-api-version': API_VERSION,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new CashfreeError(res.status, data.message || `Cashfree returned ${res.status}`);
    return data;
  }
  const id = (s) => encodeURIComponent(s);
  return {
    createOrder: (payload) => call('POST', '/orders', payload),
    getOrder: (orderId) => call('GET', `/orders/${id(orderId)}`),
    getPayments: (orderId) => call('GET', `/orders/${id(orderId)}/payments`),
    refund: (orderId, payload) => call('POST', `/orders/${id(orderId)}/refunds`, payload),
    createVendor: (payload) => call('POST', '/easy-split/vendors', payload),
    // Test mode only (Cashfree API reference 2026-01-01). No request body; answers 202 and sets up
    // sample vendors in the background. Not repeatable: each call adds another pair of sample vendors.
    enableEasySplitSandbox() {
      if (isProduction(env)) throw new CashfreeError(400, 'Only available in test mode.');
      return call('POST', '/simulate/easy-split/enable');
    },
    easySplitSandboxStatus: () => call('GET', '/simulate/easy-split/status')
  };
}

// Webhook signature: base64 HMAC-SHA256 of timestamp + raw body, keyed with the secret key.
export function signatureValid(rawBody, timestamp, signature, secret) {
  if (!rawBody || !timestamp || !signature || !secret) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(timestamp + rawBody).digest('base64'));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
