module.exports = {
  apps: [
    {
      name: 'free-ai-api-control',
      script: './server.js',
      instances: 1, // 单实例模式，因为使用了文件系统存储
      exec_mode: 'fork',

      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      // 自动重启配置
      watch: false, // 生产环境不建议开启
      ignore_watch: ['node_modules', 'data.json', 'logs'],
      max_memory_restart: '500M',

      // 日志配置
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // 自动重启策略
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,

      // 其他配置
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true
    }
  ]
};
