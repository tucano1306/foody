'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  CreateShoppingTripDto,
  Product,
} from '@foody/types';
import { haptic } from '@/lib/haptic';
import { matchReceiptItem } from '@/lib/receipt-match';
import type { ReceiptParseResult } from '@/components/shopping/ReceiptScanner';

const ReceiptScanner = dynamic(
  () => import('@/components/shopping/ReceiptScanner'),
  { ssr: false },
);
import { useToast } from '@/components/ui/Toast';
import ScopePicker from '@/components/ui/ScopePicker';
import KindPicker from '@/components/ui/KindPicker';
import { detectExpenseKind, type ExpenseKind } from '@/lib/expense-kind';
import TripSplitsEditor from '@/components/shopping/TripSplitsEditor';
import { normalizeSplits, validateSplits, type TripSplitInput } from '@/lib/trip-splits';
import { notifyGoalImpact } from '@/lib/notify-goal-impact';

interface Props {
  readonly products: Product[];
}

interface LineItem {
  id: string;
  productId: string; // '' = item from receipt not yet linked to a catalog product
  name: string;
  unit: string;
  quantity: string;
  price: string; // optional manual unit price
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatCurrency(value: number, currency: string): string {
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

export default function NewTripForm({ products }: Readonly<Props>) {
  const router = useRouter();
  const toast = useToast();

  const [storeName, setStoreName] = useState<string>('');
  const [purchasedAt, setPurchasedAt] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [currency] = useState<string>('USD');
  const [items, setItems] = useState<LineItem[]>([]);
  /** El detalle del ticket empieza plegado: total y tienda son lo que importa. */
  const [itemsExpanded, setItemsExpanded] = useState(false);
  /** 0-100: qué parte de esta compra es del negocio. Empieza en personal. */
  const [businessShare, setBusinessShare] = useState(0);
  /**
   * Súper o gasto de otro tipo. Empieza en súper —el caso normal— y solo lo
   * mueve el detector si reconoce la tienda o el usuario si lo toca.
   */
  const [kind, setKind] = useState<ExpenseKind>('grocery');
  /** El tipo lo puso el detector y el usuario aún no lo ha corregido. */
  const [kindAutoDetected, setKindAutoDetected] = useState(false);
  /**
   * El usuario eligió el tipo a mano. A partir de ahí el detector se calla:
   * seguir "corrigiéndole" mientras termina de escribir el nombre de la tienda
   * sería pelearse con él.
   */
  const [kindTouched, setKindTouched] = useState(false);
  /**
   * Las partes del ticket que NO son del tipo principal.
   *
   * Un carrito con la despensa y las medicinas es un solo recibo y dos gastos
   * distintos; sin esto había que elegir uno y mentirle a la otra mitad.
   */
  const [splits, setSplits] = useState<TripSplitInput[]>([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Per-item link search: maps item id → search query string
  const [linkSearch, setLinkSearch] = useState<Record<string, string>>({});

  const addedIds = new Set(items.map((i) => i.productId));
  const searchQ = search.trim().toLowerCase();
  const candidates = useMemo(
    () =>
      products
        .filter((p) => !addedIds.has(p.id))
        .filter((p) => (searchQ ? p.name.toLowerCase().includes(searchQ) : true))
        .slice(0, 8),
    [products, searchQ, addedIds],
  );

  // ─── Predictive AI: smart suggestions ──────────────────────────────────────
  // Products that are empty or half — user is probably buying these today.
  const smartSuggestions = useMemo(
    () =>
      products
        .filter((p) => !addedIds.has(p.id))
        .filter((p) => p.stockLevel === 'empty' || p.stockLevel === 'half')
        .sort((a, b) => {
          // empty first, then by last purchase recency
          if (a.stockLevel !== b.stockLevel) {
            return a.stockLevel === 'empty' ? -1 : 1;
          }
          return (
            new Date(b.lastPurchaseDate ?? 0).getTime() -
            new Date(a.lastPurchaseDate ?? 0).getTime()
          );
        })
        .slice(0, 8),
    [products, addedIds],
  );

  /**
   * Sugiere el tipo de gasto a partir del nombre de la tienda.
   *
   * Solo sugiere: si el usuario ya eligió a mano, o si el nombre no dice nada,
   * no toca nada. Es lo que hace que un ticket de Pollo Tropical llegue ya
   * marcado como comida sin que nadie tenga que acordarse de marcarlo.
   */
  function suggestKind(name: string): ExpenseKind {
    if (kindTouched) return kind;
    const detected = detectExpenseKind(name);
    if (detected === null) return kind;
    setKind(detected);
    setKindAutoDetected(true);
    // Se devuelve además de guardarse porque quien llama lo necesita YA: el
    // `setState` no se ve hasta el siguiente render y en el mismo turno hay que
    // decidir si los productos del recibo se cargan o no.
    return detected;
  }

  function pickKind(next: ExpenseKind) {
    setKind(next);
    setKindTouched(true);
    setKindAutoDetected(false);
  }

  function handleReceiptResult(data: ReceiptParseResult) {
    setScannerOpen(false);
    // Pre-fill total
    if (data.total !== null && totalAmount === '') {
      setTotalAmount(data.total.toFixed(2));
    }
    // Pre-fill store name if user hasn't typed one yet
    if (data.storeName !== null && storeName.trim() === '') {
      setStoreName(data.storeName);
    }
    // Clasificar en el momento del escaneo: es justo cuando se sabe de dónde es
    // el ticket y justo cuando el usuario está mirando.
    const effectiveKind = suggestKind(data.storeName ?? storeName);
    // Pre-fill date
    if (data.receiptDate !== null) {
      setPurchasedAt(data.receiptDate);
    }

    // ── Turn scanned line items into trip items ───────────────────────────────
    // This is what makes a scan feed statistics & predictions: each item that
    // links to a catalog product becomes a product_purchase on save. Items we
    // can auto-match are pre-linked; the rest stay "unlinked" for the user to
    // confirm. Receipt unit prices are carried over so per-product price data is
    // accurate (not just an even split of the total).
    // Sin productos legibles NO es un fallo: con el total y la tienda el
    // ticket ya sirve para el presupuesto y el plan, que es lo que se pidió.
    //
    // Y si el ticket no es de super tampoco se cargan: las líneas de una cena
    // no son productos de despensa, y volcarlas al catálogo llenaría el
    // inventario de "Combo #2" que nadie va a reponer nunca.
    if (data.items.length === 0 || effectiveKind !== 'grocery') return;

    const used = new Set(items.map((it) => it.productId).filter((id) => id !== ''));
    const additions: LineItem[] = [];
    let matched = 0;
    let unmatched = 0;

    for (const ri of data.items) {
      const hit = matchReceiptItem(ri.name, products);
      const qty = ri.quantity > 0 ? String(ri.quantity) : '1';
      const price = ri.unitPrice != null ? ri.unitPrice.toFixed(2) : '';

      if (hit && !used.has(hit.product.id)) {
        used.add(hit.product.id);
        matched += 1;
        additions.push({
          id: crypto.randomUUID(),
          productId: hit.product.id,
          name: hit.product.name,
          unit: hit.product.unit,
          quantity: qty,
          price,
        });
      } else if (!hit) {
        // No catalog match — keep the receipt name so the user can link it.
        unmatched += 1;
        additions.push({
          id: crypto.randomUUID(),
          productId: '',
          name: ri.name,
          unit: 'units',
          quantity: qty,
          price,
        });
      }
      // hit but already added → skip the duplicate line entirely.
    }

    if (additions.length > 0) {
      setItems((prev) => [...prev, ...additions]);
      haptic([15, 40, 20]);
    }

    // El aviso dice lo que el usuario vino a saber —cuánto y dónde—, no cuántas
    // líneas se vincularon. Ese detalle está plegado para quien lo quiera.
    const donde = data.storeName ?? storeName.trim();
    const cuanto = data.total ?? Number.parseFloat(totalAmount);
    toast.show(
      Number.isFinite(cuanto) && cuanto > 0
        ? `Listo: $${cuanto.toFixed(2)}${donde ? ` en ${donde}` : ''}`
        : 'Recibo leído — revisa el total',
      Number.isFinite(cuanto) && cuanto > 0 ? 'success' : 'info',
    );
  }

  function addProduct(p: Product) {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: p.id,
        name: p.name,
        unit: p.unit,
        quantity: '1',
        // Predictive: prefill with last known unit price when available.
        price:
          p.lastPurchasePrice == null ? '' : p.lastPurchasePrice.toFixed(2),
      },
    ]);
    setSearch('');
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function linkItemToProduct(idx: number, p: Product) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? { ...it, productId: p.id, name: p.name, unit: p.unit }
          : it,
      ),
    );
    setLinkSearch((prev) => {
      const next = { ...prev };
      delete next[items[idx].id];
      return next;
    });
  }

  // Preview allocation
  const parsedTotal = Number.parseFloat(totalAmount);
  const totalValid = Number.isFinite(parsedTotal) && parsedTotal > 0;

  /**
   * Solo el super tiene productos que vincular.
   *
   * Una cena o un tanque de gasolina no llenan la despensa, así que todo el
   * bloque de productos —sugerencias, buscador, líneas del recibo— desaparece.
   * Registrar ese gasto se reduce a lo único que importa: cuánto y dónde.
   */
  const isGrocery = kind === 'grocery';

  // Items linked to a catalog product (productId !== '') are the only ones sent to the API
  const linkedItems = isGrocery ? items.filter((it) => it.productId !== '') : [];
  const unlinkedCount = isGrocery ? items.length - linkedItems.length : 0;

  const storeNameValid = storeName.trim().length > 0;
  // Repartir más de lo que costó el ticket deja el gasto del mes descuadrado:
  // se corta aquí, con el motivo a la vista, en vez de guardarlo y que aparezca
  // como un error del servidor.
  const splitError = validateSplits(totalValid ? parsedTotal : 0, splits);
  const canSubmit =
    storeNameValid &&
    totalValid &&
    splitError === null &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const dto: CreateShoppingTripDto = {
        storeName: storeName.trim(),
        purchasedAt: new Date(purchasedAt).toISOString(),
        totalAmount: totalValid ? parsedTotal : 0,
        currency,
        businessShare,
        kind,
        splits: normalizeSplits(splits),
        allocationStrategy: 'manual_partial',
        items: linkedItems.map((it) => {
          const qty = Number.parseFloat(it.quantity);
          const price = Number.parseFloat(it.price);
          const hasPrice =
            Number.isFinite(price) && price >= 0 && it.price.trim() !== '';
          return {
            productId: it.productId,
            quantity: qty,
            ...(hasPrice ? { unitPrice: price } : {}),
          };
        }),
      };
      const res = await fetch('/api/proxy/shopping-trips', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        let msg = `No se pudo guardar (error ${res.status})`;
        try {
          const data = (await res.json()) as { message?: string };
          if (data.message) msg = data.message;
        } catch {
          // cuerpo no-JSON — se queda el mensaje genérico
        }
        throw new Error(msg);
      }
      haptic([15, 40, 20]);
      // El aviso dice DÓNDE quedó el gasto: quien acaba de marcar "Comida"
      // esperaría verlo en Compras y no está, y descubrirlo por su cuenta es
      // exactamente la confusión que este cambio venía a quitar.
      const msg = !isGrocery
        ? 'Gasto guardado ✨ Lo ves en tu Plan financiero'
        : unlinkedCount > 0
          ? `Compra guardada ✨ (${unlinkedCount} del recibo sin vincular se omitieron)`
          : 'Compra guardada ✨';
      toast.show(msg, 'success');

      // Qué le hizo este gasto a las metas. Va después del aviso de éxito y
      // nunca puede tumbar el guardado: si falla, la compra ya está a salvo.
      void notifyGoalImpact(totalValid ? parsedTotal : 0, toast.show);

      // Un gasto que no es de super no aparece en Compras: mandar ahí al
      // usuario sería enseñarle una lista donde su ticket no está.
      router.push(isGrocery ? '/shopping-trips' : '/plan');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
      toast.show('No se pudo guardar', 'error');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      {scannerOpen && (
        <ReceiptScanner
          onResult={handleReceiptResult}
          onClose={() => setScannerOpen(false)}
        />
      )}

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🧾 Nueva compra</h1>
          <p className="text-sm text-slate-500">
            Captura tu ticket, pon precios donde recuerdes y Foody estima el resto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 px-3 py-2 text-xs font-semibold hover:bg-brand-100 transition"
            title="Escanear recibo con OCR"
          >
            <span aria-hidden="true">📄</span>
            <span className="hidden sm:inline">Escanear recibo</span>
            <span className="sm:hidden">Escanear</span>
          </button>
          <Link
            href="/shopping-trips"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Cancelar
          </Link>
        </div>
      </header>

      {/* Store + date */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 space-y-3">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1">
            Tienda <span className="text-blue-500">*</span>
          </span>
          <input
            type="text"
            placeholder="Ej. Walmart, Publix, Pollo Tropical…"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            // Al salir del campo, no en cada tecla: clasificar mientras se
            // escribe iría saltando de tipo a media palabra.
            onBlur={(e) => suggestKind(e.target.value)}
            className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-brand-500 ${
              storeNameValid ? 'border-slate-200 bg-white' : 'border-blue-300 bg-blue-50'
            }`}
          />
          {!storeNameValid && (
            <p className="text-xs text-blue-500 mt-1">Escribe el nombre de la tienda para continuar</p>
          )}
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1">Fecha</span>
          <input
            type="date"
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-brand-500 focus:outline-none"
          />
        </label>
      </section>

      {/* Total */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1">
            Total pagado
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">{currency}</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              step="0.01"
              min="0"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-lg font-semibold text-slate-800 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </label>
        <p className="text-xs text-slate-400 mt-1">
          {isGrocery
            ? 'El monto total del ticket. Foody reparte entre tus productos.'
            : 'El monto total del ticket.'}
        </p>
      </section>

      {/* ── Qué clase de gasto es ────────────────────────────────────────────
          Va justo debajo del total y antes de los productos: es la decisión que
          determina si esto es una compra de despensa o un gasto del plan, y
          cambia lo que se enseña a partir de aquí. */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 space-y-4">
        <KindPicker value={kind} onChange={pickKind} autoDetected={kindAutoDetected} />

        {/* Cualquier gasto puede ser del negocio: insumos del super, la comida
            de una reunión, la gasolina de los repartos. Vive aquí y no dentro
            del bloque de productos porque no depende de que los haya. Viene en
            «Personal», así que no estorba a quien no lo use. */}
        {/* Repartir el ticket va JUNTO al tipo, no dentro de los productos:
            es la misma decisión —a qué gasto pertenece esto— y solo tiene
            sentido cuando ya se sabe el total. */}
        {totalValid && (
          <TripSplitsEditor
            total={parsedTotal}
            mainKind={kind}
            splits={splits}
            onChange={setSplits}
          />
        )}

        <ScopePicker
          value={businessShare}
          onChange={setBusinessShare}
          amount={totalValid ? parsedTotal : undefined}
          currency={currency}
          label="¿De quién es este gasto?"
        />
      </section>

      {/* Items — solo para el super: una cena no tiene productos que vincular */}
      {isGrocery && (
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 space-y-3">
        {/* Smart suggestions — predictive */}
        {smartSuggestions.length > 0 && (
          <div className="rounded-xl bg-brand-50/50 border border-brand-100 p-3">
            <p className="text-[11px] font-semibold text-brand-700 mb-2 flex items-center gap-1">
              ✨ Sugerencias para ti{' '}
              <span className="text-slate-400 font-normal normal-case tracking-normal ml-1">
                (productos bajos o agotados)
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {smartSuggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-full bg-white border border-brand-200 text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition flex items-center gap-1"
                  title={
                    p.stockLevel === 'empty'
                      ? 'Se acabó — agrégalo'
                      : 'Queda poco — agrégalo'
                  }
                >
                  <span>{p.stockLevel === 'empty' ? '🚨' : '⚠️'}</span>
                  <span className="truncate max-w-36">{p.name}</span>
                  <span className="text-[11px] text-slate-400">+</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* El detalle del ticket va PLEGADO. Lo que importa al registrar una
            compra es cuánto y dónde; los productos se siguen guardando igual
            —alimentan «Comparar precios» y el desglose por categoría— pero ya
            no piden atención ni bloquean el guardado. Quien quiera vincularlos
            toca y los ve. */}
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => { haptic(); setItemsExpanded((v) => !v); }}
            aria-expanded={itemsExpanded}
            className="w-full flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 text-left transition active:scale-[0.99]"
          >
            <span className="text-lg shrink-0" aria-hidden="true">🧾</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">
                {items.length} {items.length === 1 ? 'producto del ticket' : 'productos del ticket'}
              </span>
              <span className="block text-[11px] text-slate-500">
                {unlinkedCount > 0
                  ? `${items.length - unlinkedCount} vinculados · ${unlinkedCount} sin vincular`
                  : 'Todos vinculados a tu catálogo'}
              </span>
            </span>
            <span className={`shrink-0 text-slate-400 transition-transform ${itemsExpanded ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
          </button>
        )}

        {items.length > 0 && itemsExpanded && (
          <ul className="space-y-2">
            {items.map((it, idx) => {
              const isUnlinked = it.productId === '';
              return (
                <li
                  key={it.id}
                  className={`rounded-xl border p-3 ${isUnlinked ? 'border-sky-200 bg-sky-50/50' : 'border-slate-100 bg-slate-50/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{it.name}</p>
                      {isUnlinked && (
                        <p className="text-[11px] text-sky-700 mt-0.5">
                          Del recibo — vincula a un producto de tu catálogo
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                    >
                      Quitar
                    </button>
                  </div>
                  {isUnlinked && (
                    <div className="mt-2 relative">
                      <input
                        type="text"
                        placeholder="Buscar en tu catálogo para vincular…"
                        value={linkSearch[it.id] ?? ''}
                        onChange={(e) =>
                          setLinkSearch((prev) => ({ ...prev, [it.id]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-sky-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                      />
                      {(linkSearch[it.id] ?? '').trim().length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-md max-h-40 overflow-auto">
                          {products
                            .filter(
                              (p) =>
                                !addedIds.has(p.id) &&
                                p.name.toLowerCase().includes((linkSearch[it.id] ?? '').trim().toLowerCase()),
                            )
                            .slice(0, 6)
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => linkItemToProduct(idx, p)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 flex items-center justify-between"
                              >
                                <span className="font-medium text-slate-700 truncate">{p.name}</span>
                                <span className="text-slate-400 ml-2 shrink-0">{p.unit}</span>
                              </button>
                            ))}
                          {products.filter(
                            (p) =>
                              !addedIds.has(p.id) &&
                              p.name.toLowerCase().includes((linkSearch[it.id] ?? '').trim().toLowerCase()),
                          ).length === 0 && (
                            <p className="px-3 py-2 text-xs text-slate-400">Sin coincidencias</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="block">
                      <span className="block text-[11px] text-slate-400 mb-0.5">
                        Cantidad ({it.unit})
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(idx, { quantity: e.target.value })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-slate-400 mb-0.5">
                        Precio unitario (opcional)
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="—"
                        value={it.price}
                        onChange={(e) => updateItem(idx, { price: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Search + add */}
        <div>
          <input
            type="text"
            placeholder="Buscar producto para agregar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-brand-500 focus:outline-none"
          />
          {search && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white max-h-56 overflow-auto">
              {candidates.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  Sin coincidencias. Crea primero el producto desde la pestaña Productos.
                </p>
              ) : (
                candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-700 truncate">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.unit}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </section>
      )}

      {unlinkedCount > 0 && (
        <p className="rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs px-3 py-2">
          {linkedItems.length === 0
            ? 'Ningún artículo del recibo está vinculado a tu catálogo: al guardar se registrará solo el total. Vincula los que quieras contar en tus estadísticas.'
            : `${unlinkedCount} artículo${unlinkedCount === 1 ? '' : 's'} del recibo sin vincular se omitirá${unlinkedCount === 1 ? '' : 'n'} al guardar.`}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-blue-50 text-blue-700 text-sm px-3 py-2">{error}</p>
      )}

      {/* Sticky submit */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white/95 backdrop-blur px-4 py-3">
        <div className="container mx-auto max-w-5xl flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-lg font-bold text-slate-800">
              {totalValid
                ? formatCurrency(parsedTotal, currency)
                : '—'}
            </p>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="rounded-xl bg-brand-600 text-white px-6 py-3 text-sm font-semibold shadow hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {submitting ? 'Guardando…' : 'Guardar compra'}
          </button>
        </div>
      </div>
    </div>
  );
}
