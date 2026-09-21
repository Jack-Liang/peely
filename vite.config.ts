import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base:'./' 让产物在任意子路径下都能部署（GitHub Pages / nginx / 对象存储）
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
