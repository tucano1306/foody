'use client';

import dynamic from 'next/dynamic';
import type { DebtsSnapshot } from '@/lib/debt-data';
import { destinoDelAbono, type DestinoDelAbono } from '@/lib/abono-de-meta';

/**
 * Los mismos modales de abono que Deudas, cargados al tocar: la mayoría de
 * las visitas al Plan no abona nada y no tienen por qué arrastrarlos.
 */
const DebtPaymentModal = dynamic(() => import('@/components/debts/DebtPaymentModal'), { ssr: false });
const CardPaymentModal = dynamic(() => import('@/components/debts/CardPaymentModal'), { ssr: false });

export type DestinoAbierto = Exclude<DestinoDelAbono, { tipo: 'nada' }>;

/**
 * Trae de Deudas lo que hace falta para abonar la deuda de una meta. Se pide
 * al tocar y no con el Plan: el Plan solo guarda un resumen de cada crédito, y
 * el modal necesita la deuda entera con su proyección y su estado de cuenta.
 */
export async function cargarDestinoDelAbono(debtId: string): Promise<DestinoDelAbono> {
  const res = await fetch('/api/debts', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return destinoDelAbono((await res.json()) as DebtsSnapshot, debtId);
}

interface Props {
  readonly destino: DestinoAbierto;
  readonly onClose: () => void;
  /** El abono ya está en Deudas: el Plan tiene que releer sus metas. */
  readonly onPaid: () => void;
}

/**
 * El abono de una meta enganchada se asienta en Deudas, con el modal de
 * Deudas. Así no hay dos registros del mismo dinero: la meta lee el saldo de
 * la deuda y se mueve sola (ver `abono-de-meta.ts`).
 */
export default function AbonoDeMeta({ destino, onClose, onPaid }: Props) {
  if (destino.tipo === 'tarjeta') {
    return (
      <CardPaymentModal
        tramos={destino.tramos}
        estado={destino.estado}
        condiciones={destino.condiciones}
        onClose={onClose}
        onPaid={() => onPaid()}
      />
    );
  }
  return <DebtPaymentModal debt={destino.debt} onClose={onClose} onPaid={() => onPaid()} />;
}
