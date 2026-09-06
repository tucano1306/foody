import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { CelebrationProvider } from '@/components/ui/Celebration';

/**
 * Inter, auto-alojada por Next en tiempo de compilación.
 *
 * `globals.css` pedía "Inter" desde hacía meses sin que nadie la cargara: no
 * hay `next/font`, no hay `<link>` a Google y `public/` no tiene ni un archivo
 * de fuente, así que la app caía siempre en la fuente por defecto del sistema
 * —Segoe UI en Windows, Roboto en Android, San Francisco en iOS—. Tres caras
 * distintas para el mismo producto, y ninguna elegida.
 *
 * `next/font/google` la descarga al compilar y la sirve desde el propio
 * dominio, así que cumple el `font-src 'self'` del CSP (next.config.ts) sin
 * tocarlo y sin una sola petición a un tercero en tiempo de ejecución.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // La app es toda cifras y etiquetas: sin estos cortes, los pesos gruesos se
  // sintetizan y las cantidades se ven emborronadas.
  weight: ['400', '500', '600', '700', '800'],
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
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#070d18' },
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
    <html lang="es" className={inter.variable} suppressHydrationWarning>
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
