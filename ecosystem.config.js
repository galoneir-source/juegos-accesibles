module.exports = {
  apps: [
    {
      name: "juegos-accesibles",
      script: "node_modules/.bin/next",
      // Solo localhost: el tráfico entra por nginx, que fija X-Real-IP (lo usa
      // lib/rate-limit.ts); expuesto directamente se podría falsear.
      args: "start -p 5173 -H 127.0.0.1",
      cwd: "/root/juegos-accesibles",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
