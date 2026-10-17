import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8797',
      '/ws': { target: 'ws://localhost:8797', ws: true },
    },
  },
});
