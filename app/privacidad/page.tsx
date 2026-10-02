import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Qué datos guarda Juegos Accesibles, para qué se usan, cuánto tiempo se conservan y cómo borrarlos.',
  alternates: { canonical: '/privacidad' },
}

const UPDATED = '2 de octubre de 2026'
const CONTACT = 'contacto@dvillalon.com'
const LINK = 'text-[#ffd700] underline hover:text-white'

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl font-bold text-[#ffd700]">Política de privacidad</h1>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">← Lobby</Link>
      </header>

      <main id="main-content" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-8 leading-relaxed">
        <p className="text-sm text-[#999]">Última actualización: {UPDATED}</p>

        <p>
          Puedes jugar a todos los juegos sin registrarte y sin dar ningún dato. La cuenta es opcional y solo
          sirve para guardar tus puntuaciones y aparecer en la tabla de líderes.
        </p>

        <section aria-labelledby="responsable">
          <h2 id="responsable" className="text-lg font-bold mb-2">Quién es el responsable</h2>
          <p>
            Daniel Villalón, autor del sitio. Para cualquier cuestión sobre tus datos escribe a{' '}
            <a href={`mailto:${CONTACT}`} className={LINK}>{CONTACT}</a>.
          </p>
        </section>

        <section aria-labelledby="datos">
          <h2 id="datos" className="text-lg font-bold mb-2">Qué datos se guardan</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Si creas una cuenta:</strong> el nombre que elijas, tu correo electrónico, tu contraseña (cifrada de forma que no se puede leer) y la fecha de registro.</li>
            <li><strong>Si guardas puntuaciones:</strong> el juego, los puntos y la fecha de cada una.</li>
            <li><strong>Al visitar el sitio:</strong> el servidor anota datos técnicos de cada petición (dirección IP, fecha, página solicitada y navegador), como hace cualquier servidor web.</li>
          </ul>
        </section>

        <section aria-labelledby="uso">
          <h2 id="uso" className="text-lg font-bold mb-2">Para qué se usan</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>El correo y la contraseña, para que puedas iniciar sesión. Solo recibirás un correo si pides recuperar tu contraseña.</li>
            <li>El nombre y las puntuaciones, para mostrarlos en tu perfil y en la tabla de líderes, que ven los demás usuarios registrados. Tu correo nunca se muestra a otras personas.</li>
            <li>Los datos técnicos, para la seguridad del sitio: limitar los intentos de acceso y de registro y diagnosticar fallos.</li>
          </ul>
          <p className="mt-3">
            La base legal es la prestación del servicio que pides al crear la cuenta y, para los datos técnicos, el
            interés legítimo en mantener el sitio seguro.
          </p>
        </section>

        <section aria-labelledby="terceros">
          <h2 id="terceros" className="text-lg font-bold mb-2">Con quién se comparten</h2>
          <p>
            Con nadie. El sitio no tiene publicidad, ni analítica, ni carga recursos de otras empresas, y tus
            datos no se venden ni se ceden.
          </p>
          <p className="mt-3">
            Los datos están en un servidor situado en España, alquilado a la empresa de alojamiento IONOS, que
            presta la infraestructura como encargada del tratamiento. Solo el responsable administra el
            servidor y accede a los datos.
          </p>
          <p className="mt-3">
            Cada día se guarda además una copia de seguridad cifrada en un repositorio privado de GitHub
            (GitHub, Inc., Estados Unidos). La copia se cifra en el servidor antes de enviarla y la clave solo
            la tiene el responsable, así que GitHub no puede leer su contenido. Salvo esa copia cifrada, tus
            datos no salen de la Unión Europea.
          </p>
        </section>

        <section aria-labelledby="cookies">
          <h2 id="cookies" className="text-lg font-bold mb-2">Cookies y almacenamiento del navegador</h2>
          <p>
            Solo se usan cookies técnicas, necesarias para iniciar sesión y mantenerla abierta. No hay cookies de
            seguimiento ni de publicidad. Algunos juegos guardan en tu propio navegador datos de la partida, como
            récords o preferencias; no salen de tu dispositivo.
          </p>
        </section>

        <section aria-labelledby="conservacion">
          <h2 id="conservacion" className="text-lg font-bold mb-2">Cuánto tiempo se conservan</h2>
          <p>
            Los datos de tu cuenta se conservan hasta que la elimines. Al eliminarla se borran de inmediato tu
            nombre, tu correo, tu contraseña y todas tus puntuaciones. Pueden permanecer hasta 30 días más en las
            copias de seguridad (la del servidor y la cifrada de GitHub), que se borran solas pasado ese plazo.
          </p>
          <p className="mt-3">
            Los registros técnicos del servidor (dirección IP, fecha y página solicitada) se conservan cinco
            semanas y después se borran.
          </p>
        </section>

        <section aria-labelledby="derechos">
          <h2 id="derechos" className="text-lg font-bold mb-2">Tus derechos</h2>
          <p>
            Puedes ver tus datos, cambiar tu nombre, tu correo y tu contraseña, y eliminar tu cuenta desde{' '}
            <Link href="/perfil" className={LINK}>tu perfil</Link>. Para pedir una
            copia de tus datos o ejercer cualquier otro derecho (acceso, rectificación, supresión, oposición,
            limitación y portabilidad), escribe a <a href={`mailto:${CONTACT}`} className={LINK}>{CONTACT}</a>.
          </p>
          <p className="mt-3">
            Si crees que tus datos no se tratan correctamente, puedes reclamar ante la Agencia Española de
            Protección de Datos (aepd.es).
          </p>
        </section>

        <section aria-labelledby="menores">
          <h2 id="menores" className="text-lg font-bold mb-2">Menores</h2>
          <p>
            Para crear una cuenta debes tener al menos 14 años, y el formulario de registro te pide
            confirmarlo. Si eres menor de esa edad puedes jugar igualmente sin registrarte.
          </p>
        </section>
      </main>
    </div>
  )
}
