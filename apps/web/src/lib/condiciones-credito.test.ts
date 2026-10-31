import { describe, expect, it } from 'vitest';
import {
  PLANTILLAS,
  aplicarPlantilla,
  camposDelMinimo,
  condicionesDeLaCuenta,
  condicionesPorDefecto,
  costoDelAtraso,
  interesDiferido,
  leerCondiciones,
  minimoDeLosCampos,
  minimoSegunCondiciones,
  plantillaQueCoincide,
  type CondicionesDeCredito,
  type TramoParaCondiciones,
} from './condiciones-credito';
import { estimateCardMinimum } from './card-payment';

const tramo = (over: Partial<TramoParaCondiciones> = {}): TramoParaCondiciones => ({
  issuer: null,
  currency: 'USD',
  minPercent: null,
  minFloor: null,
  minIncludesInterest: false,
  ...over,
});

const BOFA: CondicionesDeCredito = {
  plantilla: 'bofa',
  minimo: PLANTILLAS.bofa.minimo,
  abono: 'ley_eeuu',
  atraso: { cargo: null, tasaPenal: null },
};

describe('condicionesPorDefecto', () => {
  it('Bank of America con tramos: la plantilla comprobada', () => {
    const c = condicionesPorDefecto([tramo({ issuer: 'Bank of America' }), tramo({ issuer: 'Bank of America' })]);
    expect(c.plantilla).toBe('bofa');
    expect(c.minimo).toEqual({ regla: 'suma', porcentaje: 1, piso: 35, fijo: null });
    expect(c.abono).toBe('ley_eeuu');
  });

  it('otro banco en dólares: la de EE. UU.; en otra moneda, «un % del saldo»', () => {
    expect(condicionesPorDefecto([tramo({ issuer: 'Chase' }), tramo()]).plantilla).toBe('eeuu');
    expect(condicionesPorDefecto([tramo({ currency: 'MXN' }), tramo({ currency: 'MXN' })]).plantilla).toBe('porcentaje');
  });

  it('una tarjeta suelta lee el mínimo de sus campos de siempre', () => {
    const c = condicionesPorDefecto([tramo({ minPercent: 3, minFloor: 25 })]);
    expect(c.minimo).toEqual({ regla: 'mayor', porcentaje: 3, piso: 25, fijo: null });
    expect(c.plantilla).toBe('propia');
  });

  it('una suelta con las cifras de Bank of America sale como su banco: mismas cifras, otro nombre', () => {
    const campos = { minPercent: 1, minFloor: 35, minIncludesInterest: true };
    expect(condicionesPorDefecto([tramo({ ...campos, issuer: 'BofA' })]).plantilla).toBe('bofa');
    expect(condicionesPorDefecto([tramo(campos)]).plantilla).toBe('eeuu');
  });

  it('una suelta sin campos usa la plantilla', () => {
    expect(condicionesPorDefecto([tramo({ issuer: 'Bank of America' })]).minimo).toEqual(PLANTILLAS.bofa.minimo);
  });
});

describe('los campos de una deuda suelta', () => {
  it('una cuota fija se guarda como 0 % con piso, y vuelve como cuota fija', () => {
    const campos = camposDelMinimo({ regla: 'fijo', porcentaje: 0, piso: 0, fijo: 120 });
    expect(campos).toEqual({ minPercent: 0, minFloor: 120, minIncludesInterest: false });
    expect(minimoDeLosCampos(campos)).toEqual({ regla: 'fijo', porcentaje: 0, piso: 0, fijo: 120 });
  });

  it('ida y vuelta sin pérdida para «suma» y «mayor»', () => {
    for (const m of [PLANTILLAS.bofa.minimo, { regla: 'mayor' as const, porcentaje: 4, piso: 20, fijo: null }]) {
      expect(minimoDeLosCampos(camposDelMinimo(m))).toEqual(m);
    }
  });

  it('nunca tocados: no hay regla que leer', () => {
    expect(minimoDeLosCampos({ minPercent: null, minFloor: null, minIncludesInterest: false })).toBeNull();
  });

  it('con condiciones guardadas, en una suelta mandan sus campos: «Editar datos» no se contradice', () => {
    const guardadas = { ...BOFA, atraso: { cargo: 40, tasaPenal: 29.99 } };
    const c = condicionesDeLaCuenta([tramo({ minPercent: 2, minFloor: 30 })], guardadas);
    expect(c.minimo).toEqual({ regla: 'mayor', porcentaje: 2, piso: 30, fijo: null });
    expect(c.plantilla).toBe('propia');
    expect(c.atraso).toEqual({ cargo: 40, tasaPenal: 29.99 });
  });

  it('en una tarjeta con tramos mandan las guardadas', () => {
    const guardadas = { ...BOFA, minimo: { regla: 'mayor' as const, porcentaje: 3, piso: 0, fijo: null }, plantilla: 'propia' as const };
    expect(condicionesDeLaCuenta([tramo({ minPercent: 9 }), tramo()], guardadas)).toEqual(guardadas);
  });
});

