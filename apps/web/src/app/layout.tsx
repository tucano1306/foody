import type { Metadata, Viewport } from 'next';
import { Geist, Outfit } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { CelebrationProvider } from '@/components/ui/Celebration';

/**
 * Las dos caras de Foody Índigo, auto-alojadas por Next al compilar.
 *
 * Geist para leer: neutra, técnica y con cifras de ancho fijo limpias —la app
 * es casi toda importes—. Outfit para los titulares: geométrica y redonda, en
 * peso ligero (300) da el titular grande y sereno del estilo que pidió el
 * dueño, y es la alternativa abierta a la fuente propietaria de la referencia.
 *
 * `next/font/google` las descarga al compilar y las sirve desde el propio
 * dominio, así que cumplen el `font-src 'self'` del CSP (next.config.ts) sin
 * tocarlo y sin una sola petición a un tercero en tiempo de ejecución. Las dos
 * son variables: un archivo por familia cubre todos los pesos.
 */
const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
});

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
});

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
  // El color de la barra del sistema ahora coincide con `--page` en cada tema.
  // Antes el claro era #f8fafc y el fondo real #f0f6fd: en Android se veía una
  // franja de otro gris justo encima de la app.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#13131f' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

// Blocking script — reads localStorage before paint to avoid FOUC.
// Falls back to light if no preference is stored.
const themeInitScript = `(function(){
  var t = localStorage.getItem('foody-theme');
  document.documentElement.classList.toggle('dark', t === 'dark');
})();`;

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${geist.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        {/* Preconnect to external image CDN to reduce LCP latency */}
        <link rel="preconnect" href="https://foody-uploads.s3.amazonaws.com" />
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          <ToastProvider>
            <CelebrationProvider>{children}</CelebrationProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
