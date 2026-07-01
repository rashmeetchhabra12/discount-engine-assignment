import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { parseRuleDescription } from './api/parseRuleCore.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY
  process.env.GEMINI_MODEL = process.env.GEMINI_MODEL || env.GEMINI_MODEL

  return {
    plugins: [
      react(),
      {
        name: 'local-parse-rule-api',
        configureServer(server) {
          server.middlewares.use('/api/parse-rule', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let raw = ''
            req.on('data', (chunk) => {
              raw += chunk
            })
            req.on('end', async () => {
              try {
                const body = raw ? JSON.parse(raw) : {}
                const result = await parseRuleDescription(body.description)
                res.statusCode = result.status
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(result.body))
              } catch (error) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: error.message }))
              }
            })
          })
        },
      },
    ],
  }
})
