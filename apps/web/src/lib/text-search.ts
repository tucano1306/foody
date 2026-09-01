/**
 * text-search.ts — buscar como busca una persona.
 *
 * Nadie recuerda con qué nombre exacto guardó un producto. Se acuerda de que
 * es «crema dental», no de que lo escribió «Hello Crema Dental Herbal 100ml».
 * Buscar exigiendo que lo tecleado aparezca TAL CUAL, seguido y en el mismo
 * orden, obliga a adivinar el nombre entero — justo lo que no se recuerda.
 *
 * Aquí la búsqueda se parte en palabras y basta con que TODAS aparezcan en
 * algún sitio del producto, en cualquier orden. Así:
 *
 *   «crema dental»   encuentra  «Hello Crema Dental»
 *   «dental crema»   encuentra  lo mismo (el orden no importa)
 *   «crema-dental»   encuentra  lo mismo (los signos no separan de verdad)
 *   «jabon»          encuentra  «Jabón»   (los acentos tampoco)
 *   «cre den»        encuentra  «Crema dental» (sirve teclear a medias)
 *
 * Es más permisivo que lo que había, nunca menos: cualquier búsqueda que antes
 * encontraba algo lo sigue encontrando.
 */

/**
 * Deja el texto en su forma comparable: sin acentos, en minúsculas y con todo
 * lo que no sea letra o número convertido en espacio.
 *
 * Los signos pasan a espacio en vez de desaparecer para que «crema-dental» y
 * «crema dental» se lean igual, pero «lavaplatos» NO se convierta en dos
 * palabras que casen con cualquier cosa.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Trocea lo que se tecleó en palabras ya normalizadas.
 *
 * Se hace UNA vez por búsqueda y no una vez por producto: con una despensa
 * grande, normalizar la misma frase cientos de veces se nota al teclear.
 */
export function searchWords(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(' ') : [];
}

/**
 * ¿Este texto contiene TODAS las palabras buscadas?
 *
 * Sin palabras que buscar la respuesta es que sí: una búsqueda vacía no
 * esconde nada.
 */
export function matchesWords(haystack: string, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const hay = normalizeSearchText(haystack);
  return words.every((w) => hay.includes(w));
}

/** Atajo para cuando solo se compara una vez y no compensa trocear aparte. */
export function matchesQuery(haystack: string, query: string): boolean {
  return matchesWords(haystack, searchWords(query));
}
