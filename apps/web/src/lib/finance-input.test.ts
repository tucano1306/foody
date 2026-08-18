import { describe, expect, it } from 'vitest';
import { isError, validateGoalBody } from './finance-input';

const base = { name: 'Viajar a Uruguay', targetAmount: 2400 };

function parse(body: Record<string, unknown>) {
  const out = validateGoalBody(body);
  if (isError(out)) throw new Error(`esperaba una meta válida: ${out.error}`);
  return out;
}

/**
 * La prioridad dejó de escribirse desde el formulario: ahora es la POSICIÓN de
 * la tarjeta en la lista. Que llegue `null` no es un descuido — es lo que le
 * dice a la ruta «no la toques»: una meta nueva se va al final y una que se
 * edita se queda donde estaba. Sin esto, cambiarle el nombre a una meta
 * deshacía el orden que el usuario había armado arrastrando.
 */
describe('validateGoalBody — prioridad', () => {
  it('sin prioridad en el cuerpo devuelve null, no un valor inventado', () => {
    expect(parse(base).priority).toBeNull();
  });

  it('ignora una prioridad que no es número', () => {
    expect(parse({ ...base, priority: '2' }).priority).toBeNull();
    expect(parse({ ...base, priority: null }).priority).toBeNull();
    expect(parse({ ...base, priority: Number.NaN }).priority).toBeNull();
  });

  it('respeta la posición cuando sí llega', () => {
    expect(parse({ ...base, priority: 7 }).priority).toBe(7);
  });

  it('ya no se limita a 1-3: la lista puede ser larga', () => {
    expect(parse({ ...base, priority: 40 }).priority).toBe(40);
  });

  it('recorta lo imposible en vez de rechazar la meta entera', () => {
    expect(parse({ ...base, priority: 0 }).priority).toBe(1);
    expect(parse({ ...base, priority: -5 }).priority).toBe(1);
    expect(parse({ ...base, priority: 999_999 }).priority).toBe(9999);
    expect(parse({ ...base, priority: 3.7 }).priority).toBe(3);
  });
});
