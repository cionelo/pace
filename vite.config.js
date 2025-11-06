import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pace/', // CRITICAL: Must match your GitHub repo name
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
})
