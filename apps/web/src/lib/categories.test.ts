import { describe, it, expect } from 'vitest';
import { CATEGORY_EMOJI, KNOWN_CATEGORIES, UNCATEGORIZED_LABEL, categoryEmoji } from './categories';
import { UNITEMIZED_LABEL } from './grocery-insights';

describe('UNCATEGORIZED_LABEL', () => {
  it('coincide EXACTAMENTE con el literal que produce el SQL', () => {
    // Este texto se calcula en SQL —COALESCE(NULLIF(TRIM(p.category),''),
    // 'Sin categoría')— en finance-data.ts, stats y spend-breakdown, y luego se
    // usa como CLAVE para volver a buscar las compras de esa fila. Si alguien
    // cambia la constante sin cambiar las consultas, tocar la fila abre un
    // detalle vacío y nada más falla: por eso se fija aquí.
    expect(UNCATEGORIZED_LABEL).toBe('Sin categoría');
  });

  it('no colisiona con el bucket de tickets sin desglosar', () => {
    // Los dos viajan por el mismo parámetro `?category=`, y el detalle decide
    // qué consulta hacer comparando contra UNITEMIZED_LABEL.
    expect(UNCATEGORIZED_LABEL).not.toBe(UNITEMIZED_LABEL);
  });
});

describe('KNOWN_CATEGORIES', () => {
  it('todas tienen emoji: son los chips de "Mover a"', () => {
    for (const c of KNOWN_CATEGORIES) {
      expect(CATEGORY_EMOJI[c.toLowerCase()], `falta emoji para ${c}`).toBeTruthy();
    }
  });

  it('no repite ninguna', () => {
    expect(new Set(KNOWN_CATEGORIES).size).toBe(KNOWN_CATEGORIES.length);
  });

  it('no ofrece "Sin categoría" como destino', () => {
    // No es una categoría: es la ausencia de una. Ofrecerla como destino
    // guardaría el texto literal en products.category.
    expect(KNOWN_CATEGORIES).not.toContain(UNCATEGORIZED_LABEL);
  });
});

describe('categoryEmoji', () => {
  it('tolera nulos y desconocidos', () => {
    expect(categoryEmoji(null)).toBe('📦');
    expect(categoryEmoji(undefined)).toBe('📦');
    expect(categoryEmoji('Marcianadas')).toBe('📦');
  });

  it('no distingue mayúsculas', () => {
    expect(categoryEmoji('LÁCTEOS')).toBe(categoryEmoji('lácteos'));
  });
});
