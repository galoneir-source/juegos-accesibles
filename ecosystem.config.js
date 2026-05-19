module.exports = {
  apps: [
    {
      name: "juegos-accesibles",
      script: "node_modules/.bin/next",
      args: "start -p 5173",
      cwd: "/root/juegos-accesibles",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
