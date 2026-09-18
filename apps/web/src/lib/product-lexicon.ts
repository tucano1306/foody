/**
 * product-lexicon.ts — pone los nombres de producto en un mismo idioma antes de
 * compararlos.
 *
 * El catálogo está en español («Agua», «Huevos», «Tocineta») y los recibos son
 * de supermercado estadounidense («WATER», «EGGS», «BACON»). El emparejador de
 * recibos compara palabras, así que «water» y «agua» no comparten ni una y la
 * línea se quedaba sin vincular: sin producto no hay `product_purchase`, y sin
 * eso no hay precio ni estadística. Había que meter cada compra a mano.
 *
 * Aquí las dos formas se reducen a la misma palabra canónica —el español, que
 * es como el usuario tiene su despensa— y a partir de ahí el emparejador hace
 * su trabajo de siempre.
 *
 * Dos detalles que vienen de mirar recibos de verdad:
 *
 * - Los tickets abrevian sin piedad («WTR», «CHKN BRST», «GRND BEEF»), así que
 *   las abreviaturas frecuentes entran como una variante más.
 * - Hay conceptos que en español son dos palabras y en inglés otras dos
 *   («papel higiénico» / «toilet paper»). Esos se colapsan a UNA palabra sin
 *   espacios antes de trocear, porque el emparejador trabaja token a token y
 *   media frase suelta no casa con nada.
 *
 * Qué NO se hace aquí: adivinar. Un sinónimo de más vincula un precio al
 * producto equivocado, que es peor que dejar la línea suelta —un dato falso en
 * las estadísticas no se nota hasta que ya ensució la predicción—. Ante la
 * duda, la palabra se queda como está. «Paprika» y «pimentón» son dos cosas
 * distintas en esta cocina y así se quedan.
 *
 * Sin dependencias y determinista, para poder probarlo entero.
 */

/**
 * Conceptos de dos palabras. Se sustituyen ANTES de trocear y el resultado es
 * una sola palabra pegada, que sobrevive a la tokenización. El orden importa:
 * lo más específico primero, o «pimienta negra» se comería el «pimentón rojo».
 */
const FRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:papel\s+higienico|papel\s+de\s+bano|papel\s+sanitario|toilet\s+paper|bath(?:room)?\s+tissue)\b/g, 'papelhigienico'],
  [/\b(?:toallas?\s+de\s+papel|paper\s+towels?)\b/g, 'toallapapel'],
  [/\b(?:papel\s+aluminio|aluminum\s+foil|tin\s+foil)\b/g, 'papelaluminio'],
  [/\b(?:bolsas?\s+de\s+basura|trash\s+bags?|garbage\s+bags?)\b/g, 'bolsabasura'],
  [/\b(?:jugo\s+de\s+naranja|orange\s+juice)\b/g, 'jugonaranja'],
  [/\b(?:aceite\s+de\s+oliva|olive\s+oil)\b/g, 'aceiteoliva'],
  [/\b(?:salsa\s+de\s+soya|soy\s+sauce)\b/g, 'salsasoya'],
  [/\b(?:crema\s+dental|pasta\s+dental|pasta\s+de\s+dientes|tooth\s?paste)\b/g, 'cremadental'],
  [/\b(?:pechuga\s+de\s+pollo|chicken\s+breast|chkn\s+brst)\b/g, 'pechugapollo'],
  [/\b(?:carne\s+molida|ground\s+beef|grnd\s+beef)\b/g, 'carnemolida'],
  [/\b(?:queso\s+crema|cream\s+cheese)\b/g, 'quesocrema'],
  [/\b(?:crema\s+agria|sour\s+cream)\b/g, 'cremaagria'],
  [/\b(?:helado|ice\s+cream)\b/g, 'helado'],
  [/\b(?:papas\s+fritas|french\s+fries)\b/g, 'papasfritas'],
  [/\b(?:pimenton\s+rojo|red\s+(?:bell\s+)?pepper)\b/g, 'pimentonrojo'],
  [/\b(?:pimenton\s+verde|green\s+(?:bell\s+)?pepper)\b/g, 'pimentonverde'],
  [/\b(?:cebolla\s+blanca|white\s+onion)\b/g, 'cebollablanca'],
  [/\b(?:pimienta\s+negra|black\s+pepper)\b/g, 'pimientanegra'],
  [/\b(?:ajo\s+en\s+polvo|garlic\s+powder)\b/g, 'ajopolvo'],
  [/\b(?:cebolla\s+en\s+polvo|onion\s+powder)\b/g, 'cebollapolvo'],
  [/\b(?:agua\s+oxigenada|hydrogen\s+peroxide)\b/g, 'aguaoxigenada'],
];

