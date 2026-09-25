import fs from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'vite'

const WORKSHOP_ROUTE = '/__model-workshop/layout'
const WORKSHOP_FILE = path.resolve(process.cwd(), '.model-workshop/layout.json')
const MAX_WORKSHOP_BYTES = 2 * 1024 * 1024
const EMPTY_WORKSPACE = {
  format: 'chrono-express-model-workshop/v2',
  contexts: {}
}

async function readWorkshopLayout() {
  try {
    const text = await fs.readFile(WORKSHOP_FILE, 'utf8')
    const parsed = JSON.parse(text)
    if (parsed?.format !== EMPTY_WORKSPACE.format || typeof parsed.contexts !== 'object' || !parsed.contexts) {
      throw new Error(`Expected ${EMPTY_WORKSPACE.format}`)
    }
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return structuredClone(EMPTY_WORKSPACE)
    throw error
  }
}

function sendJSON(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(`${JSON.stringify(payload)}\n`)
}

function modelWorkshopPlugin() {
  return {
    name: 'chrono-model-workshop',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(WORKSHOP_ROUTE, async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            sendJSON(res, 200, await readWorkshopLayout())
          } catch (error) {
            sendJSON(res, 500, { error: `Could not read Model Workshop layout: ${error.message}` })
          }
          return
        }

        if (req.method !== 'POST') {
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }
          next()
          return
        }

        let size = 0
        const chunks = []
        req.on('data', (chunk) => {
          size += chunk.length
          if (size <= MAX_WORKSHOP_BYTES) chunks.push(chunk)
          else req.destroy()
        })
        req.on('error', () => {
          if (!res.headersSent) sendJSON(res, 413, { error: 'Model Workshop layout is too large.' })
        })
        req.on('end', async () => {
          if (size > MAX_WORKSHOP_BYTES) {
            if (!res.headersSent) sendJSON(res, 413, { error: 'Model Workshop layout is too large.' })
            return
          }
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (payload?.format !== EMPTY_WORKSPACE.format || typeof payload.contexts !== 'object' || !payload.contexts) {
              sendJSON(res, 400, { error: `Expected ${EMPTY_WORKSPACE.format}.` })
              return
            }
            payload.updatedAt = new Date().toISOString()
            await fs.mkdir(path.dirname(WORKSHOP_FILE), { recursive: true })
            await fs.writeFile(WORKSHOP_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
            sendJSON(res, 200, { ok: true, file: '.model-workshop/layout.json', updatedAt: payload.updatedAt })
          } catch (error) {
            sendJSON(res, 400, { error: `Could not save Model Workshop layout: ${error.message}` })
          }
        })
      })
    }
  }
}

// Relative base so all built asset URLs resolve correctly when the game is
// served from a subdirectory (e.g. https://<server>/<group-folder>/) on the
// department LAMP server, not from the domain root.
export default defineConfig({
  base: './',
  plugins: [modelWorkshopPlugin()]
})
