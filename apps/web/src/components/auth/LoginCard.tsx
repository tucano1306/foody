import Image from 'next/image';
import Link from 'next/link';

interface Props {
  readonly error?: string;
  readonly callbackUrl?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Introduce un email válido.',
  auth_failed: 'La autenticación falló. Inténtalo de nuevo.',
  email_delivery_failed: 'No se pudo enviar el código. Revisa la configuración del correo.',
  code_expired: 'El código venció. Solicita uno nuevo.',
  session_expired: 'Tu sesión de acceso venció. Vuelve a iniciar.',
  server_error: 'Error del servidor. Inténtalo más tarde.',
  too_many_requests: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.',
};

/**
 * Primera pantalla que ve cualquiera. Antes: una cabecera con degradado azul,
 * un aguacate de 60 px, el nombre, un eslogan, una frase que explicaba el
 * formulario, el formulario, otra frase sobre el código temporal y el aviso
 * legal. Siete bloques de texto para pedir un email.
 *
 * Ahora manda el formulario. La explicación de qué va a pasar cabe donde tiene
 * que estar —bajo el campo que la provoca— y todo lo demás se fue. Los campos
 * son de 52 px y el botón, de 56: en un móvil se aciertan sin apuntar.
 */
export default function LoginCard(props: Readonly<Props>) {
  const { error, callbackUrl } = props;

  return (
    <div className="w-full max-w-sm mx-4">
      <div className="flex flex-col items-center text-center mb-8">
        <Image src="/logo-fy.png" alt="" width={64} height={64} className="object-contain" priority />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--ink)]">Foody</h1>
        <p className="mt-1.5 text-[15px] text-[var(--ink-muted)]">
          Tu despensa y tus cuentas, en orden
        </p>
      </div>

      <div className="rounded-[var(--radius-sheet)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
        {error ? (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-brand-200 bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-brand-700"
          >
            {ERROR_MESSAGES[error] ?? 'Error desconocido.'}
          </div>
        ) : null}

        <form action="/api/auth/login" method="POST" className="flex flex-col gap-3">
          {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

          <label className="t-label" htmlFor="login-name">
            Tu nombre
            <span className="font-normal text-[var(--ink-subtle)]"> (opcional)</span>
          </label>
          <input
            id="login-name"
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Como quieres que te llame"
            /* 16 px exactos en los campos: por debajo, Safari en iOS hace zoom
               al enfocar y saca media pantalla de sitio. */
            className="-mt-1 w-full h-[52px] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-brand-500 focus:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-brand-500/25 transition"
          />

          <label className="t-label mt-2" htmlFor="login-email">
            Tu email
          </label>
          <input
            id="login-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="tu@email.com"
            className="-mt-1 w-full h-[52px] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-brand-500 focus:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-brand-500/25 transition"
          />
          <p className="t-meta -mt-1">Te enviamos un código de acceso. Sin contraseñas.</p>

          <button
            type="submit"
            className="btn-primary mt-3 w-full h-14 rounded-2xl text-[15px]"
          >
            Continuar
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-[var(--ink-subtle)]">
        Al continuar aceptas los{' '}
        <Link href="/legal/terminos" className="underline hover:text-[var(--ink-muted)]">
          Términos de Uso
        </Link>{' '}
        y la{' '}
        <Link href="/legal/privacidad" className="underline hover:text-[var(--ink-muted)]">
          Política de Privacidad
        </Link>
        .
      </p>
    </div>
  );
}
