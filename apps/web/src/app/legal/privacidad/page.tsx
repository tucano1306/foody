import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidad',
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-stone-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-sm border border-stone-100 p-8">
        <Link href="/login" className="text-brand-600 text-sm hover:underline mb-6 inline-block">
          ← Volver
        </Link>

        <h1 className="text-2xl font-bold text-stone-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-stone-400 mb-8">Última actualización: mayo 2026</p>

        <div className="prose prose-stone max-w-none text-stone-600 text-sm leading-relaxed space-y-6">
          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">1. Datos que recopilamos</h2>
            <p>Recopilamos únicamente los datos necesarios para el funcionamiento de la app:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Tu dirección de email (para el acceso)</li>
              <li>Tu nombre (opcional, si lo proporcionas)</li>
              <li>Los datos que introduces: productos, precios, pagos, fotos de productos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">2. Cómo usamos tus datos</h2>
            <p>
              Tus datos se usan exclusivamente para ofrecerte las funcionalidades de la app: gestión
              de stock, lista de la compra, estadísticas de gasto y pagos del hogar. No vendemos ni
              compartimos tus datos con terceros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">3. Almacenamiento</h2>
            <p>
              Los datos se almacenan en una base de datos PostgreSQL alojada en Neon (neon.tech).
              Las fotos de productos se almacenan en Amazon S3. Ambos servicios cuentan con cifrado
              en reposo y en tránsito.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">4. Cookies y sesiones</h2>
            <p>
              Usamos una cookie de sesión cifrada (iron-session) para mantenerte autenticado. No
              utilizamos cookies de seguimiento, publicidad ni analíticas de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">5. Tus derechos</h2>
            <p>Tienes derecho a:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Acceder a tus datos personales</li>
              <li>Corregir datos incorrectos</li>
              <li>Solicitar la eliminación de tu cuenta y todos tus datos</li>
            </ul>
            <p className="mt-2">
              Para ejercer estos derechos, contacta con el administrador de la aplicación.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">6. Seguridad</h2>
            <p>
              El acceso a la app se protege con códigos OTP de un solo uso. Las comunicaciones
              se realizan siempre sobre HTTPS. Revisamos y actualizamos las medidas de seguridad
              periódicamente.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-2">7. Cambios en esta política</h2>
            <p>
              Podemos actualizar esta política en cualquier momento. Te notificaremos de cambios
              significativos. El uso continuado implica la aceptación de la política vigente.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-stone-100 text-center">
          <Link href="/legal/terminos" className="text-brand-600 text-sm hover:underline">
            Ver Términos de Uso
          </Link>
        </div>
      </div>
    </div>
  );
}
