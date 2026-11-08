// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La capa de datos de tiendas contra un `sql` falso que apunta cada sentencia.
 * Lo que importa aquí: todo va acotado al usuario, una sucursal ajena no se
 * cuela en una compra, y unir tiendas escribe las tres tablas a la vez.
 */

type Fila = Record<string, unknown>;
interface Sentencia {
  readonly texto: string;
  readonly valores: unknown[];
}
const sentencias: Sentencia[] = [];
let respuestas: Array<Fila[] | Error> = [];
const transacciones: number[] = [];

vi.mock('@/lib/db', () => {
  const sql = (strings: TemplateStringsArray, ...valores: unknown[]) => {
    sentencias.push({ texto: strings.join('?').replace(/\s+/g, ' ').trim(), valores });
    const r = respuestas.shift() ?? [];
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  sql.transaction = async (consultas: Promise<Fila[]>[]) => {
    transacciones.push(consultas.length);
    return Promise.all(consultas);
  };
  return { sql };
});
vi.mock('./ensure-schema', () => ({ ensureExpenseKindSchema: async () => undefined }));

const datos = await import('./stores-data');

const U = 'user-1';
const SUC = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  sentencias.length = 0;
  respuestas = [];
  transacciones.length = 0;
});

describe('nombreDeTiendaCanonico', () => {
  it('escribe el nombre como ya existe', async () => {
    respuestas = [[{ nombre: 'Publix' }, { nombre: 'publix' }, { nombre: 'Walmart' }]];
    expect(await datos.nombreDeTiendaCanonico(U, '  PUBLIX ')).toBe('Publix');
    expect(sentencias[0].valores).toEqual([U, U]);
  });

  it('vacío no consulta; si la base falla, guarda lo escrito', async () => {
    expect(await datos.nombreDeTiendaCanonico(U, '  ')).toBeNull();
    expect(sentencias).toHaveLength(0);
    respuestas = [new Error('neon caído')];
    expect(await datos.nombreDeTiendaCanonico(U, ' Trader  Joe ')).toBe('Trader Joe');
  });
});

describe('resolverTiendaDelViaje', () => {
  it('una sucursal del usuario con el mismo nombre: nombre y sucursal', async () => {
    respuestas = [[{ id: SUC, name: 'Publix' }]];
    expect(await datos.resolverTiendaDelViaje(U, 'publix', SUC)).toEqual({ storeName: 'Publix', storeId: SUC });
    expect(sentencias[0].texto).toContain('WHERE id = ? AND user_id = ?');
    expect(sentencias[0].valores).toEqual([SUC, U]);
  });

  it('sin nombre escrito, toma el de la sucursal', async () => {
    respuestas = [[{ id: SUC, name: 'Publix' }]];
    expect(await datos.resolverTiendaDelViaje(U, '', SUC)).toEqual({ storeName: 'Publix', storeId: SUC });
  });

  it('la sucursal de otro usuario (o que no existe) se ignora', async () => {
    respuestas = [[], [{ nombre: 'Walmart' }]];
    expect(await datos.resolverTiendaDelViaje(U, 'walmart', SUC)).toEqual({ storeName: 'Walmart', storeId: null });
  });

  it('si al cerrar cambió el nombre a otra tienda, manda el nombre', async () => {
    respuestas = [[{ id: SUC, name: 'Publix' }], [{ nombre: 'Publix' }, { nombre: 'Aldi' }]];
    expect(await datos.resolverTiendaDelViaje(U, 'aldi', SUC)).toEqual({ storeName: 'Aldi', storeId: null });
  });

  it('un id que no es UUID ni se consulta', async () => {
    respuestas = [[{ nombre: 'Publix' }]];
    expect(await datos.resolverTiendaDelViaje(U, 'Publix', "1' OR '1'='1")).toEqual({ storeName: 'Publix', storeId: null });
    expect(sentencias.every((s) => !s.texto.includes('FROM stores WHERE id'))).toBe(true);
  });
});

