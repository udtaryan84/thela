// Test doubles: an in-memory store and a fake Cashfree/site that records what was sent to it.
export function memoryStore(initial = {}) {
  const m = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  return {
    map: m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async set(k, v) { m.set(k, structuredClone(v)); },
    async keys() { return [...m.keys()]; }
  };
}

export const ENV = {
  URL: 'https://thela.site', CASHFREE_APP_ID: 'app', CASHFREE_SECRET_KEY: 'secret-key',
  ADMIN_TOKEN: 'x'.repeat(40)
};

export const STORE = {
  slug: 'checkouttest', name: 'Test Coach', checkout: 'cashfree', vendorId: 'V1',
  products: [
    { title: 'Workout plan PDF', price: 499 },
    { title: 'Monthly coaching', price: 1000, monthly: true }
  ]
};

// routes: { 'METHOD path-prefix': (url, init) => ({ status, body }) }
export function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    for (const [key, handler] of Object.entries(routes)) {
      const [m, prefix] = key.split(' ');
      if (m === method && url.startsWith(prefix)) {
        const { status = 200, body = {} } = await handler(url, init);
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response('{}', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

export const storeRoute = (store = STORE) => ({
  [`GET https://thela.site/s/${store.slug}/store.json`]: () => ({ body: store })
});

export function req(path, { method = 'GET', body, headers = {}, host = 'thela.site' } = {}) {
  return new Request(`https://${host}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
}
