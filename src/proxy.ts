import { NextRequest, NextResponse } from 'next/server';
import { detectPromptInjection, detectSQLInjection } from '@/lib/validators';

const PROTECTED_API_ROUTES = ['/api/triage', '/api/chat', '/api/preventive'];
const ADMIN_ROUTES = ['/api/dashboard', '/api/members'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Inject correlation ID header ───────────────────────────────────────
  const requestId = crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // ── API-only validation ────────────────────────────────────────────────
  if (!pathname.startsWith('/api/')) return response;

  // ── Block suspicious query parameters ─────────────────────────────────
  const queryString = request.nextUrl.search;
  if (queryString) {
    const injectionCheck = detectPromptInjection(queryString);
    const sqlCheck = detectSQLInjection(queryString);
    if (!injectionCheck.valid || !sqlCheck.valid) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400, headers: { 'X-Request-Id': requestId } },
      );
    }
  }

  // ── CORS for API routes ────────────────────────────────────────────────
  response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }

  // ── Content-Type enforcement for POST routes ───────────────────────────
  if (request.method === 'POST' && PROTECTED_API_ROUTES.some(r => pathname.startsWith(r))) {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415, headers: { 'X-Request-Id': requestId } },
      );
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