describe('listarTiendas', () => {
  it('junta tickets, compras sueltas y sucursales, y propone las repetidas', async () => {
    respuestas = [
      [
        { nombre: 'Publix', kind: 'grocery', usos: '16', ultima: '2026-11-01T15:00:00.000Z' },
        { nombre: 'publix', kind: 'grocery', usos: '1', ultima: '2026-06-01T15:00:00.000Z' },
      ],
      [{ nombre: 'Publix', usos: '2', ultima: new Date('2026-11-03T15:00:00.000Z') }],
      [{ id: SUC, name: 'Publix', address: 'Pines Blvd', latitude: '26.0078000', longitude: '-80.2962000' }],
    ];
    const r = await datos.listarTiendas(U);
    expect(r.tiendas[0]).toMatchObject({ nombre: 'Publix', usos: 18, ultima: '2026-11-03T15:00:00.000Z' });
    expect(r.tiendas[0].sucursales).toEqual([{ id: SUC, nombre: 'Publix', direccion: 'Pines Blvd', lat: 26.0078, lng: -80.2962 }]);
    expect(r.repetidas.map((g) => g.nombre)).toEqual(['Publix']);
    expect(sentencias.every((s) => s.valores.includes(U))).toBe(true);
  });

  it('una sucursal vieja con una sola coordenada sale sin ubicación', async () => {
    respuestas = [[], [], [{ id: SUC, name: 'Aldi', address: null, latitude: '26.1', longitude: null }]];
    const r = await datos.listarTiendas(U);
    expect(r.sucursales[0]).toMatchObject({ lat: null, lng: null });
  });
});

describe('unirTiendas', () => {
  it('cambia tickets, compras sueltas y sucursales en UNA transacción, solo del usuario', async () => {
    respuestas = [[{ id: 't1' }, { id: 't2' }], [{ id: 'p1' }], []];
    const r = await datos.unirTiendas(U, ['Cvs', 'CVS Pharmacy'], 'CVS');
    expect(r).toEqual({ compras: 2, sueltas: 1, sucursales: 0 });
    expect(transacciones).toEqual([3]);
    const textos = sentencias.map((s) => s.texto);
    expect(textos[0]).toMatch(/^UPDATE shopping_trips SET store_name = \?/);
    expect(textos[1]).toMatch(/^UPDATE product_purchases SET store_name = \?/);
    expect(textos[2]).toMatch(/^UPDATE stores SET name = \?/);
    for (const s of sentencias) {
      expect(s.texto).toContain('WHERE user_id = ?');
      expect(s.valores).toContain(U);
      expect(s.valores).toContainEqual(['Cvs', 'CVS Pharmacy']);
    }
  });
});

describe('sucursales', () => {
  it('crear guarda el nombre como ya existe y un id hecho en la app', async () => {
    respuestas = [
      [{ nombre: 'Publix' }],
      [{ id: SUC, name: 'Publix', address: '12800 Biscayne Blvd', latitude: '25.89', longitude: '-80.16' }],
    ];
    const s = await datos.crearSucursal(U, { nombre: 'publix', direccion: '12800 Biscayne Blvd', lat: 25.89, lng: -80.16 });
    expect(s).toEqual({ id: SUC, nombre: 'Publix', direccion: '12800 Biscayne Blvd', lat: 25.89, lng: -80.16 });
    const insert = sentencias[1];
    expect(insert.texto).toMatch(/^INSERT INTO stores/);
    expect(datos.esUuid(insert.valores[0])).toBe(true);
    expect(insert.valores.slice(1, 6)).toEqual(['Publix', '12800 Biscayne Blvd', 25.89, -80.16, U]);
  });

  it('actualizar y borrar van acotados al usuario', async () => {
    respuestas = [[], []];
    expect(await datos.actualizarSucursal(U, SUC, { direccion: 'x' })).toBeNull();
    expect(await datos.borrarSucursal(U, SUC)).toBe(false);
    for (const s of sentencias) expect(s.texto).toContain('WHERE id = ? AND user_id = ?');
  });
});
