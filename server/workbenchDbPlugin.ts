import fs from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Connect, PreviewServer, ViteDevServer } from 'vite'
import type { Plugin } from 'vite'

export const WORKBENCH_DB_ROUTE = '/api/db/workbench'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function attachWorkbenchDbMiddleware(dbDir: string, filePath: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url?.split('?')[0]
    if (url !== WORKBENCH_DB_ROUTE) {
      next()
      return
    }

    try {
      if (req.method === 'GET') {
        try {
          const raw = await fs.readFile(filePath, 'utf8')
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(raw)
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code === 'ENOENT') {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end('null')
          } else {
            throw error
          }
        }
        return
      }

      if (req.method === 'PUT') {
        const body = await readBody(req)
        const parsed = JSON.parse(body) as { version?: unknown; pages?: unknown }
        if (parsed.version !== 1 || !Array.isArray(parsed.pages)) {
          res.statusCode = 400
          res.end('Invalid workbench payload')
          return
        }
        await fs.mkdir(dbDir, { recursive: true })
        const formatted = JSON.stringify(parsed, null, 2)
        await fs.writeFile(filePath, `${formatted}\n`, 'utf8')
        res.statusCode = 204
        res.end()
        return
      }

      res.statusCode = 405
      res.end()
    } catch {
      res.statusCode = 500
      res.end()
    }
  }
}

function useMiddleware(server: ViteDevServer | PreviewServer, middleware: Connect.NextHandleFunction) {
  server.middlewares.use(middleware)
}

export function workbenchDbPlugin(projectRoot: string): Plugin {
  const dbDir = path.join(projectRoot, 'db')
  const filePath = path.join(dbDir, 'workbench.json')
  const middleware = attachWorkbenchDbMiddleware(dbDir, filePath)

  return {
    name: 'workbench-db',
    configureServer(server) {
      useMiddleware(server, middleware)
    },
    configurePreviewServer(server) {
      useMiddleware(server, middleware)
    },
  }
}
