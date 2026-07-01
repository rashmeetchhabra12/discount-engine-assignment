import Papa from 'papaparse'

const VALID_SCOPES = ['brand', 'platform', 'cart']
const VALID_TYPES = ['percentage', 'flat']

export function validateRule(rule, rowLabel = 'Rule') {
  const errors = []

  if (!rule.ruleId) errors.push(`${rowLabel}: missing rule_id`)
  if (!VALID_SCOPES.includes(rule.scope)) {
    errors.push(`${rowLabel}: scope must be "brand", "platform", or "cart"`)
  }
  if (rule.scope !== 'cart' && !rule.appliesTo) {
    errors.push(`${rowLabel}: applies_to is required for brand/platform rules`)
  }
  if (!VALID_TYPES.includes(rule.type)) {
    errors.push(`${rowLabel}: type must be "percentage" or "flat"`)
  }
  if (typeof rule.stackable !== 'boolean') {
    errors.push(`${rowLabel}: stackable must be true or false`)
  }
  if (!Number.isFinite(rule.value) || rule.value <= 0) {
    errors.push(`${rowLabel}: value must be a positive number`)
  }
  if (rule.type === 'percentage' && rule.value > 100) {
    errors.push(`${rowLabel}: percentage value cannot exceed 100`)
  }
  if (rule.scope === 'cart' && (!Number.isFinite(rule.minCartValue) || rule.minCartValue <= 0)) {
    errors.push(`${rowLabel}: cart rules require a positive min_cart_value`)
  }

  return errors
}

function parseBoolean(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes') {
    return { valid: true, value: true }
  }
  if (text === 'false' || text === '0' || text === 'no') {
    return { valid: true, value: false }
  }
  return { valid: false, value: null }
}

function parseRuleRow(row, rowLabel) {
  const stackable = parseBoolean(row.stackable)
  const rule = {
    ruleId: String(row.rule_id ?? row.ruleId ?? '').trim(),
    scope: String(row.scope ?? '').trim().toLowerCase(),
    appliesTo: String(row.applies_to ?? row.appliesTo ?? '').trim(),
    type: String(row.type ?? '').trim().toLowerCase(),
    value: Number.parseFloat(row.value),
    stackable: stackable.value,
  }

  const minCartValue = row.min_cart_value ?? row.minCartValue
  if (minCartValue !== undefined && String(minCartValue).trim() !== '') {
    rule.minCartValue = Math.round(Number.parseFloat(minCartValue))
  }

  if (rule.scope === 'cart') {
    rule.appliesTo = ''
  }

  return { rule, errors: validateRule(rule, rowLabel) }
}

export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((error) => error.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, index) => {
    const rowLabel = `Row ${index + 2}`
    const { rule, errors: rowErrors } = parseRuleRow(row, rowLabel)

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    data.push(rule)
  })

  return { data, errors }
}

export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((error) => error.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, index) => {
    const rowNum = index + 2
    const missing = []

    if (!row.item_id) missing.push('item_id')
    if (!row.product) missing.push('product')
    if (!row.brand) missing.push('brand')
    if (!row.platform) missing.push('platform')
    if (row.base_price === undefined || row.base_price === '') missing.push('base_price')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields - ${missing.join(', ')}`)
      return
    }

    const basePrice = Number.parseFloat(row.base_price)
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      errors.push(`Row ${rowNum}: base_price must be a positive number, got "${row.base_price}"`)
      return
    }

    data.push({
      itemId: row.item_id.trim(),
      product: row.product.trim(),
      brand: row.brand.trim(),
      platform: row.platform.trim(),
      basePrice: Math.round(basePrice),
    })
  })

  return { data, errors }
}

export function normaliseParsedRule(rawRule, existingCount = 0) {
  const source = rawRule || {}
  const rawStackable = source.stackable
  let stackable
  if (typeof rawStackable === 'boolean') {
    stackable = rawStackable
  } else {
    const parsed = parseBoolean(rawStackable)
    stackable = parsed.valid ? parsed.value : rawStackable
  }

  const rule = {
    ruleId: String(source.rule_id ?? source.ruleId ?? `RULE-${String(existingCount + 1).padStart(2, '0')}`).trim(),
    scope: String(source.scope ?? '').trim().toLowerCase(),
    appliesTo: String(source.applies_to ?? source.appliesTo ?? '').trim(),
    type: String(source.type ?? '').trim().toLowerCase(),
    value: Number.parseFloat(source.value),
    stackable,
  }

  const minCartValue = source.min_cart_value ?? source.minCartValue
  if (minCartValue !== undefined && minCartValue !== null && String(minCartValue).trim() !== '') {
    rule.minCartValue = Math.round(Number.parseFloat(minCartValue))
  }

  if (rule.scope === 'cart') {
    rule.appliesTo = ''
  }

  return rule
}
