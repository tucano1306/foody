/**
 * categories.ts
 * Single source of truth for grocery category emojis and aisle ordering.
 * Previously duplicated in SupermarketView and ProductsBrowser — keep it here so
 * both views show the same icon and sort order for a given category.
 */

export const CATEGORY_EMOJI: Record<string, string> = {
  'frutas y verduras': '🥦', 'frutas': '🍎', 'verduras': '🥦',
  'lácteos': '🥛', 'lacteos': '🥛',
  'carnicería': '🥩', 'carniceria': '🥩', 'carnes': '🥩',
  'pescadería': '🐟', 'pescaderia': '🐟',
  'panadería y tortillería': '🍞', 'panaderia y tortilleria': '🍞',
  'panadería': '🍞', 'panaderia': '🍞',
  'granos y legumbres': '🌾',
  'cereales y desayunos': '🥣', 'cereales': '🌾',
  'enlatados': '🥫', 'congelados': '🧊',
  'snacks y dulces': '🍬', 'snacks': '🍿',
  'condimentos y salsas': '🧂',
  'bebidas': '🥤', 'limpieza': '🧹',
  'higiene y cuidado': '🧴', 'higiene': '🧴',
  'mascotas': '🐾', 'abarrotes': '🛒', 'otro': '📦',
};

export const CATEGORY_ORDER: Record<string, number> = {
  'frutas y verduras': 1, 'frutas': 2, 'verduras': 3,
  'lácteos': 4, 'lacteos': 4,
  'carnicería': 5, 'carniceria': 5, 'carnes': 6,
  'pescadería': 7, 'pescaderia': 7,
  'panadería y tortillería': 8, 'panaderia y tortilleria': 8,
  'panadería': 9, 'panaderia': 9,
  'granos y legumbres': 10,
  'cereales y desayunos': 11, 'cereales': 12,
  'enlatados': 13, 'congelados': 14,
  'snacks y dulces': 15, 'snacks': 16,
  'condimentos y salsas': 17,
  'bebidas': 18, 'limpieza': 19,
  'higiene y cuidado': 20, 'higiene': 21,
  'mascotas': 22, 'abarrotes': 23, 'otro': 98,
};

/**
 * Cómo se llama el grupo de productos SIN categoría en los desgloses.
 *
 * Vive aquí porque el mismo texto se calcula en SQL (`COALESCE(NULLIF(TRIM(
 * p.category), ''), 'Sin categoría')`) y luego se usa como CLAVE para volver a
 * buscar sus productos: si las dos copias se separan, tocar la fila abre un
 * detalle vacío.
 */
export const UNCATEGORIZED_LABEL = 'Sin categoría';

/** Lista canónica de categorías, para poder recategorizar un producto. */
export const KNOWN_CATEGORIES: readonly string[] = [
  'Frutas y Verduras', 'Lácteos', 'Carnicería', 'Pescadería',
  'Panadería', 'Granos y Legumbres', 'Cereales y Desayunos',
  'Enlatados', 'Congelados', 'Snacks y Dulces', 'Condimentos y Salsas',
  'Bebidas', 'Limpieza', 'Higiene y Cuidado', 'Mascotas', 'Abarrotes', 'Otro',
];

/** Emoji for a category name (case-insensitive); 📦 for null/unknown. */
export function categoryEmoji(category: string | null | undefined): string {
  if (!category) return '📦';
  return CATEGORY_EMOJI[category.toLowerCase()] ?? '📦';
}

/** Aisle sort order for a category name; unknowns sort late (98). */
export function categoryOrder(category: string): number {
  return CATEGORY_ORDER[category.toLowerCase()] ?? 98;
}