describe('plantillas', () => {
  it('cambiar de plantilla conserva lo que la plantilla no fija', () => {
    const actual = { ...BOFA, abono: 'proporcional' as const, atraso: { cargo: 40, tasaPenal: null } };
    const c = aplicarPlantilla(actual, 'porcentaje');
    expect(c.minimo).toEqual(PLANTILLAS.porcentaje.minimo);
    expect(c.abono).toBe('proporcional');
    expect(c.atraso).toEqual({ cargo: 40, tasaPenal: null });
  });

  it('las de EE. UU. sí fijan el reparto: lo dicta la ley', () => {
    expect(aplicarPlantilla({ ...BOFA, abono: 'cara_primero' }, 'eeuu').abono).toBe('ley_eeuu');
  });

  it('volver a «cuota fija» no borra la cuota tecleada', () => {
    const actual = { ...BOFA, minimo: { regla: 'fijo' as const, porcentaje: 0, piso: 0, fijo: 90 } };
    expect(aplicarPlantilla(actual, 'fijo').minimo.fijo).toBe(90);
  });

  it('cifras tocadas a mano ya no son de ninguna plantilla', () => {
    expect(plantillaQueCoincide({ minimo: { regla: 'suma', porcentaje: 2, piso: 35, fijo: null }, abono: 'ley_eeuu' })).toBeNull();
  });
});

describe('minimoSegunCondiciones', () => {
  // La 3650 en septiembre: $13,280.02 de capital y $23.24 de interés.
  const tresSesenta = [{ principal: 13280.02, interest: 23.24, fees: 0 }];

  it('con Bank of America da lo mismo que la fórmula comprobada: $156', () => {
    expect(minimoSegunCondiciones(BOFA, tresSesenta)).toBe(156);
    expect(minimoSegunCondiciones(BOFA, tresSesenta)).toBe(estimateCardMinimum(tresSesenta));
  });

  it('«el mayor»: el 5 % de $1,000 son $50, por encima del piso de $25', () => {
    const c = { ...BOFA, minimo: { regla: 'mayor' as const, porcentaje: 5, piso: 25, fijo: null } };
    expect(minimoSegunCondiciones(c, [{ principal: 1000, interest: 0, fees: 0 }])).toBe(50);
    expect(minimoSegunCondiciones(c, [{ principal: 300, interest: 0, fees: 0 }])).toBe(25);
  });

  it('«el mayor» nunca pide menos que lo que cobran este mes', () => {
    const c = { ...BOFA, minimo: { regla: 'mayor' as const, porcentaje: 1, piso: 0, fijo: null } };
    expect(minimoSegunCondiciones(c, [{ principal: 1000, interest: 20, fees: 5 }])).toBe(25);
  });

  it('cuota fija: la cuota, salvo que se deba menos', () => {
    const c = { ...BOFA, minimo: { regla: 'fijo' as const, porcentaje: 0, piso: 0, fijo: 120 } };
    expect(minimoSegunCondiciones(c, [{ principal: 5000, interest: 40, fees: 0 }])).toBe(120);
    expect(minimoSegunCondiciones(c, [{ principal: 80, interest: 1.5, fees: 0 }])).toBe(81.5);
  });

  it('sin saldo, no hay mínimo', () => {
    expect(minimoSegunCondiciones(BOFA, [{ principal: 0, interest: 0, fees: 0 }])).toBe(0);
    expect(minimoSegunCondiciones(BOFA, [])).toBe(0);
  });
});

describe('interesDiferido', () => {
  it('la cifra del estado manda', () => {
    expect(interesDiferido({ saldo: 900, apr: 29.99, desde: '2026-01-01', hasta: '2026-12-31', delEstado: 187.4 })).toEqual({
      monto: 187.4,
      estimado: false,
    });
  });

  it('sin ella, ~ saldo × APR / 365 × días de la promoción', () => {
    // 1,000 × 26.99 % / 365 × 365 días = 269.90
    expect(interesDiferido({ saldo: 1000, apr: 26.99, desde: '2026-01-01', hasta: '2026-12-31', delEstado: null })).toEqual({
      monto: 269.9,
      estimado: true,
    });
  });

  it('fechas al revés o saldo negativo no dan un interés negativo', () => {
    expect(interesDiferido({ saldo: -5, apr: 20, desde: '2026-12-31', hasta: '2026-01-01', delEstado: null }).monto).toBe(0);
  });
});

