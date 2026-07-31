import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const backendTarget = env.VOIDEN_BACKEND_TARGET || 'http://127.0.0.1:8000'
  const websocketTarget = backendTarget.replace(/^http/, 'ws')

  return {
    plugins: [react()],

    server: {
      proxy: {
        "/login": backendTarget,
        "/register": backendTarget,
        "/me": backendTarget,
        "/user": backendTarget,
        "/history": backendTarget,
        "/chat-preferences": backendTarget,
        "/search": backendTarget,
        "/health": backendTarget,
        "/session": backendTarget,
        "/sessions": backendTarget,
        "/api/verify": {
          target: backendTarget,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/ws": {
          target: websocketTarget,
          ws: true,
        },
      }
    }
  }
})
