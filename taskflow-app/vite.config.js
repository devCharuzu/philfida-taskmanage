import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'local-supabase-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:54321 http://localhost:54321 ws://127.0.0.1:54321 ws://localhost:54321")
    },
  }],
  // LocationPicker is loaded lazily, so pre-bundle its Leaflet dependency at
  // startup instead of discovering it after the first page load.
  optimizeDeps: {
    include: ['leaflet'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    // Mobile-specific optimizations
    target: 'es2015',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
            if (id.includes('react-router')) {
              return 'router';
            }
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            if (id.includes('zustand')) {
              return 'zustand';
            }
          }
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
})
