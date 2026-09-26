// Limitador de intentos en memoria, por ventana fija. Suficiente para esta app:
// corre en un único proceso de pm2, así que no hace falta un almacén compartido.
// Al reiniciar el proceso los contadores se ponen a cero.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000

/** Suma un intento a `key` y devuelve false si ya superó `limit` en la ventana. */
export function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) purgeExpired(now)
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count++
  return bucket.count <= limit
}

function purgeExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  // Si aun así está lleno (ataque con muchas claves), se vacía: es preferible
  // perder contadores a crecer sin límite en memoria.
  if (buckets.size >= MAX_KEYS) buckets.clear()
}

/**
 * IP del cliente. nginx (conf.d/juegos.dvillalon.com.conf) fija X-Real-IP a
 * $remote_addr, así que el cliente no puede falsearla mientras la app solo
 * sea accesible a través de nginx.
 */
export function clientIp(headers: Headers): string {
  return headers.get('x-real-ip') ?? 'unknown'
}
