import { describe, expect, it } from 'vitest';
import { canonicalWord, collapsePhrases } from './product-lexicon';
import { aliasKey, canonicalName, matchReceiptItem } from './receipt-match';

/**
 * Los productos son los del catálogo real que motivó esto: español de
 * Venezuela (cambur, caraotas, cotufas, tocineta) contra recibos de
 * supermercado de Estados Unidos.
 */
const CATALOGO = [
  { id: 'agua', name: 'Agua' },
  { id: 'aguacate', name: 'Aguacate' },
  { id: 'arroz', name: 'Arroz ' },
  { id: 'atun', name: 'Atun' },
  { id: 'cambur', name: 'Cambur organico' },
  { id: 'caraotas', name: 'Caraotas' },
  { id: 'cebolla-blanca', name: 'Cebolla Blanca' },
  { id: 'comino', name: 'Comino en polvo' },
  { id: 'cotufas', name: 'Cotufas' },
  { id: 'chuleta', name: 'Chuleta' },
  { id: 'huevos', name: 'Huevos  large' },
  { id: 'jugo-naranja', name: 'Jugo de naranja' },
  { id: 'limones', name: 'Limones' },
  { id: 'mantequilla', name: 'Mantequilla' },
  { id: 'aceite-oliva', name: 'Aceite De Oliva' },
  { id: 'papel', name: 'Papel higienico' },
  { id: 'paprika', name: 'Paprika' },
  { id: 'pechuga', name: 'Pechuga de pollo' },
  { id: 'pimienta', name: 'Pimienta negra' },
  { id: 'pimenton-rojo', name: 'Pimentón rojo' },
  { id: 'platano', name: 'Platano Maduro' },
  { id: 'queso-fresco', name: 'Queso Fresco' },
  { id: 'salsa-soya', name: 'Salsa de soya' },
  { id: 'sardinas', name: 'Sardinas' },
  { id: 'shampoo', name: 'Shampoo' },
  { id: 'tocineta', name: 'Tocineta' },
  { id: 'tomates', name: 'Tomates' },
] as const;

function empareja(linea: string): string | null {
  return matchReceiptItem(linea, CATALOGO)?.product.id ?? null;
}

describe('canonicalWord', () => {
  it('lleva el inglés del recibo al español del catálogo', () => {
    expect(canonicalWord('water')).toBe('agua');
    expect(canonicalWord('eggs')).toBe('huevo');
    expect(canonicalWord('bacon')).toBe('tocineta');
    expect(canonicalWord('cheese')).toBe('queso');
  });

  it('entiende las abreviaturas de los tickets', () => {
    expect(canonicalWord('wtr')).toBe('agua');
    expect(canonicalWord('chkn')).toBe('pollo');
    expect(canonicalWord('grnd')).toBe('molida');
  });

  it('resuelve el plural solo cuando el singular está en el diccionario', () => {
    expect(canonicalWord('tomatoes')).toBe('tomate');
    expect(canonicalWord('limones')).toBe('limon');
    // Palabra desconocida acabada en «s»: se devuelve intacta, no mutilada.
    expect(canonicalWord('doritos')).toBe('doritos');
    expect(canonicalWord('arroz')).toBe('arroz');
  });

  it('deja en paz lo que no conoce', () => {
    expect(canonicalWord('zephyrhills')).toBe('zephyrhills');
    expect(canonicalWord('marketside')).toBe('marketside');
  });
});

describe('collapsePhrases', () => {
  it('pega en una sola palabra los conceptos de dos', () => {
    expect(collapsePhrases('toilet paper')).toBe('papelhigienico');
    expect(collapsePhrases('papel higienico')).toBe('papelhigienico');
    expect(collapsePhrases('orange juice')).toBe('jugonaranja');
    expect(collapsePhrases('jugo de naranja')).toBe('jugonaranja');
  });

  it('no se come lo que va alrededor', () => {
    expect(collapsePhrases('great value toilet paper 12 rolls')).toBe(
      'great value papelhigienico 12 rolls',
    );
  });
});

describe('canonicalName', () => {
  it('deja el mismo texto para las dos lenguas', () => {
    expect(canonicalName('WATER')).toBe(canonicalName('Agua'));
    expect(canonicalName('BACON')).toBe(canonicalName('Tocineta'));
  });

  it('el adjetivo que sobra no impide el encuentro', () => {
    // «BLACK BEANS» canoniza a «black frijol» y «Caraotas» a «frijol»: no son
    // la misma cadena, y no hace falta que lo sean. Lo que tienen que compartir
    // es la palabra que nombra el producto — de eso se encarga el emparejador.
    expect(canonicalName('BLACK BEANS')).toContain(canonicalName('Caraotas'));
  });
});

