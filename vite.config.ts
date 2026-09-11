import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // The public Zozii website owns port 5173. strictPort makes a conflicting
    // process surface the error loudly instead of silently serving the wrong app.
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
})
