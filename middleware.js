import { NextResponse } from 'next/server';

/**
 * The app shows commission and bonus figures, so it must never be readable by
 * the open internet. Everything is behind HTTP Basic auth using
 * PRIME_ACCESS_PASSWORD. If that variable is missing the site refuses to serve
 * anything rather than failing open.
 */
export function middleware(req) {
  const password = process.env.PRIME_ACCESS_PASSWORD;

  if (!password) {
    return new NextResponse(
      'PRIME_ACCESS_PASSWORD is not set. The app stays locked until it is configured.',
      { status: 503, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(':') + 1);
      if (supplied === password) return NextResponse.next();
    } catch {
      /* fall through to challenge */
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    // header value must be ASCII only
    headers: { 'WWW-Authenticate': 'Basic realm="iApply Prime - internal"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
