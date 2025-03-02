import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Add an alias for pdfjs-dist to ensure proper resolution
      'pdfjs-dist': resolve(__dirname, 'node_modules/pdfjs-dist'),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist']
        }
      }
    }
  },
  server: {
    // Add detailed error logging
    hmr: {
      overlay: true,
    },
    watch: {
      usePolling: true,
    },
    open: true, // Open browser automatically
  }
}); 