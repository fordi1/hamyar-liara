import { NextRequest } from 'next/server';
import { getPublicOrigin } from '@/lib/public-url';

export class OriginError extends Error {
  readonly status = 403;
  constructor() { super('مبدأ درخواست معتبر نیست'); }
}

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new OriginError();
    return url.origin;
  } catch {
    throw new OriginError();
  }
}

/** Use the same trusted ingress/public-origin contract as platform auth redirects. */
export function checkOrigin(req: Request): void {
  // Fetch metadata provides an extra browser-side check, not an authentication bypass.
  if (req.headers.get('sec-fetch-site') === 'cross-site') throw new OriginError();
  const origin = req.headers.get('origin');
  // Non-browser clients may omit Origin; platform session authentication is still required.
  if (origin === null) return;

  // The configured public origin takes precedence over forwarded headers. Never derive
  // the allowed origin from Origin itself, or allow all Teable/sandbox subdomains.
  const publicRequest = new NextRequest(req.url, { headers: req.headers });
  const expected = normalizeOrigin(getPublicOrigin(publicRequest));
  if (normalizeOrigin(origin) !== expected) throw new OriginError();
}
