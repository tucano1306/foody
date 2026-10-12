import { describe, expect, it } from 'vitest';
import { cabeceraFirma, firmarCuerpo } from './firma';

/**
 * El contrato con Computo: el mismo vector está en
 * computoplus/__tests__/unit/lib/foody-firma.test.ts. Si el algoritmo cambia en
 * una app y no en la otra, falla una de las dos.
 */
const SECRETO = 'secreto-de-prueba-foody-computo-0123456789';

describe('firma Foody → Computo', () => {
  it('el vector compartido con Computo', () => {
    expect(firmarCuerpo(SECRETO, 1_760_000_000, '{"ping":true}')).toBe(
      '7215974da98b111d77836844a943ce044c3a73f4e85ce1b01c88796d56529795',
    );
  });

  it('la cabecera lleva el sello de tiempo en segundos y la firma de ese instante', () => {
    const c = cabeceraFirma(SECRETO, '{"ping":true}', 1_760_000_000_999);
    expect(c).toBe('t=1760000000,v1=7215974da98b111d77836844a943ce044c3a73f4e85ce1b01c88796d56529795');
  });
});
