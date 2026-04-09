import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    define: {
      // Make sure environment variables are available in production
      __APP_ENV__: JSON.stringify(env.VITE_SUPABASE_URL),
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      // Mobile-specific optimizations
      target: 'es2015',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            zustand: ['zustand'],
          },
        },
      },
    },
    server: {
      port: 3000,
    },
    preview: {
      port: 4173,
    },
  }
})