/**
 * Familias de sinónimos: la clave es la forma canónica (español, sin acentos —
 * los quita `normalizeName` antes de llegar aquí) y la lista son las variantes
 * que significan lo mismo, inglés y abreviaturas de ticket incluidas.
 *
 * Las abreviaturas son siempre de tres letras o más: «tp» por «toilet paper»
 * casaría con cualquier cosa.
 */
const FAMILIAS: Readonly<Record<string, readonly string[]>> = {
  // ── Bebidas ──────────────────────────────────────────────────────────────
  agua: ['water', 'wtr'],
  jugo: ['juice'],
  cafe: ['coffee'],
  refresco: ['soda', 'gaseosa'],
  cerveza: ['beer'],
  hielo: ['ice'],

  // ── Lácteos y huevos ─────────────────────────────────────────────────────
  leche: ['milk', 'mlk'],
  queso: ['cheese', 'chse'],
  mantequilla: ['butter', 'bttr'],
  yogurt: ['yoghurt', 'yogur', 'ygrt'],
  crema: ['cream'],
  huevo: ['huevos', 'egg', 'eggs'],

  // ── Carnicería y pescadería ──────────────────────────────────────────────
  pollo: ['chicken', 'chkn'],
  pechuga: ['breast', 'brst'],
  carne: ['beef', 'meat', 'res'],
  cerdo: ['pork', 'puerco'],
  tocineta: ['bacon', 'tocino', 'bcn'],
  jamon: ['ham'],
  pavo: ['turkey'],
  pescado: ['fish'],
  camaron: ['camarones', 'shrimp'],
  salchicha: ['sausage', 'ssg'],
  chuleta: ['chuletas', 'chop', 'chops'],
  costilla: ['costillas', 'rib', 'ribs'],
  molida: ['molido', 'ground', 'grnd'],
  deshuesado: ['deshuesada', 'boneless', 'bnls', 'bnlss'],
  rebanado: ['rebanada', 'rebanadas', 'sliced'],

  // ── Enlatados y despensa ─────────────────────────────────────────────────
  atun: ['tuna'],
  sardina: ['sardinas', 'sardine', 'sardines'],
  arroz: ['rice'],
  pasta: ['spaghetti', 'espagueti', 'noodles'],
  harina: ['flour'],
  azucar: ['sugar'],
  sal: ['salt'],
  aceite: ['oil'],
  vinagre: ['vinegar'],
  frijol: ['frijoles', 'caraota', 'caraotas', 'habichuela', 'habichuelas', 'bean', 'beans'],
  lenteja: ['lentejas', 'lentil', 'lentils'],
  cereal: [],
  avena: ['oatmeal', 'oats'],
  miel: ['honey'],
  mayonesa: ['mayo', 'mayonnaise'],
  mostaza: ['mustard'],
  ketchup: ['catsup'],
  salsa: ['sauce'],
  soya: ['soy', 'soja'],
  pan: ['bread', 'brd'],
  galleta: ['galletas', 'cookie', 'cookies', 'cracker', 'crackers'],
  cotufa: ['cotufas', 'popcorn', 'palomitas'],
  chocolate: [],

  // ── Especias ─────────────────────────────────────────────────────────────
  pimienta: ['pepper', 'ppr'],
  comino: ['cumin'],
  oregano: [],
  canela: ['cinnamon'],
  ajo: ['garlic'],

  // ── Frutas y verduras ────────────────────────────────────────────────────
  cebolla: ['cebollas', 'onion', 'onions'],
  cebollin: ['cebollines', 'scallion', 'scallions', 'chives'],
  tomate: ['tomates', 'tomato', 'tomatoes', 'tmto'],
  papa: ['papas', 'potato', 'potatoes'],
  zanahoria: ['zanahorias', 'carrot', 'carrots'],
  lechuga: ['lettuce'],
  aguacate: ['avocado', 'avcdo'],
  // En Venezuela son dos frutas distintas y el usuario las compra por separado:
  // «cambur» es la de comer cruda, «plátano» la de freír. Unirlas mandaría el
  // precio de una a la otra.
  cambur: ['cambures', 'banana', 'bananas', 'guineo'],
  platano: ['platanos', 'plantain', 'plantains'],
  limon: ['limones', 'lime', 'limes', 'lemon', 'lemons'],
  naranja: ['naranjas', 'orange', 'oranges'],
  manzana: ['manzanas', 'apple', 'apples'],
  fresa: ['fresas', 'strawberry', 'strawberries'],
  uva: ['uvas', 'grape', 'grapes'],
  pepino: ['pepinos', 'cucumber'],
  brocoli: ['broccoli'],
  espinaca: ['espinacas', 'spinach'],
  maiz: ['corn'],
  calabacin: ['zucchini'],
  cilantro: ['coriander'],
  perejil: ['parsley'],

  // ── Limpieza e higiene ───────────────────────────────────────────────────
  jabon: ['soap'],
  shampoo: ['champu'],
  acondicionador: ['conditioner'],
  desodorante: ['deodorant'],
  detergente: ['detergent'],
  cloro: ['bleach'],
  suavizante: ['softener'],
  esponja: ['esponjas', 'sponge'],
  servilleta: ['servilletas', 'napkin', 'napkins'],
  panal: ['panales', 'diaper', 'diapers'],
  algodon: ['cotton'],
  cepillo: ['brush'],
  basura: ['trash', 'garbage'],
  bolsa: ['bolsas', 'bag', 'bags'],
  insecticida: ['insecticide'],
  vitamina: ['vitaminas', 'vitamin', 'vitamins'],

  // ── Adjetivos que sí distinguen un producto de otro ───────────────────────
  // No son ruido: «pan integral» y «pan de sándwich» son compras distintas, así
  // que se traducen en vez de descartarse.
  organico: ['organica', 'organic'],
  entero: ['entera', 'whole'],
  descremado: ['descremada', 'skim', 'nonfat'],
  congelado: ['congelada', 'frozen', 'frzn'],
  fresco: ['fresca', 'fresh'],
  grande: ['large'],
  pequeno: ['pequena', 'small'],
  mediano: ['mediana', 'medium'],
  dulce: ['sweet'],
};

