import { describe, expect, it } from 'vitest';
import { destinoDeRef, huella, type GastoComputo } from './mapeo';
import { planificar, planVacio } from './plan';

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
