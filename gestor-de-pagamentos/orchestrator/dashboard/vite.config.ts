import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ['supergateway.pro', 'www.supergateway.pro'],
    proxy: {
      '/api': { target: 'http://api:3500', changeOrigin: true },
    },
  },
})