describe('matchReceiptItem con recibos en inglés', () => {
  it('empareja lo que antes se quedaba suelto', () => {
    expect(empareja('WATER')).toBe('agua');
    expect(empareja('EGGS')).toBe('huevos');
    expect(empareja('BACON')).toBe('tocineta');
    expect(empareja('BUTTER')).toBe('mantequilla');
    expect(empareja('AVOCADO')).toBe('aguacate');
    expect(empareja('TUNA')).toBe('atun');
    expect(empareja('SARDINES')).toBe('sardinas');
    expect(empareja('RICE')).toBe('arroz');
    expect(empareja('POPCORN')).toBe('cotufas');
    expect(empareja('TOMATOES')).toBe('tomates');
    expect(empareja('LIMES')).toBe('limones');
    expect(empareja('SHAMPOO')).toBe('shampoo');
  });

  it('aguanta el ruido de marca y formato del ticket', () => {
    expect(empareja('GREAT VALUE PURIFIED WATER 1GL')).toBe('agua');
    expect(empareja('EGGS LARGE 12 CT')).toBe('huevos');
    expect(empareja('TOMATOES ROMA 2 LB')).toBe('tomates');
  });

  it('resuelve los conceptos de dos palabras', () => {
    expect(empareja('TOILET PAPER 12 ROLLS')).toBe('papel');
    expect(empareja('ORANGE JUICE 64 OZ')).toBe('jugo-naranja');
    expect(empareja('OLIVE OIL')).toBe('aceite-oliva');
    expect(empareja('SOY SAUCE')).toBe('salsa-soya');
    expect(empareja('CHICKEN BREAST')).toBe('pechuga');
    expect(empareja('WHITE ONION')).toBe('cebolla-blanca');
    expect(empareja('BLACK PEPPER')).toBe('pimienta');
  });

  it('entiende el español de esta cocina', () => {
    expect(empareja('BLACK BEANS')).toBe('caraotas');
    expect(empareja('ORGANIC BANANAS')).toBe('cambur');
    expect(empareja('PLANTAIN')).toBe('platano');
    expect(empareja('PORK CHOP')).toBe('chuleta');
  });

  it('no confunde cosas que solo se parecen', () => {
    // «Paprika» y «pimentón» son dos productos distintos de esta despensa: la
    // especia y el pimiento. Si el diccionario los uniera, el precio de uno
    // acabaría en el historial del otro.
    expect(empareja('PAPRIKA')).toBe('paprika');
    expect(empareja('RED BELL PEPPER')).toBe('pimenton-rojo');
    // Un producto que no está en el catálogo se queda sin vincular en vez de
    // caer en el más parecido.
    expect(empareja('DOG FOOD 20LB')).toBeNull();
    expect(empareja('MOTOR OIL 5W30')).not.toBe('aceite-oliva');
  });
});

describe('matchReceiptItem con alias aprendidos', () => {
  const alias = new Map([[aliasKey('GV PURIF DRNK WTR 1GL'), 'agua']]);

  it('manda sobre el parecido de las palabras', () => {
    // Sin alias no hay forma de saber que «DRNK» es agua embotellada de marca
    // blanca; con él, el usuario lo enseñó una vez y vale para siempre.
    expect(matchReceiptItem('GV PURIF DRNK WTR 1GL', CATALOGO)?.product.id).toBe('agua');
    expect(matchReceiptItem('GV PURIF DRNK WTR 1GL', CATALOGO, alias)?.product.id).toBe('agua');
    expect(matchReceiptItem('GV PURIF DRNK WTR 1GL', CATALOGO, alias)?.score).toBe(1);
  });

  it('la clave no depende de mayúsculas ni de acentos', () => {
    expect(aliasKey('WATER')).toBe(aliasKey('  water  '));
    expect(aliasKey('Pimentón Rojo')).toBe(aliasKey('PIMENTON ROJO'));
  });

  it('ignora un alias cuyo producto ya no existe', () => {
    const huerfano = new Map([[aliasKey('COSA RARA'), 'producto-borrado']]);
    expect(matchReceiptItem('COSA RARA', CATALOGO, huerfano)).toBeNull();
  });
});
