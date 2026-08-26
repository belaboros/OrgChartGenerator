import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdir, readFile } from 'node:fs/promises'
import { resolve, join, normalize } from 'node:path'

const repoRoot = resolve(__dirname, '..')

/**
 * Dev-only: serves the repository root so the HTTP file adapter can run without a
 * directory picker. This exists to make the seam testable headlessly; the shipped
 * app uses the File System Access adapter. Not part of the production build.
 */
function repoFiles() {
  return {
    name: 'repo-files',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        const url: string = req.url ?? ''
        if (url === '/__repo/list') {
          const names = await readdir(repoRoot)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(names))
          return
        }
        if (url.startsWith('/__repo/file/')) {
          const name = decodeURIComponent(url.slice('/__repo/file/'.length))
          if (normalize(name).includes('..')) { res.statusCode = 400; res.end('bad path'); return }
          try {
            res.setHeader('content-type', 'text/plain; charset=utf-8')
            res.end(await readFile(join(repoRoot, name), 'utf8'))
          } catch {
            res.statusCode = 404
            res.end('not found')
          }
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({ plugins: [react(), repoFiles()] })
