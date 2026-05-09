import type { NextConfig } from 'next';

const CSP = [
  "default-src 'self'",
  // unsafe-inline for Next.js; wasm-unsafe-eval for Tesseract.js WebAssembly; CDNs for OneSignal + Tesseract
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.onesignal.com https://api.onesignal.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://onesignal.com https://*.onesignal.com",    // Tailwind inlines styles + OneSignal prompt CSS
  "img-src 'self' data: blob: https://*.amazonaws.com https://img.onesignal.com",
  "font-src 'self'",
  // cdn.jsdelivr.net: Tesseract.js WASM core + traineddata downloads
  "connect-src 'self' https://*.neon.tech https://onesignal.com https://*.onesignal.com https://cdn.jsdelivr.net",
  // blob: needed for Tesseract.js blob-URL web workers; https://cdn.jsdelivr.net for direct worker URL fallback
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
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
