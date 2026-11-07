import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En développement, /api est servi par le backend (server/, npm run dev:server)
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
