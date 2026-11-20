import { describe, expect, it } from 'vitest';
import { destinoDeRef, huella, type GastoComputo } from './mapeo';
import { inicioDeIngresos, planificar, planVacio } from './plan';

const gasto = (ref: string, monto = 10): GastoComputo => ({
  ref,
  fecha: '2026-10-06',
  monto,
  categoria: 'Supermercado',
  descripcion: 'Publix',
  notas: 'Desde Foody · Compras',
  destino: destinoDeRef(ref),
});

const enviado = (g: GastoComputo, vinculado = false) => ({ ref: g.ref, huella: huella(g), vinculado });

describe('planificar — solo la diferencia', () => {
  it('lo nuevo se manda', () => {
    const plan = planificar([gasto('trip:a:grocery')], []);
    expect(plan.upserts.map((g) => g.ref)).toEqual(['trip:a:grocery']);
    expect(plan.borrar).toEqual([]);
  });

  it('lo que ya está igual en Computo no se vuelve a mandar', () => {
    const g = gasto('trip:a:grocery');
    expect(planVacio(planificar([g], [enviado(g)]))).toBe(true);
  });

  it('lo que cambió en Foody se manda otra vez', () => {
    const g = gasto('trip:a:grocery');
    const plan = planificar([gasto('trip:a:grocery', 12.5)], [enviado(g)]);
    expect(plan.upserts.map((x) => x.monto)).toEqual([12.5]);
  });

  it('lo borrado en Foody sale de Computo; lo que solo se enlazó, se desvincula', () => {
    const creado = gasto('trip:a:grocery');
    const enlazado = gasto('payment:p1');
    const plan = planificar([], [enviado(creado), enviado(enlazado, true)]);
    expect(plan.borrar).toEqual([
      { ref: 'trip:a:grocery', modo: 'borrar', destino: 'personal' },
      { ref: 'payment:p1', modo: 'desvincular', destino: 'personal' },
    ]);
  });

  it('lo de negocio sale de la empresa de negocio: el destino va en la ref', () => {
    const negocio = gasto('payment:p1:negocio');
    const plan = planificar([], [enviado(negocio)]);
    expect(plan.borrar).toEqual([{ ref: 'payment:p1:negocio', modo: 'borrar', destino: 'negocio' }]);
  });

  it('un pago que pasa de personal a negocio: sale de una empresa y entra en la otra', () => {
    const antes = gasto('payment:p1');
    const plan = planificar([gasto('payment:p1:negocio')], [enviado(antes)]);
    expect(plan.upserts.map((g) => [g.ref, g.destino])).toEqual([['payment:p1:negocio', 'negocio']]);
    expect(plan.borrar).toEqual([{ ref: 'payment:p1', modo: 'borrar', destino: 'personal' }]);
  });

  it('un ticket reclasificado: sale la ref vieja y entra la nueva', () => {
    const antes = gasto('trip:a:grocery');
    const plan = planificar([gasto('trip:a:dining')], [enviado(antes)]);
    expect(plan.upserts.map((g) => g.ref)).toEqual(['trip:a:dining']);
    expect(plan.borrar).toEqual([{ ref: 'trip:a:grocery', modo: 'borrar', destino: 'personal' }]);
  });

  it('una ref repetida es la misma cosa: se manda una vez', () => {
    const plan = planificar([gasto('trip:a:grocery'), gasto('trip:a:grocery')], []);
    expect(plan.upserts).toHaveLength(1);
  });
});

/**
 * Desde qué día van los ingresos: lo cobrado hasta el día en que el usuario
 * tecleó a mano su último ingreso en Computo ya está allí, aunque sea sumado.
 */
describe('inicioDeIngresos', () => {
  const HOY = '2026-11-19';

  it('el día siguiente al último ingreso tecleado a mano', () => {
    expect(inicioDeIngresos('2026-10-13', '2026-10-25', HOY)).toBe('2026-10-26');
    expect(inicioDeIngresos('2026-10-13', '2026-10-13', HOY)).toBe('2026-10-14');
  });

  it('sin nada tecleado, o tecleado antes, desde el día de los gastos', () => {
    expect(inicioDeIngresos('2026-10-13', null, HOY)).toBe('2026-10-13');
    expect(inicioDeIngresos('2026-10-13', '2026-09-30', HOY)).toBe('2026-10-13');
    expect(inicioDeIngresos('2026-10-13', '2026-10-12', HOY)).toBe('2026-10-13');
  });

  it('cruza meses, años, bisiestos y cambios de hora sin perder ni repetir un día', () => {
    expect(inicioDeIngresos('2026-01-01', '2026-10-31', HOY)).toBe('2026-11-01');
    expect(inicioDeIngresos('2026-01-01', '2026-12-31', '2027-02-01')).toBe('2027-01-01');
    expect(inicioDeIngresos('2028-01-01', '2028-02-28', '2028-12-31')).toBe('2028-02-29');
    expect(inicioDeIngresos('2027-01-01', '2027-02-28', '2027-12-31')).toBe('2027-03-01');
    // Fin y comienzo del horario de verano en Miami.
    expect(inicioDeIngresos('2026-01-01', '2026-11-01', HOY)).toBe('2026-11-02');
    expect(inicioDeIngresos('2026-01-01', '2026-03-08', HOY)).toBe('2026-03-09');
  });

  it('nunca después de hoy: lo tecleado hoy no deja fuera lo que llegue hoy', () => {
    expect(inicioDeIngresos('2026-10-13', HOY, HOY)).toBe(HOY);
    expect(inicioDeIngresos('2026-12-01', null, HOY)).toBe(HOY);
  });
});

describe('planificar — los ingresos, como un gasto más', () => {
  it('nuevos se mandan; borrados se borran o, si solo se enlazaron, se sueltan', () => {
    const ingreso = { ...gasto('income:i1', 500), categoria: 'Otros Ingresos' };
    expect(planificar([ingreso], []).upserts).toEqual([ingreso]);
    expect(planVacio(planificar([ingreso], [enviado(ingreso)]))).toBe(true);
    expect(planificar([], [enviado(ingreso, true)]).borrar).toEqual([{ ref: 'income:i1', modo: 'desvincular', destino: 'personal' }]);
  });
});
