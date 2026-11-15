import { defineConfig } from 'vite';

// base を相対にして、どの階層に置いても資産を解決できるようにする
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 800 }, // three.js だけで約 500 kB
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
