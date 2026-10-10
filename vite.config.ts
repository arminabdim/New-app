import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: false, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
} as any);
