import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Ports live in the repo-root .env so the API and web app stay in sync.
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const apiPort = env.PORT || '7461'
  return {
    plugins: [react(), tailwindcss()],
    // Read VITE_* variables (e.g. VITE_BRYNTUM_LICENSE_KEY) from the same repo-root .env. Only VITE_-prefixed
    // values are exposed to the browser, so server secrets like GOOGLE_API_KEY stay on the server.
    envDir: path.resolve(__dirname, '..'),
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: Number(env.WEB_PORT || 7462),
      strictPort: true,
      proxy: { '/api': { target: env.VITE_API_PROXY || `http://localhost:${apiPort}`, changeOrigin: true } },
    },
    preview: { port: Number(env.WEB_PORT || 7462), strictPort: true },
  }
})
