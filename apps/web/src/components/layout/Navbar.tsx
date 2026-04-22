import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';

interface Props {
  readonly user: { name: string | null; avatarUrl: string | null; email: string };
}

export default function Navbar({ user }: Props) {
  return (
    <header className="bg-white border-b border-stone-100 shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 max-w-5xl flex items-center justify-between h-16">
        {/* ─── Logo ─────────────────────────────────────────────────────────── */}
        <Link href="/home" className="flex items-center gap-2 font-bold text-xl text-brand-600">
          <span className="text-2xl">🥑</span>
          <span>Foody</span>
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
              className="px-3 py-1.5 rounded-lg text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-800 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* ─── User ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.name ?? user.email}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-semibold">
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <span className="hidden sm:block text-sm text-stone-600 max-w-30 truncate">
            {user.name ?? user.email}
          </span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs text-stone-400 hover:text-stone-600 transition"
            >
              Salir
            </button>
          </form>
        </div>
      </div>

      {/* ─── Mobile navigation ────────────────────────────────────────────── */}
      <nav className="sm:hidden flex border-t border-stone-100">
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
            className="flex-1 flex flex-col items-center py-2 text-xs text-stone-500 hover:text-brand-600 transition"
          >
            <span className="text-lg">{item.label}</span>
            <span>{item.text}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
