import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ModalShell from './ModalShell';

function Shell({ title }: { title: string }) {
  return (
    <ModalShell title={title} onClose={() => {}}>
      contenido
    </ModalShell>
  );
}

/**
 * El caso que congelaba la app: dos modales solapados.
 *
 * En Deudas, tocar «Abonar» dentro de la hoja de detalle abre el modal de abono
 * y cierra la hoja a la vez. Como la hoja sale con animación, durante ~180 ms
 * los DOS están montados, y ahí es donde el candado del scroll se pisaba a sí
 * mismo: el segundo modal guardaba `hidden` como "estado anterior" y al
 * cerrarse lo restauraba. El fondo quedaba sin scroll para siempre.
 */
describe('ModalShell — candado del scroll', () => {
  it('devuelve el scroll al fondo cuando se cierra el último de dos modales solapados', () => {
    const detalle = render(<Shell title="Detalle" />);
    expect(document.body.style.overflow).toBe('hidden');

    // El modal de abono se abre ANTES de que la hoja termine de salir.
    const abono = render(<Shell title="Abonar" />);
    expect(document.body.style.overflow).toBe('hidden');

    // La hoja termina su animación de salida y se desmonta.
    detalle.unmount();
    expect(document.body.style.overflow).toBe('hidden'); // sigue habiendo un modal

    // Se cierra el abono: ya no queda ninguno.
    abono.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
