// Zero-dependency test backend for Bizco.
//
// Receives JPEG frames from the extension's offscreen document, logs them and
// writes the most recent one to dev-backend/last-frame.jpg so you can confirm
// the image actually arrives. Run with: node dev-backend/server.mjs
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = process.env.PORT ?? 3000
const __dirname = dirname(fileURLToPath(import.meta.url))
const LAST_FRAME = join(__dirname, 'last-frame.jpg')

let count = 0

const server = createServer((req, res) => {
  // CORS preflight (extension origin differs from localhost).
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Frame-Ts')

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  if (req.method === 'POST' && req.url === '/api/frames') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', async () => {
      const buf = Buffer.concat(chunks)
      count += 1
      const ts = req.headers['x-frame-ts'] ?? 'n/a'
      console.log(`frame #${count}  ${buf.length} bytes  ts=${ts}`)
      await writeFile(LAST_FRAME, buf)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, frame: count, bytes: buf.length }))
    })
    return
  }

  res.writeHead(404).end('not found')
})

server.listen(PORT, () => {
  console.log(`Bizco test backend listening on http://localhost:${PORT}/api/frames`)
  console.log(`Latest frame written to ${LAST_FRAME}`)
})
