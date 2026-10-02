import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

// Envío de correo con el sendmail del servidor (Postfix de Plesk). El sitio
// solo envía un tipo de correo: el enlace para restablecer la contraseña.
// MAIL_SENDMAIL permite sustituir el binario en pruebas.
const SENDMAIL = process.env.MAIL_SENDMAIL || '/usr/sbin/sendmail'
const FROM_ADDRESS = process.env.MAIL_FROM || 'contacto@dvillalon.com'
const FROM_NAME = 'Juegos Accesibles'

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64')
const encodedWord = (text: string) => `=?UTF-8?B?${b64(text)}?=`

export function sendMail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<void> {
  // El destinatario va como argumento (tras "--") y también en la cabecera To;
  // se rechaza cualquier dirección con espacios o saltos de línea para que no
  // pueda inyectar cabeceras.
  if (/[\s<>]/.test(to)) return Promise.reject(new Error('Dirección de correo no válida'))

  const message = [
    `From: ${encodedWord(FROM_NAME)} <${FROM_ADDRESS}>`,
    `To: <${to}>`,
    `Subject: ${encodedWord(subject)}`,
    // Fecha e identificador propios: si faltan, Postfix los genera con el
    // nombre genérico del servidor, que no es del dominio del remitente.
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${FROM_ADDRESS.split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
    '',
    b64(text).replace(/(.{76})/g, '$1\n'),
    '',
  ].join('\n')

  return new Promise((resolve, reject) => {
    // turbopackIgnore: la ruta del binario es externa al proyecto; sin el
    // comentario, Turbopack avisa de que traza el proyecto entero.
    const child = spawn(/*turbopackIgnore: true*/ SENDMAIL, ['-i', '-f', FROM_ADDRESS, '--', to], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`sendmail terminó con código ${code}: ${stderr.trim()}`))
    })
    child.stdin.end(message)
  })
}
