'use client';

import { useState } from 'react';
import { parseMoney } from '@/lib/money-input';

interface Props {
  /** El importe ya interpretado. 0 = vacío. */
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly id?: string;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
  readonly 'aria-label'?: string;
}

/**
 * Campo de importe que deja escribir decimales.
 *
 * El fallo que arregla: los formularios ataban el `value` del input al NÚMERO
 * del formulario y lo reinterpretaban en cada tecla.
 *
 *     value={form.amount === 0 ? '' : form.amount}
 *     onChange={(e) => setForm({ ...f, amount: parseMoney(e.target.value) ?? 0 })}
 *
 * Al teclear el separador, «87.» se interpreta como 87 —correcto, todavía no
 * hay decimales— y el campo se repinta como «87», BORRANDO el punto recién
 * escrito. El decimal no es que se guardara mal: es que era imposible de
 * teclear, porque el separador desaparecía en el mismo instante.
 *
 * La regla que lo evita: lo que se muestra es lo TECLEADO, y el número es una
 * lectura de eso. Nunca al revés. Mientras se escribe, el texto manda.
 *
 * Sigue aceptando coma o punto («87,50» y «87.50» son lo mismo) y separadores
 * de millares, porque quien interpreta es `parseMoney` y ahí no se toca nada.
 */
export default function MoneyInput({ value, onChange, className, ...rest }: Props) {
  const [text, setText] = useState(() => (value === 0 ? '' : String(value)));
  /**
   * El último número que salió de aquí.
   *
   * Sirve para distinguir «el padre refleja lo que acabo de escribir» de «el
   * padre puso otro importe por su cuenta» (se abrió otro pago, se reinició el
   * formulario). Solo en el segundo caso se pisa lo tecleado: hacerlo en el
   * primero devolvería el bug, porque «87.» vuelve como 87.
   */
  const [emitted, setEmitted] = useState(value);

  // Sincronización en render, que es lo que recomienda React para ajustar
  // estado ante un prop nuevo: con `useEffect` el campo parpadearía un frame
  // con el valor viejo.
  if (value !== emitted) {
    setEmitted(value);
    setText(value === 0 ? '' : String(value));
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const next = parseMoney(raw) ?? 0;
        setEmitted(next);
        onChange(next);
      }}
      className={className}
    />
  );
}
