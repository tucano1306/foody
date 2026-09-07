/**
 * Un importe dentro de una caja estrecha.
 *
 * En la rejilla de tres de Compras cada tarjeta deja poco más de 80px útiles en
 * un móvil, y «$720.73» a 20px no cabe. Eso se venía resolviendo con
 * `break-all`, que parte por donde sea —incluso a mitad de número—: de ahí el
 * «$720.7 / 3» de la pantalla.
 *
 * Un número no se parte y no se recorta: si no cabe, encoge. El tamaño lo
 * calcula `.stat-amount` (globals.css) dividiendo el ancho de la caja entre lo
 * que hay que meter; aquí solo se cuenta cuánto ocupa el texto.
 *
 * La caja de alrededor tiene que ser un contenedor de consulta: `.stat-card` ya
 * lo es, y para el resto está `.stat-box`.
 *
 * El tope se ajusta con `--stat-max` desde el sitio donde se use, para que cada
 * pantalla conserve el tamaño que ya tenía cuando el importe cabe de sobra:
 * `className="[--stat-max:1rem] sm:[--stat-max:1.5rem]"`.
 */

/** Caracteres que ocupan cerca de la mitad que un dígito. */
const ESTRECHOS = new Set(['.', ',', ' ', "'", ':', '!']);

/**
 * Lo que ocupa el texto, medido en dígitos — que es lo que de verdad manda el
 * ancho. Contar `.length` a secas castiga de más a «$1,234.56»: la coma y el
 * punto juntos no llegan a un dígito.
 */
export function anchoEnDigitos(texto: string): number {
  let ancho = 0;
  for (const c of texto) ancho += ESTRECHOS.has(c) ? 0.45 : 1;
  // Por debajo de tres el cálculo se dispara contra el tope y da igual, pero
  // así el número que sale de la cuenta sigue significando algo.
  return Math.max(ancho, 3);
}

type Props = {
  /** El importe ya formateado. De aquí sale la medida. */
  readonly value: string;
  readonly className?: string;
  /** Adorno que va detrás y no cuenta para la medida, p. ej. un asterisco. */
  readonly children?: React.ReactNode;
};

export default function StatAmount({ value, className = '', children }: Props) {
  return (
    <p
      className={`stat-amount ${className}`.trim()}
      style={{ '--stat-chars': anchoEnDigitos(value) } as React.CSSProperties}
    >
      {value}
      {children}
    </p>
  );
}
