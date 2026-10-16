#!/usr/bin/env node
// Avisa a los buscadores que usan IndexNow (Bing, Yandex, Seznam…; Bing
// alimenta también a DuckDuckGo, Ecosia y Yahoo) de las páginas que han
// cambiado. Lo llama scripts/deploy.sh tras un despliegue correcto.
//
// Cómo sabe qué ha cambiado: lee el sitemap de la build activa, descarga cada
// página y calcula una huella de su contenido visible (texto, metadatos y
// JSON-LD; sin los <script> de Next, que cambian en cada build). Compara con
// las huellas del envío anterior, guardadas en .indexnow-state.json, y envía
// solo las URL nuevas, cambiadas o desaparecidas del sitemap.
//
// La clave es pública por diseño: IndexNow la comprueba leyendo
// https://juegos.dvillalon.com/<clave>.txt, que sale de public/<clave>.txt.
//
// Uso:
//   node scripts/indexnow.mjs           envía lo que ha cambiado
//   node scripts/indexnow.mjs --all     envía todas las URL del sitemap
//   node scripts/indexnow.mjs --dry-run muestra qué enviaría, sin enviar ni guardar

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = 'juegos.dvillalon.com'
const LOCAL = `http://localhost:${process.env.PORT || 5173}`
const ENDPOINT = 'https://api.indexnow.org/indexnow'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATE = join(root, '.indexnow-state.json')
const all = process.argv.includes('--all')
const dryRun = process.argv.includes('--dry-run')

// Un error sale como una línea legible (deploy.sh lo convierte en un aviso).
process.on('uncaughtException', (err) => {
  console.error(`IndexNow: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`)
  process.exit(1)
})

const keyFile = readdirSync(join(root, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f))
if (!keyFile) throw new Error('No hay fichero de clave public/<clave>.txt')
const key = keyFile.slice(0, -4)

function fingerprint(html) {
  const keep = []
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) keep.push(m[1])
  for (const m of html.matchAll(/<(?:meta|link)\b[^>]*>/g)) {
    if (/\b(?:name|property)="|rel="canonical"/.test(m[0])) keep.push(m[0])
  }
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''
  const text = html
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update([title, ...keep, text].join('\n')).digest('hex')
}

async function get(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.text()
}

const sitemap = await get(`${LOCAL}/sitemap.xml`)
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
if (urls.length === 0) throw new Error('El sitemap no tiene URL')

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const next = {}
for (const url of urls) {
  const { pathname } = new URL(url)
  next[url] = fingerprint(await get(LOCAL + pathname))
}

const changed = all ? urls : urls.filter((u) => prev[u] !== next[u])
const removed = all ? [] : Object.keys(prev).filter((u) => !(u in next))
const toSend = [...changed, ...removed]

if (toSend.length === 0) {
  console.log('IndexNow: ninguna página ha cambiado')
  process.exit(0)
}
console.log(`IndexNow: ${changed.length} cambiadas, ${removed.length} quitadas del sitemap`)
if (dryRun) {
  for (const u of toSend) console.log(`  ${u}`)
  process.exit(0)
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  signal: AbortSignal.timeout(30_000),
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${keyFile}`,
    urlList: toSend,
  }),
})
// 200: recibido. 202: recibido, la clave aún se está validando.
if (res.status !== 200 && res.status !== 202) {
  throw new Error(`IndexNow respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
writeFileSync(STATE, JSON.stringify(next, null, 2) + '\n')
console.log(`IndexNow: enviadas ${toSend.length} URL (respuesta ${res.status})`)
