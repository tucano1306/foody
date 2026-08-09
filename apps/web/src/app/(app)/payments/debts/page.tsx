import { permanentRedirect } from 'next/navigation';

/**
 * Deudas y Créditos se mudó a /debts: dejó de ser una subsección de Pagos y
 * pasó a tener su propia entrada en el menú.
 *
 * Esta ruta se queda como redirección permanente porque la vieja URL vive en
 * sitios que no controlamos: pantallas guardadas en la PWA del móvil, un
 * marcador, un enlace compartido. Sin esto darían 404.
 */
export default function LegacyDebtsRedirect() {
  permanentRedirect('/debts');
}
