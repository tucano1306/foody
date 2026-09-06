'use client';

import { useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Product, StockLevel } from '@foody/types';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { cameBackTo, ranOutFrom } from '@/lib/fx';
import { useSwipe } from '@/lib/useSwipe';
import ActionSheet from '@/components/ui/ActionSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// Loaded only when user taps a product photo or the gift button
const PhotoLightbox = dynamic(() => import('@/components/ui/PhotoLightbox'), { ssr: false });
const SendGiftModal = dynamic(() => import('@/components/sharing/SendGiftModal'));

interface LastPurchase {
  readonly purchasedAt: string;
  readonly storeName: string | null;
}

function ProductPhoto({ src, alt }: { readonly src: string; readonly alt: string }) {
  if (src.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover transition-transform duration-500 group-hover:scale-105"
      sizes="(max-width: 640px) 50vw, 25vw"
    />
  );
}

interface Props {
  readonly product: Product;
  readonly showActions?: boolean;
  readonly compact?: boolean; // tap navigates to product page, hides stock buttons
  readonly onLevelChange?: (id: string, newLevel: StockLevel) => void;
  readonly onDelete?: (id: string) => void;
  readonly lastPurchase?: LastPurchase;
  /** The id of the signed-in user. When set and the product belongs to another
   * household member (shared pantry), the card shows the "Compartido" badge and
   * hides the destructive delete action — everything else (stock, edición,
   * regalo) stays available to any member of the house. Omitted on screens
   * where every product is the viewer's own (default = owned). */
  readonly currentUserId?: string;
}

/**
 * Etiquetas de estado.
 *
 * La app va en una sola gama azul a propósito, así que el nivel no puede
 * distinguirse por matiz: lo hace por INTENSIDAD. «Se acabó» es el azul más
 * saturado y con más peso, «a la mitad» un azul medio y «tengo» un punto tenue
 * que casi desaparece — porque tener algo no es una noticia. Ese orden hace
 * que, de un vistazo a una rejilla de treinta productos, salten justo los que
 * faltan.
 */
const LEVEL_CONFIG: Record<
  StockLevel,
  { label: string; short: string; emoji: string; dot: string; chip: string }
> = {
  full: {
    label: 'Tengo',
    short: 'OK',
    emoji: '✅',
    dot: 'bg-brand-300',
    chip: 'bg-[var(--surface)]/90 text-[var(--ink-muted)]',
  },
  half: {
    label: 'A la mitad',
    short: 'Bajo',
    emoji: '⚠️',
    dot: 'bg-brand-500',
    chip: 'bg-[var(--surface)]/92 text-[var(--ink)]',
  },
  empty: {
    label: 'Se acabó',
    short: 'Vacío',
    emoji: '🚨',
    dot: 'bg-white',
    chip: 'bg-brand-600 text-white',
  },
};

