import { execSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function resolveGitCommit(): string {
  if (process.env.VITE_GIT_COMMIT) return process.env.VITE_GIT_COMMIT
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

/** GitHub Pages serves 404.html for unknown paths; copying index.html lets deep links like /records load the SPA. */
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    closeBundle() {
      const index = resolve('dist', 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve('dist', '404.html'))
    },
  }
}

export default defineConfig({
  plugins: [react(), spaFallback()],
  base: '/Weight-Data-Manager-V2/',
  define: {
    __APP_GIT_COMMIT__: JSON.stringify(resolveGitCommit()),
  },
  server: {
    host: '127.0.0.1',
    port: 43132,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 43133,
    strictPort: true,
  },
})
