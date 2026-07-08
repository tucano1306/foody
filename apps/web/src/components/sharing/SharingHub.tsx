'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { playSound } from '@/lib/sound';
import { burstAt, burstFromElement, confettiRain } from '@/lib/fx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PantryShareRow {
  readonly id: string;
  readonly status: string;
  readonly message: string | null;
  readonly created_at: string;
  // sent fields
  readonly guest_name?: string | null;
  readonly guest_email?: string;
  readonly guest_avatar?: string | null;
  // received fields
  readonly owner_name?: string | null;
  readonly owner_email?: string;
  readonly owner_avatar?: string | null;
}

interface GiftRow {
  readonly id: string;
  readonly product_id: string;
  readonly status: string;
  readonly message: string | null;
  readonly created_at: string;
  readonly product_name?: string;
  readonly product_photo?: string | null;
  readonly product_category?: string | null;
  // sent fields
  readonly recipient_name?: string | null;
  readonly recipient_email?: string;
  // received fields
  readonly sender_name?: string | null;
  readonly sender_email?: string;
}

interface Props {
  readonly initialPantrySent: PantryShareRow[];
  readonly initialPantryReceived: PantryShareRow[];
  readonly initialGiftsSent: GiftRow[];
  readonly initialGiftsReceived: GiftRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Avatar({ src, name }: { readonly src?: string | null; readonly name?: string | null }) {
  const initial = (name ?? '?').charAt(0).toUpperCase();
  if (src) {
    return <Image src={src} alt={name ?? ''} width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
      {initial}
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Aceptado',  cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rechazado', cls: 'bg-rose-100 text-rose-700' },
  revoked:  { label: 'Revocado',  cls: 'bg-stone-100 text-stone-600' },
  declined: { label: 'Rechazado', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Cancelado', cls: 'bg-stone-100 text-stone-600' },
};

function StatusBadge({ status }: { readonly status: string }) {
  const cfg = STATUS_LABEL[status] ?? { label: status, cls: 'bg-stone-100 text-stone-600' };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Pantry invite form ───────────────────────────────────────────────────────

function PantryInviteForm({ onSuccess }: { readonly onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    setError(null);
    // currentTarget is only valid during dispatch — capture before the await
    const formEl = e.currentTarget as Element;
    start(async () => {
      const res = await fetch('/api/sharing/pantry', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), message: message.trim() || undefined }),
      });
      if (res.ok) {
        playSound('pop');
        burstFromElement(formEl, ['💌', '✨']);
        setEmail(''); setMessage('');
        onSuccess();
      } else {
        const json = await res.json() as { message?: string };
        setError(json.message ?? 'Error al enviar');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-brand-50 border border-brand-100 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-semibold text-brand-800">Invitar a ver mi despensa</p>
      <div className="space-y-2">
        <label htmlFor="pantry-email" className="block text-xs text-stone-600 font-medium">Email del usuario</label>
        <input
          id="pantry-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="amigo@email.com"
          className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="pantry-msg" className="block text-xs text-stone-600 font-medium">Mensaje (opcional)</label>
        <textarea
          id="pantry-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Ej: ¡Hola! Te comparto mi despensa."
          className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
        />
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      <button
        type="submit"
        disabled={isPending || !email}
        className="w-full py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold transition"
      >
        {isPending ? 'Enviando…' : 'Enviar invitación'}
      </button>
    </form>
  );
}

// ─── Pantry share card ────────────────────────────────────────────────────────

function PantryCard({
  share,
  direction,
  onAction,
}: {
  readonly share: PantryShareRow;
  readonly direction: 'sent' | 'received';
  readonly onAction: () => void;
}) {
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const name = direction === 'sent' ? (share.guest_name ?? share.guest_email) : (share.owner_name ?? share.owner_email);
  const avatar = direction === 'sent' ? share.guest_avatar : share.owner_avatar;

  function doAction(action: 'accept' | 'reject' | 'revoke') {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/sharing/pantry/${share.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        if (action === 'accept') {
          playSound('pop');
          burstAt(window.innerWidth / 2, window.innerHeight / 3, ['🤝', '🏠', '✨']);
        }
        onAction();
      }
      else {
        const json = await res.json() as { message?: string };
        setError(json.message ?? 'Error');
      }
    });
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar src={avatar} name={String(name)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-stone-800 truncate">{name}</p>
            <StatusBadge status={share.status} />
          </div>
          <p className="text-xs text-stone-400 mt-0.5">{formatDate(share.created_at)}</p>
          {share.message && (
            <p className="mt-1 text-xs text-stone-600 italic bg-stone-50 rounded-lg px-3 py-2 border border-stone-100">
              "{share.message}"
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {/* Received pending → accept / reject */}
      {direction === 'received' && share.status === 'pending' && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => doAction('accept')}
            className="flex-1 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition"
          >
            ✅ Aceptar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => doAction('reject')}
            className="flex-1 py-2 text-sm font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-50 transition"
          >
            Rechazar
          </button>
        </div>
      )}

      {/* Received accepted → view pantry link */}
      {direction === 'received' && share.status === 'accepted' && (
        <Link
          href={`/sharing/pantry/${share.id}`}
          className="block text-center py-2 text-sm font-semibold rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 transition"
        >
          👀 Ver despensa
        </Link>
      )}

      {/* Sent pending/accepted → revoke */}
      {direction === 'sent' && (share.status === 'pending' || share.status === 'accepted') && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => doAction('revoke')}
          className="py-2 text-sm font-semibold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:opacity-50 transition"
        >
          Revocar acceso
        </button>
      )}
    </div>
  );
}

