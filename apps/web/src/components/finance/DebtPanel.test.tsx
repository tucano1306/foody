import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DebtOverview } from '@/lib/finance-engine';
import DebtPanel from './DebtPanel';

/**
 * «Elimina del Plan financiero la sección Tarjetas y créditos: toda esa
 * información está en Deudas.» Lo que queda del panel es el plan de salida
 * de los pagos ATRASADOS, que no vive en ningún otro sitio.
 */

function overview(over: Partial<DebtOverview> = {}): DebtOverview {
  return {
    overdueTotal: 0,
    overdueCount: 0,
    payoffOrder: [],
    monthlyCatchUp: 0,
    monthsToClear: null,
    goalDebtTotal: 0,
    creditBalance: 19_068.44,
    creditMonthlyInterest: 34.59,
    creditPayments: 4_486.6,
    creditOrder: [
      { id: 'compras', name: 'Compras 3650', balance: 1177.04, installment: 158, monthlyInterest: 23.53, monthsToPayoff: 9, neverPaysOff: false, countedInPayments: false },
      { id: '6791', name: 'Adelanto 0 % 6791', balance: 6052, installment: 550, monthlyInterest: 0, monthsToPayoff: 11, neverPaysOff: false, countedInPayments: false },
    ],
    creditsStuck: [],
    ...over,
  };
}

describe('el Plan ya no repite las tarjetas de Deudas', () => {
  it('con tarjetas y sin atrasos, el panel no pinta nada', () => {
    const { container } = render(<DebtPanel debts={overview()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('con atrasos, solo sale el plan de salida: ni la sección ni sus tarjetas', () => {
    render(
      <DebtPanel
        debts={overview({
          overdueTotal: 300,
          overdueCount: 2,
          payoffOrder: [
            { id: 'luz', name: 'Luz', debt: 100, missedMonths: 1 },
            { id: 'agua', name: 'Agua', debt: 200, missedMonths: 2 },
          ],
          monthlyCatchUp: 150,
          monthsToClear: 2,
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: /Plan de salida de deuda/ })).toBeInTheDocument();
    expect(screen.getByText('Luz')).toBeInTheDocument();
    expect(screen.getByText('Libre de atrasos en 2 meses')).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /Tarjetas y créditos/ })).toBeNull();
    expect(screen.queryByText('Compras 3650')).toBeNull();
    expect(screen.queryByText('Adelanto 0 % 6791')).toBeNull();
    expect(screen.queryByRole('button', { name: /Abonar a la tarjeta|Agregar/ })).toBeNull();
  });
});

/**
 * El 7 nov 2026 el «Borrar» de una tarjeta en el Plan se llevó las tarjetas de
 * Deudas con su historial y hubo que restaurar la base. Que ningún componente
 * del Plan vuelva a poder borrar una deuda.
 */
describe('desde el Plan no se borra ninguna deuda', () => {
  it('ningún componente de components/finance manda un DELETE a /api/debts', () => {
    const dir = __dirname;
    const fuentes = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));
    expect(fuentes.length).toBeGreaterThan(5);
    for (const f of fuentes) {
      const texto = readFileSync(join(dir, f), 'utf8');
      for (const m of texto.matchAll(/fetch\(\s*[`'"]\/api\/debts[^)]*\)?[\s\S]{0,300}?\}\)/g)) {
        expect(m[0], `${f} borra una deuda`).not.toMatch(/method:\s*['"]DELETE['"]/);
      }
    }
  });

  it('ni le pasa a la hoja de una deuda con qué borrar', () => {
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx') && !x.includes('.test.'))) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/<DebtDetailSheet[\s\S]*?onDeleted=/);
    }
  });
});
