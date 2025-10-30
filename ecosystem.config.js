module.exports = {
  apps: [
    {
      name: 'obra-erp-api',
      cwd: './api',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'obra-erp-ui',
      cwd: './obra-erp-ui',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        HOST: '0.0.0.0',
        PORT: '5173',
      },
    },
  ],
};
