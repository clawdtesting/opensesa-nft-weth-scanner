import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Site-wide password gate (HTTP Basic Auth).
 *
 * When the `PASSWORD` env var is set, every page and API route requires the
 * browser to send Basic credentials whose password matches `PASSWORD` (the
 * username is ignored). If `PASSWORD` is unset the gate is disabled — so local
 * dev and unconfigured deployments are not locked out. Set `PASSWORD` in any
 * deployment you want protected.
 */
const REALM = 'WETH Scanner';

export function middleware(request: NextRequest) {
  const password = process.env.PASSWORD;

  // Gate disabled when no password is configured.
  if (!password) return NextResponse.next();

  // The background cron authenticates itself with CRON_SECRET (Bearer token),
  // not Basic Auth — it must never be gated behind the site password.
  if (request.nextUrl.pathname.startsWith('/api/cron')) return NextResponse.next();

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = decodeBase64(header.slice(6));
    // Basic credentials are "username:password"; only the password is checked.
    const sep = decoded.indexOf(':');
    const provided = sep === -1 ? decoded : decoded.slice(sep + 1);
    if (safeEqual(provided, password)) return NextResponse.next();
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

/** Decode a base64 Basic-Auth payload to a UTF-8 string (Edge-runtime safe). */
function decodeBase64(b64: string): string {
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

/** Constant-time comparison of equal-length strings (avoids trivial timing leaks). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Run on everything except Next's static assets and the favicon. API routes are
 * intentionally included so the data endpoints are protected too.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
