// Small helpers shared by Thela's Netlify Functions.

// Functions answer only on Thela's own addresses. Old deploy addresses keep their
// old settings, so they are refused.
const HOSTS = new Set(['thela.site', 'www.thela.site', 'thela-store.netlify.app']);

export function hostAllowed(req) {
  try { return HOSTS.has(new URL(req.url).hostname); } catch { return false; }
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export const refuse = () => json(403, { error: 'Not available here.' });

// The production site address. Store prices are always read from here.
export function siteUrl(env = process.env) {
  return (env.URL || 'https://thela.site').replace(/\/+$/, '');
}
