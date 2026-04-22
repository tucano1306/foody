import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import RotatingWord from '@/components/home/RotatingWord';

const TRUST_STATS = [
  { v: '+6.000', l: 'hogares activos' },
  { v: '1.2M', l: 'productos rastreados' },
  { v: '24%', l: 'menos desperdicio' },
  { v: '$180', l: 'ahorro promedio/mes' },
];

const SOLUTIONS = [
  {
    icon: '📦',
    t: 'Despensa inteligente',
    d: 'Controla stock en tiempo real con alertas automáticas cuando algo está por acabarse.',
  },
  {
    icon: '🛒',
    t: 'Lista predictiva',
    d: 'IA sugiere qué comprar según tu consumo histórico y lo agregás con un tap.',
  },
  {
    icon: '🧾',
    t: 'Tickets multi-tienda',
    d: 'Fotografía el ticket, Foody reparte precios entre productos y tiendas automáticamente.',
  },
  {
    icon: '📊',
    t: 'Análisis por supermercado',
    d: 'Gráficos donut de gasto por tienda y categoría para decidir dónde comprás mejor.',
  },
  {
    icon: '💳',
    t: 'Pagos mensuales',
    d: 'Seguimiento de cuentas recurrentes con recordatorios y estado de pago compartido.',
  },
  {
    icon: '🏡',
    t: 'Modo hogar',
    d: 'Invitá a tu familia y todos ven el mismo stock, tickets y lista — en tiempo real.',
  },
];

const AI_POINTS = [
  'Sugerencias inteligentes basadas en tu consumo',
  'Precios prellenados desde el último ticket',
  'Alertas de stock bajo antes de que se acabe',
  'Gastos por supermercado y categoría',
];

const AI_SUGGESTIONS = [
  { e: '🚨', n: 'Leche', s: 'agotado' },
  { e: '⚠️', n: 'Pan integral', s: 'poco' },
  { e: '⚠️', n: 'Huevos', s: 'poco' },
  { e: '🚨', n: 'Café', s: 'agotado' },
];

