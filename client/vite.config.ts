import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // API REST → Express
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Archivos subidos (PDFs, imágenes de documentos del cliente,
      // contratos firmados, etc.) — los sirve Express con
      // express.static('uploads'). Sin este proxy, Vite devuelve el
      // SPA fallback (index.html) y los archivos se ven "en blanco".
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
