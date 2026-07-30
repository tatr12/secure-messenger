import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      "/login": "http://127.0.0.1:8000",
      "/register": "http://127.0.0.1:8000",
      "/user": "http://127.0.0.1:8000",
      "/history": "http://127.0.0.1:8000",
      "/search": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    }
  }
})
