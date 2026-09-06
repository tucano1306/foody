'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';

/**
 * Acción principal de cada pantalla, al alcance del pulgar.
 *
 * En móvil, el botón de «Agregar» vivía arriba del todo, pegado al título: la
 * esquina más lejana de la mano que sujeta el teléfono. Aquí abajo, justo
 * encima de la barra de pestañas, se toca sin recolocar el móvil y está siempre
 * en el mismo sitio, sea cual sea la sección.
 *
 * Con etiqueta y no solo con un «+»: un botón redondo con una cruz obliga a
 * adivinar qué crea; dos palabras lo dicen y siguen cabiendo en una mano.
 *
 * Solo aparece en móvil — en escritorio el botón de la cabecera está a la vista
 * y ahí no hay problema de alcance.
 */
const ACTIONS: readonly { readonly match: string; readonly href: string; readonly label: string }[] = [
  { match: '/products', href: '/products/new', label: 'Producto' },
  { match: '/payments', href: '/payments/new', label: 'Pago' },
  { match: '/shopping-trips', href: '/shopping-trips/new', label: 'Compra' },
];

export default function PrimaryAction() {
  const pathname = usePathname();

  // Solo en la pantalla RAÍZ de cada sección. Dentro de un formulario o de un
  // detalle, un botón flotante de «crear otro» estorba y confunde.
  const action = ACTIONS.find((a) => pathname === a.match);

  return (
    <AnimatePresence>
      {action && (
        <motion.div
          key={action.href}
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="md:hidden fixed right-4 z-30"
          style={{ bottom: 'calc(var(--tabbar-h) + 0.75rem)' }}
        >
          <Link
            href={action.href}
            onClick={() => haptic(10)}
            className="btn-primary flex items-center gap-2 rounded-full pl-4 pr-5 h-14 text-[15px]"
          >
            <PlusIcon className="w-5 h-5 shrink-0" />
            {action.label}
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
