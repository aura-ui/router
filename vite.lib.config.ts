import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** Library emit for npm — preserve `src/` layout as ESM modules under `dist/`. */
export default defineConfig({
  // Do not copy demo `public/` assets into the npm package.
  publicDir: false,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
});
