// Owner page access: a long random token set as ADMIN_TOKEN in Netlify.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s)).digest();

export function ownerAllowed(req, env = process.env) {
  const token = env.ADMIN_TOKEN || '';
  if (token.length < 32) return false;
  const header = req.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  return given.length > 0 && timingSafeEqual(digest(given), digest(token));
}
