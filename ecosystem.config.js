/**
 * ecosystem.config.js — Configuración PM2 para Arquitecto Virtual
 *
 * Comandos útiles:
 *   pm2 start ecosystem.config.js       → arrancar todos los procesos
 *   pm2 stop all                        → detener todo
 *   pm2 restart watcher                 → reiniciar solo el watcher
 *   pm2 logs watcher                    → ver logs en tiempo real
 *   pm2 monit                           → monitor visual en terminal
 *   pm2 save                            → guardar lista para auto-arranque
 *   pm2 startup                         → configurar inicio automático con el SO
 */

module.exports = {
    apps: [
        // ─── WATCHER: Procesador de cola de informes ───────────────────────────
        {
            name: 'watcher',
            script: './watcher.js',
            interpreter: 'node',
            cwd: __dirname,

            // Reinicio automático ante crasheo
            autorestart: true,
            watch: false,           // No watchear archivos (el watcher usa chokidar propio)
            max_restarts: 10,       // Máximo 10 reinicios consecutivos antes de detenerse
            restart_delay: 5000,    // Esperar 5s entre reinicios para no spamear

            // Variables de entorno (PM2 las carga desde .env automáticamente con env_file)
            env: {
                NODE_ENV: 'production',
            },
            env_file: './.env',

            // Logs
            out_file: './logs/watcher-out.log',
            error_file: './logs/watcher-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,

            // Memoria: reiniciar si supera 1 GB (el navegador Puppeteer puede crecer)
            max_memory_restart: '1G',
        },

        // ─── NEXT.JS: Servidor web de la aplicación ────────────────────────────
        {
            name: 'nextjs',
            script: 'node_modules/.bin/next',
            args: 'start',          // 'start' usa el build de producción (npm run build primero)
            cwd: __dirname,

            autorestart: true,
            watch: false,
            max_restarts: 10,
            restart_delay: 3000,

            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            env_file: './.env',

            out_file: './logs/nextjs-out.log',
            error_file: './logs/nextjs-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,

            max_memory_restart: '512M',
        },
    ],
};