// ─── Gift card ────────────────────────────────────────────────────────────────

function GiftCard({
  gift,
  direction,
  onAction,
}: {
  readonly gift: GiftRow;
  readonly direction: 'sent' | 'received';
  readonly onAction: () => void;
}) {
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const person = direction === 'sent'
    ? (gift.recipient_name ?? gift.recipient_email)
    : (gift.sender_name ?? gift.sender_email);

  function doAction(action: 'accept' | 'decline' | 'cancel') {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/sharing/gifts/${gift.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        if (action === 'accept') {
          // Unwrapping a gift is a big win — full celebration
          playSound('levelup');
          confettiRain(['🎁', '🎉', '💝']);
        }
        onAction();
      }
      else {
        const json = await res.json() as { message?: string };
        setError(json.message ?? 'Error');
      }
    });
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start gap-3">
        {gift.product_photo ? (
          <Image
            src={gift.product_photo}
            alt={gift.product_name ?? ''}
            width={52}
            height={52}
            className="w-13 h-13 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-13 h-13 rounded-xl bg-stone-100 flex items-center justify-center text-2xl shrink-0">🥑</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-stone-800 truncate">{gift.product_name}</p>
            <StatusBadge status={direction === 'sent' && gift.status === 'declined' ? 'cancelled' : gift.status} />
          </div>
          {gift.product_category && (
            <p className="text-[10px] uppercase tracking-wide text-stone-400">{gift.product_category}</p>
          )}
          <p className="text-xs text-stone-500 mt-0.5">
            {direction === 'sent' ? `Para: ${person}` : `De: ${person}`}
          </p>
          <p className="text-xs text-stone-400">{formatDate(gift.created_at)}</p>
          {gift.message && (
            <p className="mt-1 text-xs text-stone-600 italic bg-stone-50 rounded-lg px-3 py-2 border border-stone-100">
              "{gift.message}"
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {/* Received pending → accept / decline */}
      {direction === 'received' && gift.status === 'pending' && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => doAction('accept')}
            className="flex-1 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition"
          >
            ✅ Aceptar producto
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => doAction('decline')}
            className="flex-1 py-2 text-sm font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-50 transition"
          >
            Rechazar
          </button>
        </div>
      )}

      {/* Sent pending → cancel */}
      {direction === 'sent' && gift.status === 'pending' && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => doAction('cancel')}
          className="py-2 text-sm font-semibold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:opacity-50 transition"
        >
          Cancelar envío
        </button>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon, text }: { readonly icon: string; readonly text: string }) {
  return (
    <div className="text-center py-10 text-stone-400">
      <div className="text-4xl mb-2"><span className="inline-block animate-bounce">{icon}</span></div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Tab = 'pantry' | 'gifts';
type SubTab = 'received' | 'sent';

export default function SharingHub({ initialPantrySent, initialPantryReceived, initialGiftsSent, initialGiftsReceived }: Props) {
  const [tab, setTab] = useState<Tab>('pantry');
  const [subTab, setSubTab] = useState<SubTab>('received');

  const [pantrySent, setPantrySent] = useState<PantryShareRow[]>(initialPantrySent);
  const [pantryReceived, setPantryReceived] = useState<PantryShareRow[]>(initialPantryReceived);
  const [giftsSent, setGiftsSent] = useState<GiftRow[]>(initialGiftsSent);
  const [giftsReceived, setGiftsReceived] = useState<GiftRow[]>(initialGiftsReceived);

  const pendingPantry = pantryReceived.filter((r) => r.status === 'pending').length;
  const pendingGifts = giftsReceived.filter((g) => g.status === 'pending').length;

  async function refresh() {
    try {
      const [pantryRes, giftsRes] = await Promise.all([
        fetch('/api/sharing/pantry', { credentials: 'include' }),
        fetch('/api/sharing/gifts', { credentials: 'include' }),
      ]);
      if (pantryRes.ok) {
        const data = await pantryRes.json() as { sent: PantryShareRow[]; received: PantryShareRow[] };
        setPantrySent(data.sent);
        setPantryReceived(data.received);
      }
      if (giftsRes.ok) {
        const data = await giftsRes.json() as { sent: GiftRow[]; received: GiftRow[] };
        setGiftsSent(data.sent);
        setGiftsReceived(data.received);
      }
    } catch { /* silent */ }
  }

  return (
    <div className="space-y-5">
      {/* ─ Main tabs ─ */}
      <div className="flex gap-2 bg-stone-100 p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => setTab('pantry')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition ${tab === 'pantry' ? 'bg-white shadow text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
        >
          🏠 Despensa
          {pendingPantry > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full animate-pulse">{pendingPantry}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('gifts')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition ${tab === 'gifts' ? 'bg-white shadow text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
        >
          🎁 Productos
          {pendingGifts > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full animate-pulse">{pendingGifts}</span>
          )}
        </button>
      </div>

      {/* ─ Pantry tab ─ */}
      {tab === 'pantry' && (
        <div className="space-y-4">
          <PantryInviteForm onSuccess={refresh} />

          <div className="flex gap-2 border-b border-stone-200">
            {(['received', 'sent'] as SubTab[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubTab(s)}
                className={`pb-2 px-1 text-sm font-medium transition border-b-2 ${subTab === s ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
              >
                {s === 'received' ? 'Recibidas' : 'Enviadas'}
                {s === 'received' && pendingPantry > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full animate-pulse">{pendingPantry}</span>
                )}
              </button>
            ))}
          </div>

          {subTab === 'received' && (
            <div className="space-y-3 card-stagger">
              {pantryReceived.length === 0
                ? <EmptyState icon="📭" text="Nadie te ha compartido su despensa todavía" />
                : pantryReceived.map((share) => (
                  <PantryCard key={share.id} share={share} direction="received" onAction={refresh} />
                ))}
            </div>
          )}

          {subTab === 'sent' && (
            <div className="space-y-3 card-stagger">
              {pantrySent.length === 0
                ? <EmptyState icon="📤" text="Aún no has compartido tu despensa con nadie" />
                : pantrySent.map((share) => (
                  <PantryCard key={share.id} share={share} direction="sent" onAction={refresh} />
                ))}
            </div>
          )}
        </div>
      )}

      {/* ─ Gifts tab ─ */}
      {tab === 'gifts' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            <p className="font-semibold mb-0.5">¿Cómo funciona?</p>
            <p className="text-xs leading-relaxed">
              Abre el producto que quieres compartir → toca <strong>"Enviar a alguien"</strong> → escribe el email del destinatario.
              Cuando lo acepte, el producto se añade automáticamente a su despensa.
            </p>
          </div>

          <div className="flex gap-2 border-b border-stone-200">
            {(['received', 'sent'] as SubTab[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubTab(s)}
                className={`pb-2 px-1 text-sm font-medium transition border-b-2 ${subTab === s ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
              >
                {s === 'received' ? 'Recibidos' : 'Enviados'}
                {s === 'received' && pendingGifts > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full animate-pulse">{pendingGifts}</span>
                )}
              </button>
            ))}
          </div>

          {subTab === 'received' && (
            <div className="space-y-3 card-stagger">
              {giftsReceived.length === 0
                ? <EmptyState icon="🎁" text="No has recibido ningún producto todavía" />
                : giftsReceived.map((gift) => (
                  <GiftCard key={gift.id} gift={gift} direction="received" onAction={refresh} />
                ))}
            </div>
          )}

          {subTab === 'sent' && (
            <div className="space-y-3 card-stagger">
              {giftsSent.length === 0
                ? <EmptyState icon="📦" text="Aún no has enviado ningún producto" />
                : giftsSent.map((gift) => (
                  <GiftCard key={gift.id} gift={gift} direction="sent" onAction={refresh} />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
