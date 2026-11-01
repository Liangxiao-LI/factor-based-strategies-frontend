import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The backend has no CORS, so the page always calls the same-origin /api and
// the dev server forwards it to the backend (nginx does the same on EC2)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  }
})
