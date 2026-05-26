'use strict'

module.exports = {
  apps: [{
    name:    'komplizen-protokolle',
    script:  './server/index.js',
    instances:          1,
    autorestart:        true,
    watch:              false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT:     3000,
      HOST:     '0.0.0.0',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file:      './logs/pm2-error.log',
    out_file:        './logs/pm2-out.log',
    merge_logs:      true,
  }],
}
