interface Props {
  readonly error?: string;
  readonly callbackUrl?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Introduce un email valido.',
  auth_failed: 'La autenticacion fallo. Intentalo de nuevo.',
  email_delivery_failed: 'No se pudo enviar el codigo. Revisa la configuracion del correo.',
  code_expired: 'El codigo vencio. Solicita uno nuevo.',
  session_expired: 'Tu sesion de acceso vencio. Vuelve a iniciar.',
  server_error: 'Error del servidor. Intentalo mas tarde.',
};

export default function LoginCard(props: Readonly<Props>) {
  const { error, callbackUrl } = props;

  return (
    <div className="w-full max-w-md mx-4">
      <div className="overflow-hidden rounded-3xl border border-stone-100 bg-white shadow-xl">
        <div className="bg-linear-to-br from-brand-500 to-brand-600 p-8 text-center">
          <div className="mb-3 text-6xl">🥑</div>
          <h1 className="text-3xl font-bold text-white">Foody</h1>
          <p className="mt-2 text-sm text-brand-100">Controla tu despensa y tus cuentas del hogar</p>
        </div>

        <div className="p-8">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {ERROR_MESSAGES[error] ?? 'Error desconocido.'}
            </div>
          ) : null}

          <p className="mb-6 text-center text-sm text-stone-600">
            Ingresa tu email y te enviaremos un codigo de acceso.
          </p>

          <form action="/api/auth/login" method="POST" className="flex flex-col gap-3">
            {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
            <input
              type="text"
              name="name"
              placeholder="Tu nombre (opcional)"
              className="w-full rounded-xl border-2 border-stone-200 px-4 py-3 focus:border-brand-500 focus:outline-none"
            />
            <input
              type="email"
              name="email"
              required
              placeholder="tu@email.com"
              className="w-full rounded-xl border-2 border-stone-200 px-4 py-3 focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm transition-all hover:bg-brand-700"
            >
              Continuar
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-stone-400">
            Tu cuenta queda protegida con un codigo temporal enviado por email.
          </p>
        </div>
      </div>
    </div>
  );
}
