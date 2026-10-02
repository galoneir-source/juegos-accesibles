#!/usr/bin/env bash
# Migración única: la app deja de ejecutarse como root.
#
# Antes: código, base de datos y proceso en /root/juegos-accesibles, todo root.
# Después:
#   - código en /opt/juegos-accesibles, propiedad de root (la app solo lo lee);
#   - base de datos en /var/lib/juegos-accesibles/juegos.db, del usuario `juegos`;
#   - el proceso de pm2 corre como `juegos` (uid/gid en ecosystem.config.js).
# Los despliegues siguen igual, como root: cd /opt/juegos-accesibles && git pull
# && npm run deploy.
#
# Uso (como root, con main actualizado):  scripts/migrar-sin-root.sh
# Corte de servicio: unos segundos. Si la app no responde al final, deshace
# todo y deja la instalación anterior en marcha.
#
# Las variables de abajo se pueden cambiar por entorno para ensayar la
# migración con una copia de pruebas.

set -Eeuo pipefail

APP=${APP:-juegos-accesibles}
PORT=${PORT:-5173}
OLD=${OLD:-/root/juegos-accesibles}
NEW=${NEW:-/opt/juegos-accesibles}
DATA=${DATA:-/var/lib/juegos-accesibles}
RUN_USER=${RUN_USER:-juegos}
BACKUP_SCRIPT=${BACKUP_SCRIPT:-/usr/local/bin/backup-juegos-db.sh}
export APP PORT # ecosystem.config.js los lee

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

healthy() {
  for _ in $(seq 30); do
    sleep 1
    curl -sf -o /dev/null "http://127.0.0.1:$PORT/" &&
      curl -sf -o /dev/null "http://127.0.0.1:$PORT/hangman" && return 0
  done
  return 1
}

# --- Comprobaciones previas (nada de esto cambia el sistema) ---
[ "$(id -u)" = 0 ] || die "Hay que ejecutarlo como root."
[ -d "$OLD/.git" ] || [ -f "$OLD/.git" ] || die "$OLD no es el repositorio."
[ ! -e "$NEW" ] || die "$NEW ya existe: ¿la migración ya está hecha?"
[ -L "$OLD/.next" ] || die "$OLD/.next no es un symlink a una build de scripts/deploy.sh."
grep -q 'uid:' "$OLD/ecosystem.config.js" || die "ecosystem.config.js no tiene uid: haz git pull antes."
if [ "$(git -C "$OLD" worktree list | wc -l)" -gt 1 ]; then
  die "Hay worktrees de git abiertos; bórralos antes (git worktree list)."
fi

OLD_URL=$(grep -E '^DATABASE_URL=' "$OLD/.env" | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
OLD_DB=${OLD_URL#file:}
[ -f "$OLD_DB" ] || die "No encuentro la base de datos de DATABASE_URL ($OLD_DB)."
NEW_DB="$DATA/juegos.db"
[ ! -e "$NEW_DB" ] || die "$NEW_DB ya existe."

# --- Usuario sin privilegios y su directorio de datos ---
if ! id "$RUN_USER" >/dev/null 2>&1; then
  log "Creando el usuario $RUN_USER"
  useradd --system --home-dir "$DATA" --create-home --shell /sbin/nologin \
    --comment "juegos.dvillalon.com (app Next.js)" "$RUN_USER"
fi
mkdir -p "$DATA"
chown "$RUN_USER:$RUN_USER" "$DATA"
chmod 700 "$DATA"

if [ -x "$BACKUP_SCRIPT" ]; then
  log "Copia de seguridad previa"
  "$BACKUP_SCRIPT"
fi

SAVED=$(mktemp -d)
cp -p "$OLD/.env" "$SAVED/env"
if [ -f "$BACKUP_SCRIPT" ]; then cp -p "$BACKUP_SCRIPT" "$SAVED/backup-script"; fi

rollback() {
  trap - ERR
  set +e
  log "Deshaciendo la migración"
  pm2 delete "$APP" >/dev/null 2>&1
  if [ -d "$NEW" ] && [ ! -e "$OLD" ]; then mv "$NEW" "$OLD"; fi
  cp -p "$SAVED/env" "$OLD/.env"
  if [ -f "$SAVED/backup-script" ]; then cp -p "$SAVED/backup-script" "$BACKUP_SCRIPT"; fi
  rm -f "$NEW_DB"
  # La app vuelve a arrancar como root, igual que antes de la migración.
  (
    cd "$OLD" || exit 1
    sed -E '/^\s*(uid|gid):/d' ecosystem.config.js > ecosystem.root.config.js
    pm2 start ecosystem.root.config.js >/dev/null
    rm -f ecosystem.root.config.js
  )
  pm2 save >/dev/null
  if healthy; then
    log "Instalación anterior en marcha en $OLD (como root)."
  else
    log "ATENCIÓN: la instalación anterior tampoco responde. Revisa: pm2 logs $APP"
  fi
}

# --- Corte: parar, mover, reconfigurar, arrancar ---
log "Parando $APP"
pm2 stop "$APP" >/dev/null
trap 'rollback; die "Migración fallida; se ha vuelto al estado anterior."' ERR

log "Copiando la base de datos a $NEW_DB"
sqlite3 "$OLD_DB" ".backup '$NEW_DB'"
[ "$(sqlite3 "$NEW_DB" 'PRAGMA integrity_check;')" = "ok" ]
chown "$RUN_USER:$RUN_USER" "$NEW_DB"
chmod 600 "$NEW_DB"

log "Moviendo $OLD a $NEW"
mv "$OLD" "$NEW"

# .env: nueva ruta de la base de datos; solo root y la app pueden leerlo.
sed -i -E "s|^DATABASE_URL=.*|DATABASE_URL=\"file:$NEW_DB\"|" "$NEW/.env"
chown "root:$RUN_USER" "$NEW/.env"
chmod 640 "$NEW/.env"

# SELinux: los ficheros conservan la etiqueta de /root al moverlos.
if command -v restorecon >/dev/null; then restorecon -RF "$NEW" "$DATA" 2>/dev/null || true; fi

if [ -f "$BACKUP_SCRIPT" ]; then sed -i -E "s|^DB=.*|DB=$NEW_DB|" "$BACKUP_SCRIPT"; fi

log "Arrancando $APP como $RUN_USER"
pm2 delete "$APP" >/dev/null
(cd "$NEW" && pm2 start ecosystem.config.js >/dev/null)
healthy
pid=$(pm2 pid "$APP")
[ "$(ps -o user= -p "$pid" | tr -d ' ')" = "$RUN_USER" ]
trap - ERR
pm2 save >/dev/null
rm -rf "$SAVED"

# La base de datos antigua se queda en el repositorio con otro nombre (sigue
# cubierta por *.db en .gitignore), por si hay que volver atrás. Bórrala cuando
# hayas comprobado que todo va bien.
OLD_DB_MOVED="${OLD_DB/#$OLD/$NEW}"
OLD_DB_KEPT="$(dirname "$OLD_DB_MOVED")/antes-de-migrar-$(basename "$OLD_DB_MOVED")"
if [ -f "$OLD_DB_MOVED" ]; then
  mv "$OLD_DB_MOVED" "$OLD_DB_KEPT"
  chmod 600 "$OLD_DB_KEPT"
fi

log "Hecho. La app corre como $RUN_USER desde $NEW."
log "Base de datos: $NEW_DB (la antigua: $OLD_DB_KEPT)"
log "A partir de ahora: cd $NEW && git pull && npm run deploy"
