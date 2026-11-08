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

/**
 * Alto del botón y su separación de la barra. Viven aquí, juntos, porque el
 * hueco del final de la página se calcula con ellos: si el botón crece y el
 * hueco no, vuelve a tapar lo último de la lista.
 */
const ALTO = '3.5rem';
const SEPARACION = '0.75rem';

export default function PrimaryAction() {
  const pathname = usePathname();

  // Solo en la pantalla RAÍZ de cada sección. Dentro de un formulario o de un
  // detalle, un botón flotante de «crear otro» estorba y confunde.
  const action = ACTIONS.find((a) => pathname === a.match);

  return (
    <>
      {/* El hueco que ocupa el botón, al final de la página.

          El botón flota encima de la barra de pestañas, y `main` solo deja
          sitio a la barra: al llegar abajo, la última tarjeta se quedaba
          DEBAJO del botón y no había forma de subirla — en Compras tapaba el
          importe del último mes; en Productos, el nombre del último producto.
          Este hueco mide lo mismo que el botón más su separación de la barra,
          así que lo último de la lista siempre puede quedar por encima, con
          el mismo aire que `main` deja sobre la barra. Va fuera de la
          animación: el hueco no tiene que esperar a que el botón entre. */}
      {action && (
        <div
          aria-hidden="true"
          data-hueco-accion
          className="md:hidden shrink-0"
          style={{ height: `calc(${ALTO} + ${SEPARACION})` }}
        />
      )}
      <AnimatePresence>
        {action && (
          <motion.div
            key={action.href}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="md:hidden fixed right-4 z-30"
            style={{ bottom: `calc(var(--tabbar-h) + ${SEPARACION})` }}
          >
            <Link
              href={action.href}
              onClick={() => haptic(10)}
              className="btn-primary flex items-center gap-2 rounded-full pl-4 pr-5 text-[15px]"
              style={{ height: ALTO }}
            >
              <PlusIcon className="w-5 h-5 shrink-0" />
              {action.label}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
