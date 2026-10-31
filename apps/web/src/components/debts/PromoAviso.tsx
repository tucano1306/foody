import type { AvisoPromo } from '@/lib/debt-promo';
import { fmtDateFull, fmtMoney, fmtRate } from './debt-ui';

interface Props {
  readonly aviso: AvisoPromo;
  readonly currency: string;
}

/**
 * El 0 % que se acaba, dicho con dinero: cuánto queda y cuánto costará al mes
 * desde el día siguiente. Una fecha sola («0 % hasta el 25 ene») no asusta a
 * nadie; «~$225 al mes» sí se entiende.
 *
 * Con `span` y no `div`: va dentro de los botones de las tarjetas.
 */
export default function PromoAviso({ aviso, currency }: Props) {
  const tasa = fmtRate(aviso.apr, 'annual_nominal');
  const cuando = aviso.dias === 0 ? 'hoy' : aviso.dias === 1 ? 'mañana' : `en ${aviso.dias} días`;
  if (aviso.diferido) return <AvisoDiferido aviso={aviso} diferido={aviso.diferido} currency={currency} cuando={cuando} />;
  return (
    <span className="flex flex-col gap-0.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left">
      <span className="text-[11px] font-bold text-blue-800">
        {aviso.fase === 'antes'
          ? `⏳ El 0 % se acaba ${cuando} · ${fmtDateFull(aviso.fin)}`
          : `💸 El 0 % terminó el ${fmtDateFull(aviso.fin)}`}
      </span>
      <span className="text-[11px] leading-snug text-blue-900">
        {aviso.fase === 'antes' ? (
          <>
            Si quedan estos <strong>{fmtMoney(aviso.saldo, currency)}</strong>, desde el{' '}
            {fmtDateFull(aviso.cobraDesde)} cobrará <strong>~{fmtMoney(aviso.interesMes, currency)} al mes</strong> ({tasa})
          </>
        ) : (
          <>
            Con <strong>{fmtMoney(aviso.saldo, currency)}</strong> pendientes cobra{' '}
            <strong>~{fmtMoney(aviso.interesMes, currency)} al mes</strong> ({tasa})
          </>
        )}
      </span>
    </span>
  );
}

/**
 * Interés diferido: lo que asusta no es la tasa de después sino el golpe. Si
 * al acabar queda un centavo, el banco cobra todo el interés que fue corriendo
 * desde el primer día. Ámbar y no azul: no es «empezará a costar», es «puede
 * costar cientos de una vez».
 */
function AvisoDiferido({
  aviso,
  diferido,
  currency,
  cuando,
}: {
  readonly aviso: AvisoPromo;
  readonly diferido: { readonly monto: number; readonly estimado: boolean };
  readonly currency: string;
  readonly cuando: string;
}) {
  const golpe = `${diferido.estimado ? '~' : ''}${fmtMoney(diferido.monto, currency)}`;
  return (
    <span className="flex flex-col gap-0.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left">
      <span className="text-[11px] font-bold text-amber-900">
        {aviso.fase === 'antes'
          ? `⏳ El plazo sin intereses acaba ${cuando} · ${fmtDateFull(aviso.fin)}`
          : `💸 El plazo sin intereses terminó el ${fmtDateFull(aviso.fin)}`}
      </span>
      <span className="text-[11px] leading-snug text-amber-950">
        {aviso.fase === 'antes' ? (
          <>
            Interés diferido: si queda un centavo de estos <strong>{fmtMoney(aviso.saldo, currency)}</strong>, te
            cobran <strong>{golpe} de golpe</strong>
          </>
        ) : (
          <>
            El banco suma <strong>{golpe}</strong> de interés diferido y desde ahora cobra{' '}
            <strong>~{fmtMoney(aviso.interesMes, currency)} al mes</strong>
          </>
        )}
      </span>
    </span>
  );
}
