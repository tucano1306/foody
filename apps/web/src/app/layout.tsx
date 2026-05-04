import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: { default: 'Foody', template: '%s | Foody' },
  description: 'Controla tu despensa y pagos mensuales',
  manifest: '/manifest.webmanifest',
  applicationName: 'Foody',
  appleWebApp: {
    capable: true,
    title: 'Foody',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

// Blocking script — reads localStorage before paint to avoid FOUC.
// Falls back to dark if no preference is stored.
const themeInitScript = `(function(){
  var t = localStorage.getItem('foody-theme');
  document.documentElement.classList.toggle('dark', t !== 'light');
})();`;

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Preconnect to external image CDN to reduce LCP latency */}
        <link rel="preconnect" href="https://foody-uploads.s3.amazonaws.com" />
        <link rel="dns-prefetch" href="https://onesignal.com" />
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-screen bg-stone-50">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