describe('costoDelAtraso', () => {
  it('sin cifras apuntadas no se dice nada', () => {
    expect(costoDelAtraso(BOFA, [{ balance: 1000, apr: 20 }])).toBeNull();
  });

  it('el extra al mes es la diferencia con la tasa de castigo, tramo a tramo', () => {
    const c = { ...BOFA, atraso: { cargo: 40, tasaPenal: 29.99 } };
    // Compras al 23.74 %: 1,200 × 6.25 % / 12 = 6.25; un 0 % de 6,000: 6,000 × 29.99 % / 12 = 149.95
    expect(costoDelAtraso(c, [{ balance: 1200, apr: 23.74 }, { balance: 6000, apr: 0 }])).toEqual({
      cargo: 40,
      tasaPenal: 29.99,
      interesExtraAlMes: 156.2,
    });
  });

  it('solo el cargo: sin tasa no hay extra que calcular', () => {
    const c = { ...BOFA, atraso: { cargo: 29, tasaPenal: null } };
    expect(costoDelAtraso(c, [{ balance: 1000, apr: 20 }])?.interesExtraAlMes).toBeNull();
  });
});

describe('leerCondiciones', () => {
  const valido = {
    plantilla: 'bofa',
    minimo: { regla: 'suma', porcentaje: 1, piso: 35 },
    abono: 'ley_eeuu',
    atraso: { cargo: 41, tasaPenal: 29.99 },
    promos: [{ debtId: '0b7d3c9e-1f2a-4c5b-8d6e-7f8091a2b3c4', tipo: 'diferido', interesDiferido: 120.5 }],
  };

  it('acepta lo que manda el formulario', () => {
    const r = leerCondiciones(valido);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.condiciones).toEqual({
      plantilla: 'bofa',
      minimo: { regla: 'suma', porcentaje: 1, piso: 35, fijo: null },
      abono: 'ley_eeuu',
      atraso: { cargo: 41, tasaPenal: 29.99 },
    });
    expect(r.promos).toEqual([{ debtId: valido.promos[0].debtId, tipo: 'diferido', interesDiferido: 120.5 }]);
  });

  it('«otro banco de EE. UU.» con las cifras de Bank of America sigue siendo «otro banco»', () => {
    const r = leerCondiciones({ ...valido, plantilla: 'eeuu' });
    expect('error' in r ? null : r.condiciones.plantilla).toBe('eeuu');
  });

  it('la plantilla solo informa: con cifras tocadas pasa a «propia»', () => {
    const r = leerCondiciones({ ...valido, minimo: { regla: 'suma', porcentaje: 2, piso: 35 } });
    expect('error' in r ? null : r.condiciones.plantilla).toBe('propia');
  });

  it('el atraso vacío es «no lo sé», no cero', () => {
    const r = leerCondiciones({ ...valido, atraso: { cargo: '', tasaPenal: null } });
    expect('error' in r ? null : r.condiciones.atraso).toEqual({ cargo: null, tasaPenal: null });
  });

  it('una cuota fija sin cuota no vale', () => {
    expect(leerCondiciones({ ...valido, minimo: { regla: 'fijo' } })).toEqual({ error: 'Escribe la cuota fija que te cobran' });
  });

  it('cifras fuera de rango', () => {
    expect('error' in leerCondiciones({ ...valido, minimo: { regla: 'suma', porcentaje: 120, piso: 35 } })).toBe(true);
    expect('error' in leerCondiciones({ ...valido, minimo: { regla: 'suma', porcentaje: 1, piso: -1 } })).toBe(true);
    expect('error' in leerCondiciones({ ...valido, atraso: { cargo: -5 } })).toBe(true);
    expect('error' in leerCondiciones({ ...valido, atraso: { tasaPenal: 150 } })).toBe(true);
    expect('error' in leerCondiciones({ ...valido, minimo: { regla: 'suma', porcentaje: '1', piso: 35 } })).toBe(true);
  });

  it('«el mayor» con 0 % y sin piso no es una regla', () => {
    expect('error' in leerCondiciones({ ...valido, minimo: { regla: 'mayor', porcentaje: 0, piso: 0 } })).toBe(true);
  });

  it('reglas desconocidas, cuerpos rotos, ids que no son de una deuda', () => {
    expect('error' in leerCondiciones({ ...valido, abono: 'al_azar' })).toBe(true);
    expect('error' in leerCondiciones({ ...valido, minimo: { regla: 'otra' } })).toBe(true);
    expect('error' in leerCondiciones(null)).toBe(true);
    expect('error' in leerCondiciones({ ...valido, promos: [{ debtId: "x'; DROP TABLE debts;--", tipo: 'cero' }] })).toBe(true);
  });

  it('un 0 % de cero no guarda interés diferido aunque llegue', () => {
    const r = leerCondiciones({ ...valido, promos: [{ ...valido.promos[0], tipo: 'cero' }] });
    expect('error' in r ? null : r.promos[0]).toEqual({ debtId: valido.promos[0].debtId, tipo: 'cero', interesDiferido: null });
  });

  it('no acepta más de 12 promociones', () => {
    const promos = Array.from({ length: 20 }, () => valido.promos[0]);
    const r = leerCondiciones({ ...valido, promos });
    expect('error' in r ? null : r.promos.length).toBe(12);
  });
});
