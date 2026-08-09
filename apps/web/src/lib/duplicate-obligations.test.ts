import { describe, it, expect } from 'vitest';
import {
  findDuplicateObligations,
  namesLookRelated,
  type ObligationDebt,
  type ObligationPayment,
} from './duplicate-obligations';

// El caso real que destapó el bug: la cuota del coche anotada como pago
// mensual («GMC») y como deuda («Auto», emisor GMC). El plan restaba las dos.
const GMC: ObligationPayment = { id: 'p-gmc', name: 'GMC', amount: 1097 };
const AUTO: ObligationDebt = { id: 'd-auto', name: 'Auto', issuer: 'GMC', installment: 1097 };

const OTROS_PAGOS: ObligationPayment[] = [
  { id: 'p-mort', name: 'Mortgage', amount: 917 },
  { id: 'p-hoa', name: 'HOA Bucley tower', amount: 551 },
  { id: 'p-oscar', name: 'Oscar', amount: 18.06 },
];

describe('namesLookRelated', () => {
  it('reconoce el emisor dentro del nombre', () => {
    expect(namesLookRelated('GMC', 'GMC')).toBe(true);
    expect(namesLookRelated('Auto (GMC)', 'GMC')).toBe(true);
    expect(namesLookRelated('gmc financiamiento', 'GMC')).toBe(true);
  });

  it('ignora acentos y puntuación', () => {
    expect(namesLookRelated('Préstamo Auto', 'prestamo auto')).toBe(true);
    expect(namesLookRelated('VISA-6791', 'Visa 6791')).toBe(true);
  });

  it('no empareja cosas distintas', () => {
    expect(namesLookRelated('Oscar', 'Visa travel')).toBe(false);
    expect(namesLookRelated('Mortgage', 'Auto')).toBe(false);
  });

  it('no empareja por palabras cortas de relleno', () => {
    // "de", "la" no pueden emparejar «Seguro de Auto» con «Pago de Luz».
    expect(namesLookRelated('Pago de Luz', 'Seguro de Auto')).toBe(false);
  });

  it('tolera cadenas vacías', () => {
    expect(namesLookRelated('', 'GMC')).toBe(false);
    expect(namesLookRelated('GMC', '   ')).toBe(false);
  });
});

describe('findDuplicateObligations', () => {
  it('encuentra el caso real GMC / Auto', () => {
    const found = findDuplicateObligations([GMC, ...OTROS_PAGOS], [AUTO]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      debtId: 'd-auto',
      paymentId: 'p-gmc',
      amount: 1097,
      reason: 'name',
    });
  });

  it('sospecha aunque los nombres no se parezcan, pero lo marca más flojo', () => {
    const found = findDuplicateObligations(
      [{ id: 'p-x', name: 'Cuota carro', amount: 1097 }],
      [AUTO],
    );
    expect(found[0].reason).toBe('amount');
  });

  it('calla cuando los importes no coinciden', () => {
    const found = findDuplicateObligations(OTROS_PAGOS, [AUTO]);
    expect(found).toEqual([]);
  });

  it('tolera centavos de diferencia entre el recibo y la amortización', () => {
    const found = findDuplicateObligations(
      [{ id: 'p-gmc', name: 'GMC', amount: 1097 }],
      [{ ...AUTO, installment: 1097.4 }],
    );
    expect(found).toHaveLength(1);
  });

  it('pero no confunde importes de verdad distintos', () => {
    const found = findDuplicateObligations(
      [{ id: 'p-gmc', name: 'GMC', amount: 1097 }],
      [{ ...AUTO, installment: 1099 }],
    );
    expect(found).toEqual([]);
  });

  it('calla si el usuario ya lo enlazó', () => {
    const found = findDuplicateObligations([GMC], [{ ...AUTO, linkedPaymentId: 'p-gmc' }]);
    expect(found).toEqual([]);
  });

  it('calla si el usuario ya dijo que son distintos', () => {
    // Sin esto la app volvería a preguntar lo mismo cada vez que abre el plan.
    const found = findDuplicateObligations([GMC], [{ ...AUTO, duplicateDismissed: true }]);
    expect(found).toEqual([]);
  });

  it('el nombre que se parece gana el pago frente a la mera coincidencia de cifra', () => {
    const found = findDuplicateObligations(
      [GMC],
      [
        { id: 'd-otra', name: 'Tarjeta', issuer: 'BOFA', installment: 1097 },
        AUTO,
      ],
    );
    expect(found).toHaveLength(1);
    expect(found[0].debtId).toBe('d-auto');
  });

  it('un pago no puede cubrir dos deudas a la vez', () => {
    const found = findDuplicateObligations(
      [GMC],
      [
        { id: 'd-1', name: 'Auto', issuer: 'GMC', installment: 1097 },
        { id: 'd-2', name: 'Auto 2', issuer: 'GMC', installment: 1097 },
      ],
    );
    expect(found).toHaveLength(1);
  });

  it('dos pagos iguales cubren dos deudas distintas', () => {
    const found = findDuplicateObligations(
      [
        { id: 'p-1', name: 'Auto uno', amount: 500 },
        { id: 'p-2', name: 'Auto dos', amount: 500 },
      ],
      [
        { id: 'd-1', name: 'Auto uno', issuer: null, installment: 500 },
        { id: 'd-2', name: 'Auto dos', issuer: null, installment: 500 },
      ],
    );
    expect(found).toHaveLength(2);
    expect(new Set(found.map((f) => f.paymentId)).size).toBe(2);
  });

  it('ignora importes en cero por los dos lados', () => {
    expect(findDuplicateObligations(
      [{ id: 'p', name: 'X', amount: 0 }],
      [{ id: 'd', name: 'X', issuer: null, installment: 0 }],
    )).toEqual([]);
  });

  it('sin datos no inventa nada', () => {
    expect(findDuplicateObligations([], [])).toEqual([]);
    expect(findDuplicateObligations([GMC], [])).toEqual([]);
    expect(findDuplicateObligations([], [AUTO])).toEqual([]);
  });
});
