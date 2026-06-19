import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
