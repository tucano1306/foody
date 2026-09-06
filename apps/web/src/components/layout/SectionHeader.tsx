/** Se conserva la firma `tone` porque cuatro pantallas la pasan. Hoy todos los
 *  tonos comparten la misma gama azul, así que lo único que cambia es si la
 *  sección lleva marca de acento o no. */
const ACCENTED: Record<string, boolean> = {
  neutral: false,
  brand: true,
  ok: true,
  warning: true,
  accent: true,
};

export type SectionTone = 'neutral' | 'brand' | 'ok' | 'warning' | 'accent';

/**
 * Separador entre las zonas grandes de una pantalla.
 *
 * Antes era una píldora con degradado y anillo, un emoji dentro de un círculo
 * blanco con su propia sombra, el título en MAYÚSCULAS con tracking abierto y
 * dos reglas degradadas a los lados. Seis elementos decorativos para decir una
 * palabra: eso es cromo compitiendo con el contenido, no jerarquía.
 *
 * Un titular en su tamaño real, alineado a la izquierda como todo lo demás,
 * separa igual de bien y deja el peso visual donde importa. La barrita de
 * acento a la izquierda basta para que el ojo enganche el comienzo de zona al
 * hacer scroll.
 */
export default function SectionHeader({
  emoji,
  title,
  subtitle,
  tone = 'neutral',
}: {
  readonly emoji?: string;
  readonly title: string;
  /** Una línea, solo si aporta un dato que el título no da. Si lo que dice es
   *  «busca aquí» o «esto es una lista», sobra: eso lo dice el control. */
  readonly subtitle?: string;
  /** Se acepta por compatibilidad con las llamadas existentes; ya no cambia la
   *  maquetación, que ahora es siempre a la izquierda. */
  readonly centered?: boolean;
  readonly tone?: SectionTone;
}) {
  return (
    <div className="flex items-start gap-3">
      {ACCENTED[tone] && (
        <span
          aria-hidden="true"
          className="mt-1 w-1 self-stretch min-h-6 rounded-full bg-[var(--accent)] shrink-0"
        />
      )}
      {emoji && (
        <span aria-hidden="true" className="text-xl leading-7 shrink-0">
          {emoji}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-extrabold text-[var(--ink)]">{title}</h2>
        {subtitle && <p className="t-meta mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
