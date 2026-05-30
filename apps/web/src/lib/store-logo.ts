const LOGO_MAP: Record<string, string> = {
  walmart: '/logos/walmart.png',
  'wal-mart': '/logos/walmart.png',
  'wal mart': '/logos/walmart.png',
  publix: '/logos/publix.png',
  aldi: '/logos/aldi.png',
};

/**
 * Returns the public path of the logo for a given store name,
 * or null if no logo is registered.
 */
export function getStoreLogo(storeName: string): string | null {
  return LOGO_MAP[storeName.toLowerCase().trim()] ?? null;
}