export default async function Home() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect('/home');
  }

  return (
    <main className="min-h-screen bg-white text-navy-800 flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-navy-900/95 backdrop-blur border-b border-navy-800 text-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-black text-xl">
            <Image
              src="/logo.png"
              alt="Foody"
              width={40}
              height={40}
              priority
              className="w-10 h-10 object-contain drop-shadow-md"
            />
            <span className="tracking-tight">Foody</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-navy-100">
            <a href="#solutions" className="hover:text-white transition">Soluciones</a>
            <a href="#features" className="hover:text-white transition">Características</a>
            <a href="#trust" className="hover:text-white transition">Clientes</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-semibold text-navy-100 hover:text-white px-3 py-1.5 transition"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login?mode=register"
              className="text-sm font-bold rounded-md bg-brand-500 hover:bg-brand-400 text-navy-900 px-4 py-2 shadow-md shadow-brand-500/30 transition"
            >
              Comenzar gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div aria-hidden className="absolute inset-0 bg-linear-to-br from-navy-900 via-navy-800 to-navy-900" />
        <div aria-hidden className="absolute -top-24 -right-24 w-140 h-140 rounded-full bg-brand-500/15 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-24 w-120 h-120 rounded-full bg-brand-600/10 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-brand-300 bg-brand-500/10 border border-brand-400/30 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
              <span>Reconocida como la #1 app de despensa hogareña</span>
            </p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">
              Control inteligente para tu{' '}
              <RotatingWord
                words={['despensa', 'lista de compras', 'gastos', 'cocina', 'hogar']}
                className="whitespace-nowrap"
              />
              <br />
              sin la complejidad de un ERP.
            </h1>
            <p className="text-lg text-navy-100 max-w-xl">
              Foody unifica tu despensa, lista de compras, tickets y pagos mensuales en una sola plataforma — para que compres menos, tires menos y ahorres más cada mes.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/login?mode=register"
                className="rounded-md bg-brand-500 hover:bg-brand-400 text-navy-900 font-bold px-6 py-3 shadow-lg shadow-brand-500/30 transition"
              >
                Comenzar gratis →
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-navy-300/40 hover:border-white text-white font-semibold px-6 py-3 transition"
              >
                Iniciar sesión
              </Link>
            </div>
            <p className="text-xs text-navy-200 pt-1">
              Sin tarjeta de crédito · Comparte con tu hogar · PWA instalable
            </p>
          </div>

          {/* Hero stats card */}
          <div className="relative">
            <div className="relative rounded-2xl bg-white text-navy-800 p-6 shadow-2xl border border-navy-100">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Panel en vivo</span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>actualizado</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-navy-50 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-navy-500 font-semibold">Ahorro / mes</p>
                  <p className="text-3xl font-black text-navy-900 mt-1">$124</p>
                </div>
                <div className="rounded-xl bg-brand-50 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-brand-700 font-semibold">Productos OK</p>
                  <p className="text-3xl font-black text-brand-700 mt-1">87%</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Tickets</p>
                  <p className="text-3xl font-black text-emerald-700 mt-1">24</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">Por acabarse</p>
                  <p className="text-3xl font-black text-amber-700 mt-1">3</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-navy-500">
                <span>Supermercado principal</span>
                <span className="font-bold text-navy-800">Mercadona</span>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 rounded-xl bg-brand-500 text-navy-900 px-4 py-2 font-bold text-sm shadow-lg shadow-brand-500/30">
              –18% desperdicio
            </div>
          </div>
        </div>
      </section>

      {/* Trust band */}
      <section id="trust" className="bg-navy-50 border-y border-navy-100">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-navy-500 mb-6">
            Pensado para miles de hogares
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {TRUST_STATS.map((s) => (
              <div key={s.l}>
                <p className="text-3xl md:text-4xl font-black text-navy-900">{s.v}</p>
                <p className="text-xs md:text-sm text-navy-500 mt-1 uppercase tracking-wider font-semibold">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section id="solutions" className="bg-white">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-2">
              Una plataforma, todo bajo control
            </p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-navy-900">
              De inventario, compras y gastos caóticos → a flujo operativo.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {SOLUTIONS.map((f) => (
              <div
                key={f.t}
                className="group rounded-2xl border border-navy-100 bg-white p-6 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/5 transition"
              >
                <div className="w-12 h-12 rounded-xl bg-navy-50 group-hover:bg-brand-50 flex items-center justify-center text-2xl mb-4 transition">
                  {f.icon}
                </div>
                <h3 className="font-bold text-lg text-navy-900 mb-2">{f.t}</h3>
                <p className="text-sm text-navy-600 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI feature banner */}
      <section id="features" className="bg-navy-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-300">
              IA integrada · Personalización predictiva
            </p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">
              Conocé a Foody AI: tu asistente de cocina siempre activo.
            </h2>
            <p className="text-navy-100">
              Detecta qué está por agotarse, prellena precios según compras anteriores, y prioriza la lista para que nunca te falte lo esencial. Menos fricción, más ahorro.
            </p>
            <ul className="space-y-3 text-sm">
              {AI_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <span className="text-brand-400 font-black">→</span>
                  <span className="text-navy-100">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-2xl bg-navy-800 border border-navy-700 p-6 shadow-2xl">
              <p className="text-[11px] uppercase tracking-widest font-bold text-brand-400 mb-4">
                ✨ Sugerencias para ti
              </p>
              <div className="space-y-2">
                {AI_SUGGESTIONS.map((p) => (
                  <div
                    key={p.n}
                    className="flex items-center gap-3 rounded-lg bg-navy-900/60 border border-navy-700 px-3 py-2.5"
                  >
                    <span className="text-lg">{p.e}</span>
                    <span className="flex-1 text-sm font-semibold">{p.n}</span>
                    <span className="text-[10px] uppercase tracking-wider text-navy-300">{p.s}</span>
                    <span className="text-brand-400 font-black">+</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-white">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-navy-900 mb-4">
            Foody hace que controlar tu cocina sea simple. Te mostramos cómo.
          </h2>
          <p className="text-navy-600 mb-8">
            Empezá gratis hoy. Sin tarjeta, sin compromiso.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/login?mode=register"
              className="rounded-md bg-brand-500 hover:bg-brand-400 text-navy-900 font-bold px-8 py-3.5 shadow-lg shadow-brand-500/30 transition"
            >
              Crear cuenta gratis →
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-navy-200 hover:border-navy-400 text-navy-800 font-semibold px-8 py-3.5 transition"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy-900 text-navy-200 border-t border-navy-800">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-white">
            <Image
              src="/logo.png"
              alt="Foody"
              width={28}
              height={28}
              className="w-7 h-7 object-contain"
            />
            <span>Foody</span>
          </div>
          <p className="text-xs text-navy-300">
            © {new Date().getFullYear()} Foody · hecho para tu cocina
          </p>
        </div>
      </footer>
    </main>
  );
}
