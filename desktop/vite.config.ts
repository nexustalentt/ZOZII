import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    // Electron renderer dev server. Kept off 5173 so the published website
    // (website/ → 5173) is never confused with the desktop app.
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'chrome130',
  },
  clearScreen: false,
})
