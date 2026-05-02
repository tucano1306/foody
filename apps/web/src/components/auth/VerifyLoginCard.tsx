interface Props {
  readonly email: string;
  readonly callbackUrl?: string;
  readonly error?: string;
  readonly name?: string;
  readonly debugCode?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: 'El codigo no es correcto.',
  code_expired: 'El codigo vencio. Solicita uno nuevo.',
  session_expired: 'La solicitud vencio. Vuelve a iniciar con tu email.',
};

export default function VerifyLoginCard(props: Readonly<Props>) {
  const { email, callbackUrl, error, name, debugCode } = props;

  return (
    <div className="w-full max-w-md mx-4">
      <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
        <div className="bg-linear-to-br from-brand-500 to-brand-600 p-8 text-center text-white">
          <div className="text-6xl mb-3">🔐</div>
          <h1 className="text-3xl font-bold">Verifica tu acceso</h1>
          <p className="text-brand-100 mt-2 text-sm">Introduce el codigo que aparece abajo</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {ERROR_MESSAGES[error] ?? 'No se pudo verificar el codigo.'}
            </div>
          )}

          {debugCode && (
            <div className="mb-4 px-4 py-3 bg-brand-50 border-2 border-brand-300 rounded-xl text-center">
              <p className="text-brand-700 text-xs font-medium mb-1">Tu codigo de acceso</p>
              <p className="text-brand-900 text-3xl font-bold tracking-[0.4em]">{debugCode}</p>
            </div>
          )}

          <form action="/api/auth/verify" method="POST" className="flex flex-col gap-3">
            <input type="hidden" name="email" value={email} />
            {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
            <input
              type="text"
              name="code"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-brand-500 focus:outline-none text-center text-2xl tracking-[0.4em] font-semibold"
            />
            <button
              type="submit"
              className="mt-2 w-full py-3 px-6 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-all shadow-sm"
            >
              Entrar
            </button>
          </form>

          <form action="/api/auth/login" method="POST" className="mt-4">
            <input type="hidden" name="email" value={email} />
            {name && <input type="hidden" name="name" value={name} />}
            {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
            <button
              type="submit"
              className="w-full py-3 px-6 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold transition-all"
            >
              Reenviar codigo
            </button>
          </form>

          <a href="/login" className="block text-center text-sm text-stone-500 hover:text-stone-700 mt-4">
            Cambiar email
          </a>
        </div>
      </div>
    </div>
  );
}