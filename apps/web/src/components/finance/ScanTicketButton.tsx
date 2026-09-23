import Link from 'next/link';
import { CameraIcon } from '@heroicons/react/24/solid';
import { DEFAULT_EXPENSE_KIND, type ExpenseKind } from '@/lib/expense-kind';

interface Props {
  /**
   * Con qué tipo de gasto abre el formulario, que es lo mismo que decir: desde
   * qué tarjeta se tocó.
   *
   * Escanear desde «Fuera del super» y que el ticket acabe en Compras es
   * exactamente lo que el usuario NO pidió. La tarjeta desde la que se entra es
   * una decisión suya, no una conjetura, y llega al formulario ya tomada.
   */
  readonly kind?: ExpenseKind;
}

/**
 * «Escanear ticket»: la puerta por la que entran los datos que alimentan todo
 * el plan.
 *
 * Existe como componente y no como dos botones iguales porque esos dos botones
 * ya se separaron dos veces: primero en el texto —uno decía «Escanear» y el
 * otro «Escanear factura», haciendo lo mismo y yendo al mismo sitio— y después
 * en el color, uno en `sky-500` y el otro en `blue-500`.
 *
 * Unificarlos arregló el aspecto y de paso borró lo único que SÍ tenía que
 * diferir: a dónde va a parar el gasto. Se ven y se llaman igual en las dos
 * tarjetas; lo que cambia es con qué tipo abren el formulario.
 */
export default function ScanTicketButton({ kind = DEFAULT_EXPENSE_KIND }: Props = {}) {
  return (
    <Link
      href={`/shopping-trips/new?kind=${kind}`}
      className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-600 active:scale-95 text-white text-sm font-bold shadow-sm transition"
    >
      <CameraIcon className="w-5 h-5" />
      Escanear ticket
    </Link>
  );
}
