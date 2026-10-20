import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Standalone desktop build deliberately has no NoCode platform plugin or external asset base.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'build-desktop' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
