import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      // Proxy backend API calls - enables network access via any IP
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // Proxy Node Red API calls to the production server
      '/FabricWorkflow': {
        target: 'https://c1-aicoe-nodered-lb.prod.c1conversations.io',
        changeOrigin: true,
        secure: true,
      },
      // Proxy Cloud9 API calls (production) to bypass CORS
      // NOTE: Must come BEFORE /cloud9-api to avoid prefix matching issues
      '/cloud9-api-prod': {
        target: 'https://us-ea1-partner.cloud9ortho.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cloud9-api-prod/, ''),
        secure: true,
      },
      // Proxy Cloud9 API calls (sandbox) to bypass CORS
      '/cloud9-api': {
        target: 'https://us-ea1-partnertest.cloud9ortho.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cloud9-api/, ''),
        secure: true,
      },
    },
  },
  optimizeDeps: {
    include: [
      '@reduxjs/toolkit',
      'react-redux',
      'axios',
      'react-router-dom',
      'react-hook-form',
      '@hookform/resolvers/zod',
      'zod',
      'date-fns',
      'clsx',
      'tailwind-merge',
    ],
  },
})
