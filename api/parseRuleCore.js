const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getGeminiModel() {
  const model = process.env.GEMINI_MODEL?.trim()
  if (!model || model === 'undefined' || model === 'null') {
    return 'gemini-1.5-flash'
  }
  return model
}

function extractJson(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return JSON.parse(fenced[1])

  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1))
  }

  throw new Error('The model did not return JSON.')
}

function collectText(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(collectText).join('')
  if (typeof value !== 'object') return ''

  if (typeof value.output_text === 'string') return value.output_text
  if (typeof value.text === 'string') return value.text
  if (typeof value.content === 'string') return value.content

  return Object.values(value).map(collectText).join('')
}

function getGeminiResponseText(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) {
    return parts.map((part) => part.text || '').join('')
  }

  return collectText(responseJson)
}

function validateModelOutput(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'The model returned an empty response.' }
  }

  if (payload.status === 'unresolvable') {
    return {
      ok: false,
      error: payload.message || 'Please include the discount amount, target, and any cart threshold.',
    }
  }

  const rule = payload.rule
  if (!rule || typeof rule !== 'object') {
    return { ok: false, error: 'The model did not return a rule.' }
  }

  return { ok: true, rule }
}

export async function parseRuleDescription(description) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      status: 500,
      body: {
        error: 'GEMINI_API_KEY is not configured for the rule parser endpoint.',
      },
    }
  }

  if (!description || !description.trim()) {
    return { status: 400, body: { error: 'Enter a discount rule to parse.' } }
  }

  const prompt = `Convert this rule into JSON:

${description}

Return exactly one of:
{"status":"ok","rule":{"scope":"brand|platform|cart","applies_to":"string or empty for cart","type":"percentage|flat","value":number,"stackable":boolean,"min_cart_value":number|null}}
{"status":"unresolvable","message":"short customer-readable reason"}

Rules:
- "for Natura Casa brand" means scope brand, applies_to Natura Casa.
- "on all Flipkart items" means scope platform, applies_to Flipkart.
- "cart value/order total more than Rs.X" means scope cart and min_cart_value X.
- Cart rules must have min_cart_value.
- Do not invent a threshold, amount, brand, or platform.
- Return only JSON.`

  let response
  try {
    const model = getGeminiModel()
    response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: 'Parse retail discount rules into strict JSON. Supported scopes: brand, platform, cart. Supported types: percentage, flat. For vague or incomplete input, return {"status":"unresolvable","message":"..."} instead of guessing.',
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    })
  } catch (error) {
    const cause = error.cause?.message || error.message
    return {
      status: 502,
      body: {
        error: `Could not reach Gemini from the local server: ${cause}`,
      },
    }
  }

  const raw = await response.text()

  if (!response.ok) {
    return {
      status: response.status,
      body: {
        error: `Gemini request failed: ${raw}`,
      },
    }
  }

  let parsed
  try {
    const json = JSON.parse(raw)
    const text = getGeminiResponseText(json)
    parsed = extractJson(text || raw)
  } catch (error) {
    return { status: 502, body: { error: error.message } }
  }

  const validation = validateModelOutput(parsed)
  if (!validation.ok) {
    return { status: 422, body: { error: validation.error } }
  }

  return { status: 200, body: { rule: validation.rule } }
}