function getBorderCls(level: StockLevel): string {
  // Solo lo que FALTA se dibuja distinto. Antes los tres niveles tenían borde
  // propio y una rejilla entera parecía un semáforo; el que ya está en casa no
  // necesita llamar la atención.
  if (level === 'empty') return 'border-brand-400 ring-2 ring-brand-100 dark:ring-brand-900/50';
  return 'border-[var(--line)]';
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (hours < 1) return 'hace menos de 1 h';
  if (hours < 24) return `hace ${hours} h`;
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} sem.`;
  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

function latestPurchaseDate(a?: string | null, b?: string | null): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

export default function ProductCard({ product, showActions = false, compact = false, onLevelChange, onDelete, lastPurchase, currentUserId }: Props) {
  const router = useRouter();
  // Shared pantry: a product another member shared with me is fully usable —
  // I can change its stock, editarlo y regalarlo. Only deleting it stays with
  // its owner, so nobody wipes a product from someone else's despensa.
  const owned = !currentUserId || product.userId === currentUserId;
  const canManage = showActions;
  const canDelete = owned && showActions;
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(product);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxOrigin, setLightboxOrigin] = useState<DOMRect | undefined>();
  const [giftOpen, setGiftOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shaking, setShaking] = useState(false);
  const photoRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  function openLightbox() {
    if (!current.photoUrl) return;
    setLightboxOrigin(photoRef.current?.getBoundingClientRect());
    setLightboxOpen(true);
  }

  const level: StockLevel = current.stockLevel ?? (current.isRunningLow ? 'half' : 'full');
  const cfg = LEVEL_CONFIG[level];
  const [popKey, setPopKey] = useState(0);

  function setLevel(next: StockLevel) {
    if (next === level || isPending) return;

    haptic(next === 'empty' ? [15, 40, 20] : 10);

    if (next === 'empty') {
      playSound('empty');
      setShaking(true);
      ranOutFrom(rootRef.current);
    } else if (next === 'full') {
      // Volver a «sí tengo» casi siempre es una CORRECCIÓN —se marcó que
      // faltaba y no faltaba—, así que el efecto es el espejo del de arriba: el
      // carrito baja y las chispas se recogen hacia dentro, no estallan hacia
      // fuera. Antes era el mismo estallido genérico de celebrar cualquier
      // cosa, y deshacer un error no se siente como un logro.
      playSound('pop');
      cameBackTo(rootRef.current);
    } else {
      playSound('low');
    }

    // Optimistic update — notify parent immediately so the section list updates at once
    const previous = current;
    const productId = current.id;
    setCurrent({ ...current, stockLevel: next });
    setPopKey((k) => k + 1);
    onLevelChange?.(productId, next);

    startTransition(async () => {
      const res = await fetch(
        `/api/proxy/products/${productId}/stock-level`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level: next }),
        },
      );

      if (res.ok) {
        // Optimistic value already correct — just refresh server data
        router.refresh();
      } else {
        setCurrent(previous);
        onLevelChange?.(productId, previous.stockLevel ?? 'full');
      }
    });
  }

  const swipe = useSwipe(
    compact ? {} : { onSwipeLeft: () => setLevel('empty'), onSwipeRight: () => setLevel('full') },
  );

  async function performDelete() {
    setDeleting(true);
    onDelete?.(current.id);
    await fetch(`/api/proxy/products/${current.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setConfirmDelete(false);
    setDeleting(false);
    router.refresh();
  }

  // La tarjeta se levanta 2 px y ya. Antes subía, crecía un 2 % y pasaba de
  // shadow-md a shadow-2xl a la vez: tres cosas para decir «me puedes tocar».
  const sharedCls = `group relative flex flex-col overflow-hidden bg-[var(--surface)] rounded-[var(--radius-card)] border shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-300 ease-out hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 touch-pan-y select-none ${getBorderCls(level)}${shaking ? ' animate-shake' : ''}`;

  // Clears the shake once its keyframes finish (other child animations bubble here too)
  function handleAnimationEnd(e: React.AnimationEvent) {
    if (e.animationName === 'foody-shake') setShaking(false);
  }

  const purchasedAt = latestPurchaseDate(lastPurchase?.purchasedAt, current.lastPurchaseDate);

  const photoSection = (
    <div className="aspect-square bg-[var(--surface-2)] relative overflow-hidden">
      {current.photoUrl ? (
        <ProductPhoto src={current.photoUrl} alt={current.name} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🥑</div>
      )}
      {/* Estado: punto + palabra sobre cristal. Una sola pieza, arriba a la
          derecha, siempre en el mismo sitio de todas las tarjetas. */}
      <span
        className={`absolute top-2 right-2 flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold backdrop-blur-md shadow-[var(--shadow-xs)] ${cfg.chip}`}
      >
        <span key={popKey} className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pop`} />
        {cfg.short}
      </span>
      {!owned && (
        <span className="absolute top-2 left-2 rounded-full bg-[var(--ink)]/80 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-md">
          Compartido
        </span>
      )}
    </div>
  );

  const infoSection = (
    <div className="p-2.5 flex flex-col gap-0.5">
      <p className="font-semibold text-[13px] leading-tight text-[var(--ink)] line-clamp-2">
        {current.name}
      </p>
      {current.lastPurchasePrice != null && (
        <p className="t-num text-[15px] text-[var(--ink)] leading-none mt-0.5">
          {formatMoney(current.lastPurchasePrice, current.currency ?? 'USD')}
        </p>
      )}
      {/*
        En la rejilla densa (3 columnas de ~110 px en un móvil) los metadatos se
        esconden. Antes se pintaban igual: categoría en mayúsculas, «Total
        gastado» con su etiqueta, «Última compra» con hora y tienda en dos
        líneas más… ocho elementos de texto en una tarjeta más estrecha que una
        tarjeta de crédito. Ilegible y, sobre todo, ruidoso. Siguen estando a un
        toque, en la ficha del producto.
      */}
      {!compact && (purchasedAt || current.totalSpent > 0) && (
        <p className="t-meta truncate mt-1">
          {purchasedAt && formatRelativeTime(purchasedAt)}
          {purchasedAt && lastPurchase?.storeName && ` · ${lastPurchase.storeName}`}
          {!purchasedAt && current.totalSpent > 0 &&
            `Total ${formatMoney(current.totalSpent, current.currency ?? 'USD')}`}
        </p>
      )}
    </div>
  );

  const stockActions = [
    { label: 'Tengo', emoji: '✅', current: level === 'full', onClick: () => setLevel('full') },
    { label: 'A la mitad', emoji: '⚠️', current: level === 'half', onClick: () => setLevel('half') },
    { label: 'Se acabó', emoji: '🚨', current: level === 'empty', onClick: () => setLevel('empty') },
  ];

  return (
    <>
      <div
        {...(compact ? {} : swipe)}
        ref={rootRef}
        onAnimationEnd={handleAnimationEnd}
        className={sharedCls}
      >
        {/* La foto abre el visor; el resto de la tarjeta abre las acciones.
            Dos zonas grandes y sin ambigüedad, en vez de un menú escondido. */}
        {current.photoUrl ? (
          <button
            ref={photoRef}
            type="button"
            aria-label={`Ver foto de ${current.name}`}
            onClick={(e) => { e.stopPropagation(); openLightbox(); }}
            className="block w-full text-left focus:outline-none touch-auto-size"
          >
            {photoSection}
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Opciones de ${current.name}`}
            onClick={() => setSheetOpen(true)}
            className="block w-full text-left focus:outline-none touch-auto-size"
          >
            {photoSection}
          </button>
        )}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Opciones de ${current.name}`}
          className="w-full flex-1 text-left focus:outline-none touch-auto-size"
        >
          {infoSection}
        </button>
      </div>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={current.name}
        actions={[
          ...stockActions,
          ...(canManage ? [
            { label: 'Editar producto', emoji: '✏️', onClick: () => router.push(`/products/${current.id}`) },
            { label: 'Enviar a un amigo', emoji: '🎁', onClick: () => setGiftOpen(true) },
          ] : []),
          ...(canDelete ? [
            { label: 'Eliminar producto', emoji: '🗑️', destructive: true, onClick: () => setConfirmDelete(true) },
          ] : []),
        ]}
      />

      {lightboxOpen && current.photoUrl && (
        <PhotoLightbox
          src={current.photoUrl}
          alt={current.name}
          originRect={lightboxOrigin}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      {giftOpen && (
        <SendGiftModal
          productId={current.id}
          productName={current.name}
          onClose={() => setGiftOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`¿Eliminar "${current.name}"?`}
        message="Se quitará de tu despensa. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        busy={deleting}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
