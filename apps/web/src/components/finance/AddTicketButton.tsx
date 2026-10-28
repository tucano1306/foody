import Link from 'next/link';
import { PlusIcon } from '@heroicons/react/24/solid';
import { DEFAULT_EXPENSE_KIND, type ExpenseKind } from '@/lib/expense-kind';

interface Props {
  /**
   * Con qué tipo de gasto abre el formulario, que es lo mismo que decir: desde
   * qué tarjeta se tocó.
   *
   * Agregar desde «Fuera del super» y que el ticket acabe en Compras es
   * exactamente lo que el usuario NO pidió. La tarjeta desde la que se entra es
   * una decisión suya, no una conjetura, y llega al formulario ya tomada.
   */
  readonly kind?: ExpenseKind;
}

/**
 * «Agregar ticket»: la puerta por la que entran los datos que alimentan todo
 * el plan.
 *
 * Decía «Escanear ticket», con una cámara, y el formulario al que lleva se
 * rellena igual de bien A MANO —tienda, total— con el escáner como atajo
 * opcional dentro. El botón prometía un solo camino donde hay dos.
 *
 * Existe como componente y no como dos botones iguales porque esos dos botones
 * ya se separaron dos veces: primero en el texto —uno decía «Escanear» y el
 * otro «Escanear factura», haciendo lo mismo y yendo al mismo sitio— y después
 * en el color. Se ven y se llaman igual en las dos tarjetas; lo que cambia es
 * con qué tipo abren el formulario.
 */
export default function AddTicketButton({ kind = DEFAULT_EXPENSE_KIND }: Props = {}) {
  return (
    <Link
      href={`/shopping-trips/new?kind=${kind}`}
      className="btn-primary shrink-0 flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition"
    >
      <PlusIcon className="w-5 h-5" />
      Agregar ticket
    </Link>
  );
}
