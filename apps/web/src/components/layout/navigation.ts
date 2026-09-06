import type { ElementType } from 'react';
import {
  HomeIcon,
  ShoppingCartIcon,
  CubeIcon,
  ReceiptPercentIcon,
  CreditCardIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  ShareIcon,
  BanknotesIcon,
  FlagIcon,
  ScaleIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolid,
  ShoppingCartIcon as CartSolid,
  CubeIcon as CubeSolid,
  ReceiptPercentIcon as ReceiptSolid,
  CreditCardIcon as CardSolid,
  ChartBarIcon as ChartSolid,
  BuildingOfficeIcon as BuildingSolid,
  ShareIcon as ShareSolid,
  BanknotesIcon as BanknotesSolid,
  FlagIcon as FlagSolid,
  ScaleIcon as ScaleSolid,
} from '@heroicons/react/24/solid';

export interface NavDestination {
  readonly href: string;
  /** Contorno para el estado normal. */
  readonly icon: ElementType;
  /** Relleno para el estado activo: el peso del icono es lo que marca dónde
   *  estás, sin necesidad de una etiqueta que lo diga. */
  readonly iconActive: ElementType;
  readonly label: string;
  /** Etiqueta corta para la barra inferior, donde caben ~9 caracteres. */
  readonly shortLabel?: string;
}

export interface NavSection {
  readonly label: string;
  readonly items: readonly NavDestination[];
}

/**
 * Las once secciones de la app, agrupadas. Es la ÚNICA lista: la barra lateral
 * de escritorio, la barra de pestañas del móvil y la hoja «Más» leen de aquí,
 * así que no puede haber dos menús que se contradigan.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: 'Tu cocina',
    items: [
      { href: '/home', icon: HomeIcon, iconActive: HomeSolid, label: 'Casa' },
      { href: '/supermarket', icon: ShoppingCartIcon, iconActive: CartSolid, label: 'Súper' },
      { href: '/products', icon: CubeIcon, iconActive: CubeSolid, label: 'Productos' },
      { href: '/shopping-trips', icon: ReceiptPercentIcon, iconActive: ReceiptSolid, label: 'Compras' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { href: '/budget', icon: BanknotesIcon, iconActive: BanknotesSolid, label: 'Presupuesto' },
      { href: '/payments', icon: CreditCardIcon, iconActive: CardSolid, label: 'Pagos' },
      // Deudas colgaba de Pagos y solo se llegaba por un botón dentro. Son dos
      // cosas distintas —un recibo se paga y se olvida; una deuda tiene saldo,
      // interés y fecha de salida— y esconder la segunda dentro de la primera
      // la hacía invisible.
      { href: '/debts', icon: ScaleIcon, iconActive: ScaleSolid, label: 'Deudas' },
      { href: '/plan', icon: FlagIcon, iconActive: FlagSolid, label: 'Plan financiero', shortLabel: 'Plan' },
    ],
  },
  {
    label: 'Tu mundo',
    items: [
      { href: '/stats', icon: ChartBarIcon, iconActive: ChartSolid, label: 'Stats' },
      { href: '/household', icon: BuildingOfficeIcon, iconActive: BuildingSolid, label: 'Hogar' },
      { href: '/sharing', icon: ShareIcon, iconActive: ShareSolid, label: 'Compartir' },
    ],
  },
];

/**
 * Los cuatro destinos que van fijos en la barra inferior del móvil.
 *
 * Son las cuatro cosas que se hacen a diario y de pie: mirar la despensa, ir
 * al súper, revisar productos y ver qué toca pagar. El resto vive tras el
 * quinto botón («Más»), agrupado igual que en la barra lateral.
 *
 * Cuatro y no cinco: con la muesca de gestos de un iPhone, cinco columnas
 * dejan cada objetivo por debajo de los 64 px cómodos y las etiquetas empiezan
 * a partirse. El quinto slot es «Más», que no compite por espacio porque no
 * lleva etiqueta larga.
 */
export const PRIMARY_TABS: readonly string[] = ['/home', '/supermarket', '/products', '/payments'];

const ALL_ITEMS: readonly NavDestination[] = NAV_SECTIONS.flatMap((s) => s.items);

export const TAB_ITEMS: readonly NavDestination[] = PRIMARY_TABS.map(
  (href) => ALL_ITEMS.find((i) => i.href === href)!,
);

/** Todo lo que NO está en la barra: es lo que enseña la hoja «Más». */
export const OVERFLOW_SECTIONS: readonly NavSection[] = NAV_SECTIONS.map((section) => ({
  label: section.label,
  items: section.items.filter((i) => !PRIMARY_TABS.includes(i.href)),
})).filter((section) => section.items.length > 0);

/** Una ruta está activa también en sus subpáginas (/products/123). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

/** ¿La ruta actual cae fuera de la barra? Entonces «Más» se pinta activo. */
export function isOverflowActive(pathname: string): boolean {
  return !PRIMARY_TABS.some((href) => isActivePath(pathname, href));
}
