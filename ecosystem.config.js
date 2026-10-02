// APP y PORT se pueden cambiar por entorno (igual que en scripts/deploy.sh)
// para levantar una copia de pruebas sin tocar producción.
const APP = process.env.APP || "juegos-accesibles";
const PORT = process.env.PORT || "5173";

module.exports = {
  apps: [
    {
      name: APP,
      script: "node_modules/.bin/next",
      // Solo localhost: el tráfico entra por nginx, que fija X-Real-IP (lo usa
      // lib/rate-limit.ts); expuesto directamente se podría falsear.
      args: `start -p ${PORT} -H 127.0.0.1`,
      cwd: __dirname,
      // El daemon de pm2 corre como root, pero la app no: un fallo de ejecución
      // remota en Next.js no debe dar control del servidor. El usuario `juegos`
      // solo puede leer el código y escribir en /var/lib/juegos-accesibles (la
      // base de datos). Lo crea scripts/migrar-sin-root.sh.
      uid: "juegos",
      gid: "juegos",
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        HOME: "/var/lib/juegos-accesibles",
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
