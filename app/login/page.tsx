import LoginForm from './LoginForm'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

// El proxy manda aquí con `callbackUrl` como URL completa
// (https://…/perfil), pero `loginUser` solo acepta rutas locales y, al no
// reconocerla, devolvía siempre a la portada. Se queda con la ruta.
function localPath(raw: string | string[] | undefined): string {
  if (typeof raw !== 'string' || !raw) return '/'
  let path = raw
  if (!raw.startsWith('/')) {
    try {
      const url = new URL(raw)
      path = url.pathname + url.search
    } catch {
      return '/'
    }
  }
  return path.startsWith('/') && !path.startsWith('//') ? path : '/'
}

// Componente de servidor: lee los parámetros de la URL aquí y se los pasa al
// formulario, que así va ya en el HTML inicial y funciona sin JavaScript.
// (Antes el formulario usaba useSearchParams y solo se pintaba en el cliente.)
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const callbackUrl = localPath(params.callbackUrl)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <main id="main-content" className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[#ffd700] mb-6">Iniciar sesión</h1>
        <LoginForm
          registered={!!params.registered}
          deleted={!!params.deleted}
          reset={!!params.reset}
          callbackUrl={callbackUrl}
        />
      </main>
    </div>
  )
}
