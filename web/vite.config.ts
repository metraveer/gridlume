import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The core embeds web/dist with go:embed, which needs the folder to exist in git.
// Vite empties dist/ on every build, so put the placeholder back afterwards.
function keepDistPlaceholder(): Plugin {
  return {
    name: 'keep-dist-placeholder',
    closeBundle() {
      writeFileSync(fileURLToPath(new URL('./dist/.gitkeep', import.meta.url)), '')
    },
  }
}

export default defineConfig({
  plugins: [react(), keepDistPlaceholder()],
  server: {
    // When opened directly (not through `gridlume dev`), send API calls to the core.
    proxy: { '/api': 'http://127.0.0.1:7420' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
})
