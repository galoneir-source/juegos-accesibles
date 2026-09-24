#!/usr/bin/env bash
# Despliegue sin cortes a medias de juegos.dvillalon.com.
#
# Compila en .builds/<fecha>-<commit> (vía NEXT_DIST_DIR, ver next.config.ts)
# mientras producción sigue sirviendo la build anterior. Si la build sale
# bien, cambia de forma atómica el symlink .next a la nueva y recarga pm2.
# Si la comprobación de salud falla, vuelve sola a la build anterior.
#
# Uso:
#   scripts/deploy.sh             compila HEAD (debe ser origin/main, limpio) y despliega
#   scripts/deploy.sh --force     permite desplegar una rama o un árbol con cambios
#   scripts/deploy.sh --rollback  vuelve a la build anterior sin compilar
#   scripts/deploy.sh --list      muestra las builds guardadas y cuál está activa

set -euo pipefail

APP=${APP:-juegos-accesibles}
PORT=${PORT:-5173}
KEEP=3 # builds que se conservan además de la activa, para poder volver atrás

cd "$(dirname "$0")/.."
BUILDS=.builds

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

current_build() { [ -L .next ] && basename "$(readlink .next)" || true; }

# Cambia .next a la build indicada de forma atómica (rename sobre el symlink).
switch_to() {
  ln -sfn "$BUILDS/$1" .next.tmp
  mv -Tf .next.tmp .next
}

reload_and_check() {
  pm2 reload "$APP" >/dev/null
  local chunk
  for _ in $(seq 30); do
    sleep 1
    if curl -sf -o /dev/null "http://localhost:$PORT/" &&
       curl -sf -o /dev/null "http://localhost:$PORT/hangman"; then
      # La página debe apuntar a chunks que existan en la build activa.
      chunk=$(curl -sf "http://localhost:$PORT/" | grep -o '/_next/static/[^"]*\.js' | head -1)
      [ -n "$chunk" ] && curl -sf -o /dev/null "http://localhost:$PORT$chunk" && return 0
    fi
  done
  return 1
}

case "${1:-}" in
  --list)
    cur=$(current_build)
    for b in $(ls -1 "$BUILDS" 2>/dev/null | sort); do
      [ "$b" = "$cur" ] && echo "* $b (activa)" || echo "  $b"
    done
    exit 0
    ;;
  --rollback)
    cur=$(current_build)
    [ -n "$cur" ] || die ".next no es un symlink; no hay builds gestionadas por este script."
    prev=$(ls -1 "$BUILDS" | sort | grep -B1 -x "$cur" | grep -vx "$cur" || true)
    [ -n "$prev" ] || die "No hay una build anterior a $cur."
    log "Volviendo de $cur a $prev"
    switch_to "$prev"
    reload_and_check || die "La build $prev tampoco responde. Revisa: pm2 logs $APP"
    log "Rollback hecho. Activa: $prev"
    exit 0
    ;;
  --force | "") ;;
  *) die "Opción desconocida: $1 (usa --force, --rollback o --list)" ;;
esac

# --- Comprobaciones previas: producción debe corresponder a main ---
if [ "${1:-}" != "--force" ]; then
  git fetch -q origin main
  [ -z "$(git status --porcelain)" ] || die "Hay cambios sin commitear. Usa --force si es intencionado."
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
    die "HEAD no es origin/main (¿rama sin mergear o main sin pull?). Usa --force si es intencionado."
fi

COMMIT=$(git rev-parse --short HEAD)
ID="$(date +%Y%m%d-%H%M%S)-$COMMIT"
DIR="$BUILDS/$ID"
mkdir -p "$BUILDS"

# --- Build en directorio aparte (producción no se entera) ---
# next build reescribe tsconfig.json y next-env.d.ts con rutas de este distDir;
# se guardan y restauran para no ensuciar el repo (next-env.d.ts está en
# .gitignore y puede no existir).
TMP=$(mktemp -d)
cp tsconfig.json "$TMP/"
[ -f next-env.d.ts ] && cp next-env.d.ts "$TMP/"
restore_ts() {
  cp "$TMP/tsconfig.json" .
  if [ -f "$TMP/next-env.d.ts" ]; then cp "$TMP/next-env.d.ts" .; else rm -f next-env.d.ts; fi
  rm -rf "$TMP"
}
trap restore_ts EXIT
# Durante la build se quitan las entradas ".next/..." del include: .next es un
# symlink a otra build cuyos tipos generados usan rutas relativas a
# .builds/<id> y no resuelven vistos desde .next/types.
sed -i '/"\.next\//d' tsconfig.json

log "Compilando $COMMIT en $DIR"
if ! NEXT_DIST_DIR="$DIR" npx next build; then
  rm -rf "$DIR"
  die "La build ha fallado. Producción no se ha tocado."
fi
git log -1 --format='%H %s' > "$DIR/DEPLOY_COMMIT"

# --- Migración única: la primera vez .next es un directorio real ---
if [ -d .next ] && [ ! -L .next ]; then
  legacy="$(date -r .next +%Y%m%d-%H%M%S)-legacy"
  log "Moviendo la build antigua (.next) a $BUILDS/$legacy"
  mv .next "$BUILDS/$legacy"
  # Turbopack deja en <distDir>/node_modules symlinks relativos a los paquetes
  # externos (Prisma, libSQL); al bajar un nivel hay que añadirles un "../".
  if [ -d "$BUILDS/$legacy/node_modules" ]; then
    find "$BUILDS/$legacy/node_modules" -type l | while read -r l; do
      ln -sfn "../$(readlink "$l")" "$l"
    done
  fi
  ln -sfn "$BUILDS/$legacy" .next
fi

PREV=$(current_build)

# --- Cambio atómico + recarga ---
log "Activando $ID"
switch_to "$ID"
if ! reload_and_check; then
  if [ -n "$PREV" ]; then
    log "La nueva build no responde; volviendo a $PREV"
    switch_to "$PREV"
    rm -rf "$DIR"
    reload_and_check || die "Tampoco responde $PREV. Revisa: pm2 logs $APP"
  fi
  die "Despliegue de $ID fallido. Activa: ${PREV:-ninguna}"
fi
pm2 save >/dev/null

# --- Limpieza: conserva la activa y las $KEEP más recientes ---
ls -1 "$BUILDS" | sort | grep -vx "$ID" | head -n -"$KEEP" | while read -r old; do
  log "Borrando build antigua $old"
  rm -rf "${BUILDS:?}/$old"
done

log "Desplegado $ID ($(cut -c1-80 "$DIR/DEPLOY_COMMIT" | cut -d' ' -f2-))"
