import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';

interface Props {
  readonly user: { name: string | null; avatarUrl: string | null; email: string };
}

export default function Navbar({ user }: Props) {
  return (
    <header className="bg-brand-700 text-white shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-3 sm:px-4 max-w-5xl flex items-center justify-between gap-2 h-16">
        {/* ─── Logo ─────────────────────────────────────────────────────────── */}
        <Link href="/home" className="flex items-center gap-2 font-bold text-xl text-white shrink-0">
          <Image
            src="/logo.png"
            alt="Foody"
            width={40}
            height={40}
            priority
            className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-md"
          />
          <span className="hidden xs:inline sm:inline">Foody</span>
        </Link>

        {/* ─── Navigation ───────────────────────────────────────────────────── */}
        <nav className="hidden sm:flex items-center gap-1">
          {[
            { href: '/home', label: '🏠 Casa' },
            { href: '/supermarket', label: '🛒 Super' },
            { href: '/products', label: '📦 Productos' },
            { href: '/shopping-trips', label: '🧾 Compras' },
            { href: '/payments', label: '💳 Pagos' },
            { href: '/household', label: '🏡 Hogar' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-full text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* ─── User ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ThemeToggle />
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.name ?? user.email}
              width={32}
              height={32}
              className="rounded-full ring-2 ring-white/20"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-energy-400 text-brand-800 flex items-center justify-center text-sm font-bold ring-2 ring-white/20">
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <span className="hidden sm:block text-sm text-white/80 max-w-30 truncate">
            {user.name ?? user.email}
          </span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs text-white/60 hover:text-white transition px-2 py-1 rounded-md hover:bg-white/10"
            >
              Salir
            </button>
          </form>
        </div>
      </div>

      {/* ─── Mobile navigation ────────────────────────────────────────────── */}
      <nav
        className="sm:hidden flex border-t border-white/10 bg-brand-800 pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegación principal"
      >
        {[
          { href: '/home', label: '🏠', text: 'Casa' },
          { href: '/supermarket', label: '🛒', text: 'Super' },
          { href: '/products', label: '📦', text: 'Productos' },
          { href: '/shopping-trips', label: '🧾', text: 'Compras' },
          { href: '/payments', label: '💳', text: 'Pagos' },
          { href: '/household', label: '🏡', text: 'Hogar' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] sm:text-xs text-white/75 hover:text-energy-300 hover:bg-white/5 transition"
          >
            <span className="text-base sm:text-lg leading-none">{item.label}</span>
            <span className="truncate max-w-full">{item.text}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
