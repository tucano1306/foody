'use client';

import { createPortal } from 'react-dom';

/**
 * Saca un modal del contexto de apilamiento de la página.
 *
 * `<main>` es `relative z-10`, y eso CREA un contexto de apilamiento: todo lo
 * que se pinte dentro queda encerrado ahí y compite como z-10 frente a sus
 * hermanos, por alto que sea su propio z-index. La barra de pestañas del móvil
 * es hermana de `main` con `z-40`, así que tapaba la franja inferior de
 * cualquier hoja o diálogo — justo donde viven sus botones y sus últimas
 * filas. Un modal con `z-[60]` perdía igual: ese 60 solo valía dentro de
 * `main`.
 *
 * Colgándolo del `body` vuelve a competir de tú a tú con la barra.
 *
 * No hace falta para los que usan `<dialog>` con `showModal()`: el navegador
 * los pinta en la capa superior, por encima de todo y al margen del apilado.
 */
export default function ModalLayer({ children }: { readonly children: React.ReactNode }) {
  // En el servidor no hay `document`. Estos modales solo aparecen tras una
  // interacción, así que nunca se pierde nada del primer render.
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
