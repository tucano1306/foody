import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Términos de Uso',
};

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-stone-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-sm border border-stone-100 p-8">
        <Link href="/login" className="text-brand-600 text-sm hover:underline mb-6 inline-block">
          ← Volver
        </Link>

        <h1 className="text-2xl font-bold text-stone-900 mb-2">Términos de Uso</h1>
        <p className="text-sm text-stone-400 mb-8">Última actualización: mayo 2026</p>

        <div className="prose prose-stone max-w-none text-stone-600 text-sm leading-relaxed space-y-6">
          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">1. Descripción del servicio</h2>
            <p>
              Foody es una aplicación de gestión doméstica personal que permite controlar el stock del hogar,
              la lista de la compra, los gastos y los pagos recurrentes. El acceso es por invitación y está
              orientado a uso personal o familiar.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">2. Uso aceptable</h2>
            <p>
              El servicio está destinado exclusivamente a la gestión del hogar. Queda prohibido utilizarlo
              para actividades ilegales, comerciales no autorizadas o cualquier uso que perjudique a otros
              usuarios o al sistema.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">3. Cuentas y acceso</h2>
            <p>
              El acceso se realiza mediante un código de un solo uso (OTP). Eres responsable de mantener
              tu email seguro. No compartas tu código de acceso con terceros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">4. Contenido del usuario</h2>
            <p>
              Los datos que introduces (productos, precios, pagos, fotos) son tuyos. No reclamamos
              propiedad sobre tu contenido. Puedes solicitar la eliminación de tu cuenta y datos en
              cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">5. Disponibilidad</h2>
            <p>
              El servicio se ofrece "tal cual" sin garantías de disponibilidad continua. Podemos
              interrumpirlo o modificarlo en cualquier momento sin previo aviso.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">6. Limitación de responsabilidad</h2>
            <p>
              No somos responsables de pérdidas de datos, interrupciones del servicio ni daños derivados
              del uso de la aplicación. El uso es bajo tu propia responsabilidad.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">7. Cambios en los términos</h2>
            <p>
              Podemos actualizar estos términos en cualquier momento. El uso continuado de la aplicación
              implica la aceptación de los términos vigentes.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-stone-100 text-center">
          <Link href="/legal/privacidad" className="text-brand-600 text-sm hover:underline">
            Ver Política de Privacidad
          </Link>
        </div>
      </div>
    </div>
  );
}
