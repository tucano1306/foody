import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Un guardián, no una prueba de comportamiento.
 *
 * La lista del súper se lee en DOS sitios —`api.shoppingList.get` para la
 * página y `GET /api/shopping-list` para el cliente— y la regla de julio ya se
 * escribió dos veces. Si una de las dos deja de sincronizar los faltantes o de
 * ocultar lo apartado, Casa y Súper vuelven a contar distinto según por dónde
 * se cargue la lista. El comportamiento real se comprobó contra la base con
 * una transacción deshecha (ver el PR); esto impide que las dos copias se
 * separen.
 */

const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

const API = leer('lib/api.ts');
const GET_API = API.slice(API.indexOf('  shoppingList: {'), API.indexOf('    skipped: async'));
const RUTA = leer('app/api/shopping-list/route.ts');
const GET_RUTA = RUTA.slice(RUTA.indexOf('export async function GET'), RUTA.indexOf('export async function POST'));
const SYNC = leer('lib/shopping-list-sync.ts');

describe('las dos lecturas de la lista cuentan lo mismo que Casa', () => {
  it.each([
    ['api.shoppingList.get', GET_API],
    ['GET /api/shopping-list', GET_RUTA],
  ])('%s da fila a los faltantes antes de leer', (_, codigo) => {
    expect(codigo).toContain('syncFaltantesToList(');
  });

  it.each([
    ['api.shoppingList.get', GET_API],
    ['GET /api/shopping-list', GET_RUTA],
  ])('%s oculta lo apartado hasta que vence', (_, codigo) => {
    expect(codigo).toContain('sli.skipped_until IS NULL OR sli.skipped_until <= NOW()');
  });

  it('«faltante» es lo mismo que cuenta Casa: empty o half', () => {
    // HomeProductsShell separa «Se acabó» (empty) y «Queda poco» (half).
    const casa = leer('components/home/HomeProductsShell.tsx');
    expect(casa).toContain("p.stockLevel === 'empty'");
    expect(casa).toContain("p.stockLevel === 'half'");
    expect(SYNC).toContain("p.stock_level IN ('empty', 'half')");
  });
});
