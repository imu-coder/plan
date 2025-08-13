import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Create separate chunks for large dependencies
          if (id.includes('node_modules')) {
            // Group React-related dependencies
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            
            // Group UI libraries
            if (id.includes('@radix-ui') || id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'vendor-ui';
            }
            
            // Group state management libraries
            if (id.includes('@tanstack') || id.includes('zustand') || id.includes('jotai')) {
              return 'vendor-state';
            }
            
            // Group form handling libraries
            if (id.includes('react-hook-form') || id.includes('@hookform')) {
              return 'vendor-forms';
            }
            
            // Group charting libraries
            if (id.includes('recharts') || id.includes('d3') || id.includes('victory')) {
              return 'vendor-charts';
            }
            
            // Group utility libraries
            if (id.includes('lodash') || id.includes('axios') || id.includes('date-fns')) {
              return 'vendor-utils';
            }
            
            // Group Lucide icons separately
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            
            // Default vendor chunk for other dependencies
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1600, // Increase warning limit to 1000KB
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});