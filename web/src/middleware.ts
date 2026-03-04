export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login
     * - /api/auth (NextAuth routes)
     * - /api/health (health check)
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico
     */
    '/((?!login|api/auth|api/health|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
