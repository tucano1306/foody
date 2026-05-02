import type { NextConfig } from 'next';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",   // unsafe-inline needed for Next.js inline scripts (theme init, etc.)
  "style-src 'self' 'unsafe-inline'",    // Tailwind inlines styles
  "img-src 'self' data: blob: https://*.amazonaws.com",
  "font-src 'self'",
  "connect-src 'self' https://*.neon.tech",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  env: {
    // Client-side fetches go through the Next proxy which injects the session JWT.
    NEXT_PUBLIC_API_URL: '/api/proxy',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
