'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/solid';
import type { CardStatementInfo, DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, type PortfolioDebt } from '@/lib/debt-engine';
import { caminoDeDeudas } from '@/lib/camino-deudas';
import { cardTitle } from '@/lib/card-payment';
import { claveDeCuenta, condicionesDeLaCuenta, PLANTILLAS, type CondicionesDeCredito } from '@/lib/condiciones-credito';
import { estadoDelMinimo } from '@/lib/cuadre-tarjeta';
import { toDateKey } from '@/lib/debt-engine';
import { resumenEnMetas } from '@/lib/deuda-a-meta';
import { findDuplicateObligations, type ObligationPayment } from '@/lib/duplicate-obligations';
import type { DeudaEnPapelera } from '@/lib/papelera-deudas';
import { haptic } from '@/lib/haptic';
import { matchesFilter, splitAmount, summarizeByScope, type ScopeFilter } from '@/lib/expense-scope';
import ScopeTabs from '@/components/ui/ScopeTabs';
import ActionSheet from '@/components/ui/ActionSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import DebtCard from './DebtCard';
import CardDetailSheet from './CardDetailSheet';
import CardGroupCard from './CardGroupCard';
import CardPaymentModal from './CardPaymentModal';
import CardStatementModal from './CardStatementModal';
import CreditTermsSheet from './CreditTermsSheet';
import DuplicateBanner from './DuplicateBanner';
import DebtDetailSheet from './DebtDetailSheet';
import DebtEditModal from './DebtEditModal';
import DebtPaymentModal from './DebtPaymentModal';
import DebtWizardModal from './DebtWizardModal';
import CaminoLibre from './CaminoLibre';
import PasarAMetasSheet from './PasarAMetasSheet';
import PapeleraDeDeudas from './PapeleraDeDeudas';
import { fmtDateFull, fmtMoney, fmtMoneyShort, KIND_META } from './debt-ui';

interface Props {
  readonly initial: DebtsSnapshot;
  /**
   * Los recibos de Pagos, solo para detectar la cuota anotada dos veces.
   *
   * Llegan desde la página para no pedirlos desde el cliente: es una lista
   * corta que el servidor ya tiene a mano.
   */
  readonly payments?: readonly ObligationPayment[];
  /** Ámbito con el que abrir, si quien enlaza aquí ya sabe cuál quiere. */
  readonly initialScope?: ScopeFilter;
}

/** De qué es el menú «⋯» abierto: una tarjeta con tramos o una deuda suelta. */
type Menu = { tipo: 'tarjeta'; group: string } | { tipo: 'deuda'; id: string };

/** Lo que se va a borrar, con lo que la confirmación necesita decir. */
type Borrado =
  | { tipo: 'tarjeta'; group: string; titulo: string; tramos: number; metas: number }
  | { tipo: 'deuda'; id: string; titulo: string; metas: number };

/** Una acción del menú, tal como la pinta ActionSheet. */
interface Accion {
  label: string;
  emoji: string;
  hint?: string;
  destructive?: boolean;
  onClick: () => void;
}

/**
 * Sección de Deudas y Créditos.
 *
 * La cartera va arriba porque la primera pregunta siempre es la misma —*¿cuánto
 * debo y cuánto me está costando?*— y la respuesta no debería requerir sumar
 * tarjetas mentalmente. Debajo, una tarjeta por deuda ordenada de mayor a menor
 * saldo, y el alta al final, sin tapar nada.
 */
