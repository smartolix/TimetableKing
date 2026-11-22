import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': process.env.VITE_API_URL ?? 'http://localhost:8000' },
    // GitHub Codespaces leitet über *.app.github.dev weiter
    allowedHosts: ['.app.github.dev', 'localhost'],
  },
})
