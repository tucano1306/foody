import Link from 'next/link';
import { CameraIcon } from '@heroicons/react/24/solid';

/**
 * «Escanear ticket»: la puerta por la que entran los datos que alimentan todo
 * el plan.
 *
 * Existe como componente y no como dos botones iguales porque esos dos botones
 * ya se separaron dos veces: primero en el texto —uno decía «Escanear» y el
 * otro «Escanear factura», haciendo lo mismo y yendo al mismo sitio— y después
 * en el color, uno en `sky-500` y el otro en `blue-500`. Son el mismo botón en
 * dos tarjetas; escrito una sola vez, no pueden discrepar.
 */
export default function ScanTicketButton() {
  return (
    <Link
      href="/shopping-trips/new"
      className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-600 active:scale-95 text-white text-sm font-bold shadow-sm transition"
    >
      <CameraIcon className="w-5 h-5" />
      Escanear ticket
    </Link>
  );
}
