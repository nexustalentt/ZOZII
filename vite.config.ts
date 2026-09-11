import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const supabaseUrl =
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''

  const supabaseAnonKey =
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''

  const adminUsername =
    env.VITE_ADMIN_USERNAME ||
    env.ADMIN_USERNAME ||
    process.env.VITE_ADMIN_USERNAME ||
    process.env.ADMIN_USERNAME ||
    'admin'

  const adminPassword =
    env.VITE_ADMIN_PASSWORD ||
    env.ADMIN_PASSWORD ||
    process.env.VITE_ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    'admin'

  const adminKey =
    env.VITE_ADMIN_KEY ||
    env.ADMIN_KEY ||
    process.env.VITE_ADMIN_KEY ||
    process.env.ADMIN_KEY ||
    ''

  return {
    base: '/',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_ADMIN_USERNAME': JSON.stringify(adminUsername),
      'import.meta.env.ADMIN_USERNAME': JSON.stringify(adminUsername),
      'import.meta.env.VITE_ADMIN_PASSWORD': JSON.stringify(adminPassword),
      'import.meta.env.ADMIN_PASSWORD': JSON.stringify(adminPassword),
      'import.meta.env.VITE_ADMIN_KEY': JSON.stringify(adminKey),
      'import.meta.env.ADMIN_KEY': JSON.stringify(adminKey),
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      target: 'es2022',
    },
  }
})