/** Variante → forma canónica. Se construye una vez al cargar el módulo. */
const CANONICO: ReadonlyMap<string, string> = (() => {
  const mapa = new Map<string, string>();
  for (const [canonico, variantes] of Object.entries(FAMILIAS)) {
    mapa.set(canonico, canonico);
    for (const v of variantes) mapa.set(v, canonico);
  }
  return mapa;
})();

/**
 * La forma canónica de una palabra, o la palabra tal cual si no está en el
 * diccionario.
 *
 * El plural se prueba al final y solo contra el diccionario: quitar la «s» a
 * ciegas convierte «arroz» en algo que no existe y «gas» en «ga». Si el
 * singular tampoco está, se devuelve la palabra original sin tocar.
 */
export function canonicalWord(token: string): string {
  const directo = CANONICO.get(token);
  if (directo !== undefined) return directo;

  if (token.endsWith('es') && token.length > 4) {
    const sinEs = CANONICO.get(token.slice(0, -2));
    if (sinEs !== undefined) return sinEs;
  }
  if (token.endsWith('s') && token.length > 3) {
    const sinS = CANONICO.get(token.slice(0, -1));
    if (sinS !== undefined) return sinS;
  }
  return token;
}

/**
 * Aplica las frases de dos palabras sobre un nombre YA normalizado (minúsculas,
 * sin acentos ni puntuación). Se hace antes de trocear.
 */
export function collapsePhrases(normalized: string): string {
  let salida = normalized;
  for (const [patron, canonico] of FRASES) {
    salida = salida.replace(patron, canonico);
  }
  return salida;
}
