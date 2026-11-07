import { describe, expect, it } from 'vitest';
import { isError, MAX_DEUDAS_A_METAS, parseDebtIdsBody, validateGoalBody } from './finance-input';

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

/**
 * «Pasar a Metas» solo acepta ids: el nombre, el saldo y la fecha los lee el
 * servidor de la deuda. Lo que se prueba aquí es que nada raro llegue hasta
 * el `::uuid[]` de la consulta.
 */
describe('parseDebtIdsBody — qué deudas pasar a Metas', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  it('devuelve los ids en el orden pedido, sin repetidos', () => {
    expect(parseDebtIdsBody({ debtIds: [B, A, B] })).toEqual([B, A]);
  });

  it('normaliza mayúsculas y espacios: el mismo id escrito distinto es el mismo', () => {
    expect(parseDebtIdsBody({ debtIds: [` ${A.toUpperCase()} `, A] })).toEqual([A]);
  });

  it('sin lista, o vacía, es un error', () => {
    expect(isError(parseDebtIdsBody({}))).toBe(true);
    expect(isError(parseDebtIdsBody({ debtIds: [] }))).toBe(true);
    expect(isError(parseDebtIdsBody({ debtIds: A }))).toBe(true);
  });

  it('un id que no es uuid tumba la petición entera, no se salta en silencio', () => {
    expect(isError(parseDebtIdsBody({ debtIds: [A, "x' OR 1=1"] }))).toBe(true);
    expect(isError(parseDebtIdsBody({ debtIds: [A, 42] }))).toBe(true);
  });

  it('pone tope a cuántas a la vez', () => {
    const muchos = Array.from({ length: MAX_DEUDAS_A_METAS + 1 }, (_, i) =>
      `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    expect(isError(parseDebtIdsBody({ debtIds: muchos }))).toBe(true);
    expect(parseDebtIdsBody({ debtIds: muchos.slice(0, MAX_DEUDAS_A_METAS) })).toHaveLength(MAX_DEUDAS_A_METAS);
  });
});
