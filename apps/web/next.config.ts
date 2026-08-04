import type { NextConfig } from 'next';

const CSP = [
  "default-src 'self'",
  // unsafe-inline for Next.js; wasm-unsafe-eval for Tesseract.js WebAssembly; cdn.jsdelivr.net for Tesseract
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  // Fotos de productos (antes embebidas en la BD). El host real tiene DOS
  // niveles —"<store>.public.blob.vercel-storage.com"— y el comodín de CSP
  // cubre un solo nivel: con `*.blob.vercel-storage.com` la miniatura se veía
  // (va por /_next/image, mismo origen) pero el zoom, que usa la URL directa,
  // salía roto. Se listan ambas formas por si el host cambia de estructura.
  "img-src 'self' data: blob: https://*.amazonaws.com https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com https://*.vercel-storage.com",
  "font-src 'self'",
  // cdn.jsdelivr.net: Tesseract.js WASM core + traineddata downloads
  "connect-src 'self' https://*.neon.tech https://cdn.jsdelivr.net",
  // blob: for Tesseract.js workers (blob wraps importScripts to CDN)
  "worker-src 'self' blob:",
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
      {
        // `**` y no `*`: el host tiene dos niveles antes del dominio
        // (<store>.public.blob.vercel-storage.com).
        protocol: 'https',
        hostname: '**.blob.vercel-storage.com',
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
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
