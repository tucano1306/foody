interface Props {
  readonly error?: string;
  readonly callbackUrl?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Introduce un email valido.',
  auth_failed: 'La autenticacion fallo. Intentalo de nuevo.',
  server_error: 'Error del servidor. Intentalo mas tarde.',
};

export default function LoginCard(props: Readonly<Props>) {
  const { error, callbackUrl } = props;
  return (
    <div className="w-full max-w-md mx-4">
      <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
        <div className="bg-linear-to-br from-brand-500 to-brand-600 p-8 text-center">
          <div className="text-6xl mb-3">🥑</div>
          <h1 className="text-3xl font-bold text-white">Foody</h1>
          <p className="text-brand-100 mt-2 text-sm">Controla tu despensa y pagos mensuales</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {ERROR_MESSAGES[error] ?? 'Error desconocido.'}
            </div>
          )}

          <p className="text-stone-600 text-center mb-6 text-sm">Inicia sesion con tu email</p>

          <form action="/api/auth/login" method="POST" className="flex flex-col gap-3">
            {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
            <input
              type="text"
              name="name"
              placeholder="Tu nombre (opcional)"
              className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-brand-500 focus:outline-none"
            />
            <input
              type="email"
              name="email"
              required
              placeholder="tu@email.com"
              className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              className="mt-2 w-full py-3 px-6 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-all shadow-sm"
            >
              Entrar
            </button>
          </form>

          <p className="text-center text-xs text-stone-400 mt-6">
            Esta app es de uso personal. Tu email identifica tu cuenta.
          </p>
        </div>
      </div>
    </div>
  );
}
