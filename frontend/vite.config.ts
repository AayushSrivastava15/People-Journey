import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: [
      'react',
      'react-dom',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      '@tanstack/react-query',
      'wouter',
      'framer-motion',
      'zod',
    ],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-recharts';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('xlsx') || id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-export';
            if (id.includes('@radix-ui') || id.includes('cmdk') || id.includes('vaul')) return 'vendor-radix';
            if (id.includes('react') || id.includes('wouter')) return 'vendor-core';
          }
        },
      },
    },
  },
});