export default function DebtsView({ initial, payments = [], initialScope = 'all' }: Props) {
  const [debts, setDebts] = useState<DebtWithProjection[]>(initial.debts);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [payCard, setPayCard] = useState<string | null>(null);
  // La tarjeta de tramos que se tiene abierta (su `card_group`).
  const [tarjetaAbierta, setTarjetaAbierta] = useState<string | null>(null);
  const [cuadrarCard, setCuadrarCard] = useState<string | null>(null);
  // El último estado de cuenta de cada tarjeta. Tras un abono se suma lo
  // abonado al momento, sin volver a pedirlo: la tarjeta dice «✓ Cubierto» ya.
  const [estados, setEstados] = useState<Record<string, CardStatementInfo>>(initial.cardStatements ?? {});
  // Las condiciones del banco de cada cuenta (tarjeta o deuda suelta), y la
  // cuenta cuyas condiciones se están editando.
  const [terminos, setTerminos] = useState<Record<string, CondicionesDeCredito>>(initial.creditTerms ?? {});
  const [terminosDe, setTerminosDe] = useState<string | null>(null);
  // El menú «⋯» abierto, la hoja de «Pasar a Metas» y el borrado por confirmar.
  const [menu, setMenu] = useState<Menu | null>(null);
  const [metasDe, setMetasDe] = useState<{ ids: string[]; titulo: string } | null>(null);
  const [borrado, setBorrado] = useState<Borrado | null>(null);
  const [borrando, setBorrando] = useState(false);
  /**
   * Las deudas que ya persigue alguna meta del Plan. Al pasar una a Metas se
   * apunta aquí al momento, y el menú cambia «Pasar a Metas» por «Ver en
   * Metas» sin recargar.
   */
  const [enMetas, setEnMetas] = useState<ReadonlySet<string>>(() => new Set(initial.enMetas ?? []));
  /**
   * Lo borrado, que ya no se pierde. Se apunta aquí al momento de borrar, sin
   * esperar a recargar, para que la papelera diga ya lo que acaba de entrar.
   */
  const [papelera, setPapelera] = useState<DeudaEnPapelera[]>(initial.papelera ?? []);
  const [recuperando, setRecuperando] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  /**
   * Qué lado se está mirando.
   *
   * Arranca en «todo» porque esta pantalla es el inventario completo de lo que
   * se debe. El que llega filtrando es el Plan financiero: sus consejos abren
   * aquí con `?scope=personal` para que el consejo y su destino hablen del
   * mismo dinero.
   */
  const [scope, setScope] = useState<ScopeFilter>(initialScope);

  /** Los totales de las tres pestañas, calculados sobre TODAS las deudas. */
  const scopeSummary = useMemo(
    () =>
      summarizeByScope(
        debts.map((d) => ({
          id: d.id,
          name: d.name,
          amount: d.currentBalance,
          businessShare: d.businessShare,
        })),
      ),
    [debts],
  );

  /**
   * Las deudas del lado que se está mirando.
   *
   * Una deuda mixta sale en las DOS vistas —es real en las dos— pero con su
   * parte correspondiente: en «personal», un coche al 60 % del negocio enseña
   * el 40 % de su saldo, de su cuota y de su interés. Enseñar la cifra entera
   * en una vista que dice «personal» es exactamente lo que hacía que el plan no
   * cuadrara con esta pantalla.
   */
  const visibles = useMemo(() => {
    if (scope === 'all') return debts;
    const lado = scope === 'business' ? 'business' : 'personal';
    return debts
      .filter((d) => matchesFilter(d.businessShare, scope))
      .map((d) => ({
        ...d,
        currentBalance: splitAmount(d.currentBalance, d.businessShare)[lado],
        projection: {
          ...d.projection,
          installment: splitAmount(d.projection.installment, d.businessShare)[lado],
          monthlyInterest: splitAmount(d.projection.monthlyInterest, d.businessShare)[lado],
        },
      }));
  }, [debts, scope]);

  // La cartera se recalcula en el cliente para que los totales se muevan en el
  // mismo instante en que se registra un abono, sin recargar la página.
  const portfolio = useMemo(() => {
    const input: PortfolioDebt[] = visibles
      .filter((d) => d.currentBalance > 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        balance: d.currentBalance,
        monthlyRate: d.projection.monthlyRate,
        installment: d.projection.installment,
        monthlyInterest: d.projection.monthlyInterest,
        monthsToPayoff: d.projection.monthsToPayoff,
        neverPaysOff: d.projection.neverPaysOff,
        status: d.projection.status,
      }));
    return buildPortfolio(input);
  }, [visibles]);

  /**
   * El camino a quedar libre: capital pagado y cuándo cae cada deuda.
   *
   * El capital pagado y la referencia se reparten por ámbito igual que el
   * saldo: en «personal», el coche al 60 % del negocio aporta el 40 % de lo
   * pagado Y de lo que se debía, o el porcentaje de avance saldría inflado.
   */
  const camino = useMemo(() => {
    const lado = scope === 'business' ? 'business' : 'personal';
    const parte = (x: number, share: number) => (scope === 'all' ? x : splitAmount(x, share)[lado]);
    const titulos = new Map<string, string>();
    for (const d of debts) {
      if (d.cardGroup && !titulos.has(d.cardGroup)) {
        titulos.set(d.cardGroup, cardTitle(debts.filter((x) => x.cardGroup === d.cardGroup)));
      }
    }
    return caminoDeDeudas(
      visibles.map((d) => {
        // La misma referencia que el anillo de cada tarjeta (decorate, en
        // debt-data.ts): lo que se debía al darla de alta más los consumos.
        const referencia = d.originalAmount > 0
          ? d.originalAmount
          : d.breakdown.totalPrincipalPaid + d.breakdown.principalOwed;
        return {
          id: d.id,
          nombre: d.name,
          grupo: d.cardGroup,
          nombreGrupo: d.cardGroup ? titulos.get(d.cardGroup) ?? null : null,
          saldo: d.currentBalance,
          capitalPagado: parte(d.breakdown.totalPrincipalPaid, d.businessShare),
          referencia: parte(referencia, d.businessShare),
          meses: d.projection.monthsToPayoff,
          nuncaTermina: d.projection.neverPaysOff,
        };
      }),
      new Date(),
    );
  }, [visibles, scope, debts]);

  /**
   * Qué se pinta y en qué orden: una deuda suelta es una tarjeta; los tramos
   * de una misma tarjeta de crédito van juntos, en el sitio del más grande.
   */
  const bloques = useMemo(() => {
    const porTarjeta = new Map<string, DebtWithProjection[]>();
    for (const d of visibles) {
      if (!d.cardGroup) continue;
      porTarjeta.set(d.cardGroup, [...(porTarjeta.get(d.cardGroup) ?? []), d]);
    }
    const pintadas = new Set<string>();
    const out: ({ tipo: 'deuda'; debt: DebtWithProjection } | { tipo: 'tarjeta'; group: string; tramos: DebtWithProjection[] })[] = [];
    for (const d of visibles) {
      const tramos = d.cardGroup ? porTarjeta.get(d.cardGroup) ?? [] : [];
      if (d.cardGroup && tramos.length > 1) {
        if (pintadas.has(d.cardGroup)) continue;
        pintadas.add(d.cardGroup);
        out.push({ tipo: 'tarjeta', group: d.cardGroup, tramos });
      } else {
        out.push({ tipo: 'deuda', debt: d });
      }
    }
    return out;
  }, [visibles]);

  const replaceAll = useCallback((snapshot: DebtsSnapshot) => {
    setDebts([...snapshot.debts].sort((a, b) => b.currentBalance - a.currentBalance));
    if (snapshot.cardStatements) setEstados(snapshot.cardStatements);
    if (snapshot.creditTerms) setTerminos(snapshot.creditTerms);
    if (snapshot.enMetas) setEnMetas(new Set(snapshot.enMetas));
    if (snapshot.papelera) setPapelera(snapshot.papelera);
  }, []);

  const currency = debts[0]?.currency ?? 'USD';
  // El abono a la tarjeta va con los saldos ENTEROS: el ámbito solo cambia lo
  // que se enseña, no lo que se debe.
  const payingCard = payCard ? debts.filter((d) => d.cardGroup === payCard && d.status === 'active') : [];
  const cuadrandoCard = cuadrarCard ? debts.filter((d) => d.cardGroup === cuadrarCard && d.status === 'active') : [];
  const cuentaEnTerminos = terminosDe
    ? debts.filter((d) => claveDeCuenta(d) === terminosDe && d.status !== 'archived')
    : [];
  const detail = debts.find((d) => d.id === detailId) ?? null;
  // Los mismos tramos que pinta su tarjeta en la lista: si la tarjeta deja de
  // estar (se liquidó, se fue a la papelera, cambió el ámbito), la hoja se
  // cierra sola en vez de quedarse enseñando una tarjeta que ya no está.
  const abierta = tarjetaAbierta
    ? bloques.find((b): b is Extract<typeof b, { tipo: 'tarjeta' }> => b.tipo === 'tarjeta' && b.group === tarjetaAbierta) ?? null
    : null;
  const paying = debts.find((d) => d.id === payId) ?? null;
  const editing = debts.find((d) => d.id === editId) ?? null;
  const target = portfolio.avalanche[0] ?? null;

  // El mismo pago en Pagos y en Deudas se restaba dos veces en el plan. Se
  // recalcula en el cliente para que el banner desaparezca en el momento en
  // que se resuelve, sin recargar.
  const suspects = useMemo(
    () => findDuplicateObligations(
      payments,
      debts.map((d) => ({
        id: d.id,
        name: d.name,
        issuer: d.issuer,
        installment: d.projection.installment,
        linkedPaymentId: d.linkedPaymentId,
        duplicateDismissed: d.duplicateDismissed,
      })),
    ),
    [payments, debts],
  );

  const upsert = useCallback((updated: DebtWithProjection) => {
    setDebts((prev) => {
      const exists = prev.some((d) => d.id === updated.id);
      const next = exists ? prev.map((d) => (d.id === updated.id ? updated : d)) : [...prev, updated];
      return [...next].sort((a, b) => b.currentBalance - a.currentBalance);
    });
  }, []);

  /**
   * Saca de la lista lo que el servidor ya mandó a la papelera y lo apunta en
   * ella. La fecha es la del dispositivo: solo sirve para agrupar el gesto
   * hasta la próxima carga, que trae la del servidor.
   */
  function aLaPapelera(quitadas: readonly DebtWithProjection[]) {
    const ids = new Set(quitadas.map((d) => d.id));
    const ahora = new Date().toISOString();
    setDebts((prev) => prev.filter((d) => !ids.has(d.id)));
    setPapelera((prev) => [
      ...quitadas.map((d) => ({
        id: d.id,
        name: d.name,
        kind: d.kind,
        issuer: d.issuer,
        accountLast4: d.accountLast4,
        cardGroup: d.cardGroup,
        balance: d.currentBalance,
        currency: d.currency,
        deletedAt: ahora,
      })),
      ...prev.filter((p) => !ids.has(p.id)),
    ]);
  }

  /**
   * Saca de la papelera `id` (y los tramos borrados con ella). Lo que vuelve
   * se pide entero al servidor en vez de reconstruirlo aquí: trae el interés
   * que se devengó mientras estaba fuera, sus estados de cuenta y sus metas.
   */
  async function recuperar(id: string, ids: readonly string[]) {
    setRecuperando(id);
    try {
      const res = await fetch(`/api/debts/${id}/restore`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo recuperar');
      }
      setPapelera((prev) => prev.filter((p) => !ids.includes(p.id)));
      haptic();
      try {
        const lista = await fetch('/api/debts', { credentials: 'include' });
        if (!lista.ok) throw new Error('lista');
        replaceAll((await lista.json()) as DebtsSnapshot);
        toast.show('Recuperada', 'success');
      } catch {
        // Ya está fuera de la papelera en la base; lo que falló es solo
        // volver a pintar la lista. Decirlo evita que se recupere dos veces.
        toast.show('Recuperada. Abre Deudas de nuevo para verla', 'info');
      }
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      toast.show(offline ? 'Sin conexión: no se recuperó nada' : (err as Error).message, 'error');
    } finally {
      setRecuperando(null);
    }
  }

  /** El aviso de después de borrar: dice a dónde fue y deja deshacerlo ahí mismo. */
  function avisarPapelera(mensaje: string, quitadas: readonly DebtWithProjection[]) {
    const ids = quitadas.map((d) => d.id);
    if (ids.length === 0) return;
    toast.show(mensaje, 'success', { etiqueta: 'Deshacer', alTocar: () => void recuperar(ids[0], ids) });
  }

  /** El detalle ya hizo el DELETE: aquí solo se apunta y se avisa. */
  function borradaDesdeElDetalle(id: string) {
    const d = debts.find((x) => x.id === id);
    setDetailId(null);
    if (!d) return;
    aLaPapelera([d]);
    avisarPapelera('Deuda en la papelera', [d]);
  }

  /**
   * El menú «⋯» de una tarjeta o de una deuda, armado con lo que hay HOY.
   *
   * Cada acción lleva debajo el dato que decide si tocarla —el mínimo y si
   * está cubierto, el banco de sus condiciones, si ya está en Metas—, nunca
   * una instrucción. Las acciones son siempre las mismas y en el mismo orden,
   * para que el pulgar aprenda dónde está cada una; solo cambia «Pasar a
   * Metas», que se vuelve «Ver en Metas» cuando ya no queda nada que pasar.
   */
  const acciones = useMemo((): { titulo: string; lista: Accion[] } | null => {
    if (!menu) return null;
    const hoy = toDateKey(new Date());

    const accionMetas = (cuentas: DebtWithProjection[], titulo: string, hintPasar: string): Accion | null => {
      const r = resumenEnMetas(cuentas, hoy, enMetas);
      if (r.porPasar > 0) {
        return {
          emoji: '🎯',
          label: 'Pasar a Metas',
          hint: hintPasar,
          onClick: () => setMetasDe({ ids: cuentas.map((d) => d.id), titulo }),
        };
      }
      if (r.yaEnMetas > 0) {
        return { emoji: '✅', label: 'Ver en Metas', hint: 'Ya está en tu Plan', onClick: () => router.push('/plan#metas') };
      }
      return null; // Todo pagado: no queda nada que perseguir.
    };
    const nombreDe = (c: CondicionesDeCredito | null | undefined) =>
      c ? (c.plantilla === 'propia' ? 'A tu medida' : PLANTILLAS[c.plantilla].nombre) : undefined;

    if (menu.tipo === 'tarjeta') {
      // Con los saldos ENTEROS: el ámbito solo cambia lo que se enseña.
      const tramos = debts.filter((d) => d.cardGroup === menu.group && d.status !== 'archived');
      if (tramos.length === 0) return null;
      const titulo = cardTitle(tramos);
      const estado = estados[menu.group] ?? null;
      const cobertura = estadoDelMinimo(estado);
      const debe = tramos.reduce((s, d) => s + d.currentBalance, 0);
      const cur = tramos[0].currency;
      const porPasar = tramos.filter((t) => !enMetas.has(t.id) && t.currentBalance > 0).length;
      const lista: (Accion | null)[] = [
        debe > 0
          ? {
              emoji: '💸',
              label: 'Abonar a la tarjeta',
              hint:
                estado && cobertura
                  ? cobertura.cubierto
                    ? `Mínimo ${fmtMoney(estado.minimumDue, cur)} · ✓ cubierto`
                    : `Faltan ${fmtMoney(cobertura.falta, cur)} del mínimo`
                  : undefined,
              onClick: () => setPayCard(menu.group),
            }
          : null,
        {
          emoji: '🧾',
          label: 'Cuadrar con el estado de cuenta',
          hint: estado ? `El último cerró el ${fmtDateFull(estado.closingDate)}` : 'Aún sin ninguno',
          onClick: () => setCuadrarCard(menu.group),
        },
        {
          emoji: '🏦',
          label: 'Condiciones del banco',
          hint: nombreDe(terminos[menu.group]),
          onClick: () => setTerminosDe(menu.group),
        },
        accionMetas(tramos, titulo, `${porPasar} ${porPasar === 1 ? 'tramo' : 'tramos'} · sin teclear nada`),
        {
          emoji: '🗑️',
          label: 'Borrar tarjeta',
          hint: `Va a la papelera con sus ${tramos.length} tramos`,
          destructive: true,
          onClick: () =>
            setBorrado({
              tipo: 'tarjeta',
              group: menu.group,
              titulo,
              tramos: tramos.length,
              metas: tramos.filter((t) => enMetas.has(t.id)).length,
            }),
        },
      ];
      return { titulo, lista: lista.filter((a): a is Accion => a !== null) };
    }

    const d = debts.find((x) => x.id === menu.id);
    if (!d) return null;
    const lista: (Accion | null)[] = [
      d.currentBalance > 0 ? { emoji: '💸', label: 'Abonar', onClick: () => setPayId(d.id) } : null,
      { emoji: '✏️', label: 'Editar datos', onClick: () => setEditId(d.id) },
      {
        emoji: '🏦',
        label: 'Condiciones del banco',
        hint: nombreDe(terminos[claveDeCuenta(d)]),
        onClick: () => setTerminosDe(claveDeCuenta(d)),
      },
      accionMetas([d], d.name, `Falta ${fmtMoney(d.currentBalance, d.currency)} · sin teclear nada`),
      {
        emoji: '🗑️',
        label: 'Borrar deuda',
        hint: 'Va a la papelera',
        destructive: true,
        onClick: () => setBorrado({ tipo: 'deuda', id: d.id, titulo: d.name, metas: enMetas.has(d.id) ? 1 : 0 }),
      },
    ];
    return { titulo: d.name, lista: lista.filter((a): a is Accion => a !== null) };
  }, [menu, debts, estados, terminos, enMetas, router]);

  /**
   * Manda a la papelera lo confirmado. La lista se actualiza con la respuesta
   * del servidor, no antes: si la base dice que no, la tarjeta sigue ahí y un
   * aviso lo dice.
   */
  async function confirmarBorrado() {
    if (!borrado || borrando) return;
    setBorrando(true);
    try {
      const url = borrado.tipo === 'tarjeta' ? `/api/debts/cards/${borrado.group}` : `/api/debts/${borrado.id}`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo borrar');
      }
      // Sus estados de cuenta y condiciones se quedan en memoria a propósito:
      // si se deshace, la tarjeta vuelve con su mínimo sin esperar a nada.
      const b = borrado;
      const quitadas = debts.filter((d) => (b.tipo === 'tarjeta' ? d.cardGroup === b.group : d.id === b.id));
      aLaPapelera(quitadas);
      if (b.tipo === 'deuda') setDetailId(null);
      haptic([10, 30, 10]);
      avisarPapelera(b.tipo === 'tarjeta' ? 'Tarjeta en la papelera' : 'Deuda en la papelera', quitadas);
      setBorrado(null);
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      toast.show(offline ? 'Sin conexión: no se borró nada' : (err as Error).message, 'error');
    } finally {
      setBorrando(false);
    }
  }

  const deudasAMetas = metasDe ? debts.filter((d) => metasDe.ids.includes(d.id)) : [];

  return (
    <div className="space-y-5">
      {/* ─── Personal / Negocio ───────────────────────────────────────────
          Encima de TODO, porque cambia hasta el titular: la cartera, el
          consejo de a cuál atacar y la lista hablan del lado elegido. */}
      <ScopeTabs
        value={scope}
        onChange={setScope}
        summary={scopeSummary}
        format={(n) => fmtMoneyShort(n, currency)}
      />

      {/* ─── Cartera: cuánto, cuánto avanzado y cuándo cae cada una ─────── */}
      {visibles.length > 0 && (
        <CaminoLibre
          camino={camino}
          totalBalance={portfolio.totalBalance}
          interesMes={portfolio.totalMonthlyInterest}
          cuotasMes={portfolio.totalMonthlyCommitment}
          libre={portfolio.freeDate}
          currency={currency}
          onAbrir={setDetailId}
        />
      )}

      {/* ─── A cuál atacar primero ───────────────────────────────────────── */}
      {target && visibles.filter((d) => d.currentBalance > 0).length > 1 && (
        <button
          type="button"
          onClick={() => {
            haptic();
            setDetailId(target.id);
          }}
          className="card flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.99] hover:shadow-[var(--shadow-md)]"
        >
          <span className="text-2xl" aria-hidden="true">🎯</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--ink)]">Ataca primero {target.name}</p>
            <p className="t-meta">
              Es la de tasa más alta: te cuesta{' '}
              {fmtMoney(target.monthlyInterest, currency)} al mes
            </p>
          </div>
          <span className="shrink-0 text-slate-400" aria-hidden="true">›</span>
        </button>
      )}

      {/* ─── Posibles duplicados ─────────────────────────────────────────
          Va ARRIBA de la lista y no dentro de cada tarjeta: es un problema de
          cuentas, no un detalle de una deuda, y hay que verlo al entrar. */}
      {suspects.map((s) => (
        <DuplicateBanner key={s.debtId} suspect={s} onResolved={upsert} />
      ))}

      {/* ─── Lista ───────────────────────────────────────────────────────── */}
      {visibles.length > 0 && (
        <div className="card-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bloques.map((b) =>
            b.tipo === 'tarjeta' ? (
              <CardGroupCard
                key={b.group}
                tramos={b.tramos}
                onOpen={() => setTarjetaAbierta(b.group)}
                onOpenTramo={setDetailId}
                onPay={() => setPayCard(b.group)}
                estado={estados[b.group] ?? null}
                condiciones={terminos[b.group] ?? null}
                onMenu={() => setMenu({ tipo: 'tarjeta', group: b.group })}
              />
            ) : (
              <DebtCard
                key={b.debt.id}
                debt={b.debt}
                onOpen={() => setDetailId(b.debt.id)}
                onPay={() => setPayId(b.debt.id)}
                onMenu={() => setMenu({ tipo: 'deuda', id: b.debt.id })}
              />
            ),
          )}
        </div>
      )}

      {/* ─── Vacío: tocar el tipo de deuda ABRE el alta encaminada ───────── */}
      {debts.length === 0 && (
        <div className="py-4">
          <div className="grid grid-cols-3 gap-3">
            {(['credit_card', 'loan', 'auto', 'mortgage', 'store', 'other'] as const).map((k) => {
              const meta = KIND_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    haptic();
                    setWizardOpen(true);
                  }}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl border border-sky-100 bg-white shadow-sm transition-all duration-150 active:scale-95 active:shadow-inner hover:shadow-md"
                >
                  <span className="text-3xl leading-none" aria-hidden="true">{meta.emoji}</span>
                  <span className="text-xs font-bold text-black">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* El alta vivía en un botón flotante fijo que TAPABA el contenido de las
          tarjetas —la cuota quedaba debajo del círculo—. Ahora es un botón
          ancho al final de la lista: nada se solapa, y al ir en el flujo del
          documento sigue quedando a mano del pulgar. */}
      <button
        type="button"
        onClick={() => {
          haptic();
          setWizardOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-3xl bg-sky-500 py-4 text-sm font-bold text-white shadow-sm transition-all duration-150 hover:bg-sky-600 active:scale-95"
      >
        <PlusIcon className="h-5 w-5" />
        Agregar deuda
      </button>

      {/* ─── Papelera: lo borrado vuelve con su historial ──────────────────
          Al final y plegada: es a donde se viene a buscar algo, no algo que
          mirar cada día. Sale también con la lista vacía, que es justo
          cuando más falta hace (se borró todo y hay que encontrarlo). */}
      <PapeleraDeDeudas
        filas={papelera}
        recuperando={recuperando}
        onRecuperar={(id, ids) => void recuperar(id, ids)}
      />

      <AnimatePresence>
        {wizardOpen && (
          <DebtWizardModal
            key="wizard"
            currency={currency}
            onClose={() => setWizardOpen(false)}
            onCreated={upsert}
          />
        )}
        {abierta && (
          <CardDetailSheet
            key="tarjeta"
            tramos={abierta.tramos}
            estado={estados[abierta.group] ?? null}
            condiciones={terminos[abierta.group] ?? null}
            onClose={() => setTarjetaAbierta(null)}
            // Como la hoja de una deuda al abonar: se cierra y deja paso a la
            // siguiente, en vez de apilar dos hojas.
            onOpenTramo={(id) => {
              setTarjetaAbierta(null);
              setDetailId(id);
            }}
            onPay={() => {
              setTarjetaAbierta(null);
              setPayCard(abierta.group);
            }}
            onMenu={() => {
              setTarjetaAbierta(null);
              setMenu({ tipo: 'tarjeta', group: abierta.group });
            }}
          />
        )}
        {detail && (
          <DebtDetailSheet
            key="detail"
            debt={detail}
            onClose={() => setDetailId(null)}
            onChanged={upsert}
            onDeleted={borradaDesdeElDetalle}
            onPay={() => {
              setPayId(detail.id);
              setDetailId(null);
            }}
            onEdit={() => {
              setEditId(detail.id);
              setDetailId(null);
            }}
            cardCandidates={debts.filter((d) => d.id !== detail.id && d.kind === 'credit_card' && d.status !== 'archived')}
            onSnapshot={replaceAll}
            onCondiciones={() => {
              setTerminosDe(claveDeCuenta(detail));
              setDetailId(null);
            }}
          />
        )}
        {editing && (
          <DebtEditModal
            key="edit"
            debt={editing}
            onClose={() => setEditId(null)}
            onSaved={upsert}
          />
        )}
        {paying && (
          <DebtPaymentModal
            key="pay"
            debt={paying}
            onClose={() => setPayId(null)}
            onPaid={upsert}
          />
        )}
        {payingCard.length > 0 && (
          <CardPaymentModal
            key="pay-card"
            tramos={payingCard}
            estado={payCard ? estados[payCard] ?? null : null}
            condiciones={payCard ? terminos[payCard] ?? null : null}
            onClose={() => setPayCard(null)}
            onPaid={(actualizadas, monto) => {
              actualizadas.forEach(upsert);
              const grupo = payCard;
              if (grupo) {
                setEstados((prev) =>
                  prev[grupo]
                    ? { ...prev, [grupo]: { ...prev[grupo], paidSinceClosing: prev[grupo].paidSinceClosing + monto } }
                    : prev,
                );
              }
            }}
          />
        )}
        {cuadrandoCard.length > 0 && (
          <CardStatementModal
            key="cuadrar-card"
            tramos={cuadrandoCard}
            estado={cuadrarCard ? estados[cuadrarCard] ?? null : null}
            onClose={() => setCuadrarCard(null)}
            onSaved={replaceAll}
          />
        )}
        {cuentaEnTerminos.length > 0 && terminosDe && (
          <CreditTermsSheet
            key="terminos"
            tramos={cuentaEnTerminos}
            // Sin las del servidor (una respuesta vieja), las de por defecto:
            // el botón nunca abre nada vacío.
            condiciones={terminos[terminosDe] ?? condicionesDeLaCuenta(cuentaEnTerminos, null)}
            estado={estados[terminosDe] ?? null}
            onClose={() => setTerminosDe(null)}
            onSaved={replaceAll}
          />
        )}
        {metasDe && deudasAMetas.length > 0 && (
          <PasarAMetasSheet
            key="metas"
            deudas={deudasAMetas}
            titulo={metasDe.titulo}
            enMetas={enMetas}
            onClose={() => setMetasDe(null)}
            onEnMetas={(ids) => setEnMetas((prev) => new Set([...prev, ...ids]))}
          />
        )}
      </AnimatePresence>

      {/* ─── El menú «⋯» de cada tarjeta ──────────────────────────────────── */}
      <ActionSheet
        open={acciones !== null}
        onClose={() => setMenu(null)}
        title={acciones?.titulo}
        actions={acciones?.lista ?? []}
      />

      {/* Borrar nunca está a un toque: el menú lo propone y esto lo confirma. */}
      <ConfirmDialog
        open={borrado !== null}
        title={borrado ? `¿Borrar ${borrado.titulo}?` : ''}
        message={
          borrado
            ? (borrado.tipo === 'tarjeta'
                ? `Va a la papelera con sus ${borrado.tramos} tramos y todo su historial.`
                : 'Va a la papelera con todo su historial.') +
              // Las metas no se tocan: siguen en el Plan con sus propias
              // cifras mientras la deuda está fuera (ver getFinancePlan).
              (borrado.metas === 1
                ? ' Su meta se queda en el Plan.'
                : borrado.metas > 1
                  ? ` Sus ${borrado.metas} metas se quedan en el Plan.`
                  : '') +
              ' La recuperas cuando quieras.'
            : undefined
        }
        confirmLabel="Sí, borrar"
        cancelLabel="Mejor no"
        destructive
        busy={borrando}
        onConfirm={() => void confirmarBorrado()}
        onCancel={() => {
          if (!borrando) setBorrado(null);
        }}
      />
    </div>
  );
}
