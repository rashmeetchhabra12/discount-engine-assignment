import { parseRuleDescription } from './parseRuleCore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const result = await parseRuleDescription(body?.description)
    res.status(result.status).json(result.body)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
