/**
 * Pure discount calculation logic. No UI, no side effects.
 */

const normalise = (value = '') => String(value).trim().toLowerCase()

export function ruleMatchesItem(item, rule) {
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }

  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }

  return false
}

export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return Math.min(Math.round(price * rule.value / 100), price)
  }

  if (rule.type === 'flat') {
    return Math.min(rule.value, price)
  }

  return 0
}

function ruleToReasoning(rule) {
  if (rule.scope === 'cart') {
    return rule.type === 'percentage'
      ? `Cart offer: ${rule.value}% off`
      : `Cart offer: Rs.${rule.value} off`
  }

  const scopeLabel = rule.scope === 'brand' ? 'Brand' : 'Platform'

  return rule.type === 'percentage'
    ? `${scopeLabel} offer: ${rule.value}% off`
    : `${scopeLabel} offer: Rs.${rule.value} off`
}

export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((rule) => ruleMatchesItem(item, rule))

  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((rule) => !rule.stackable)
  const stackable = matchingRules.filter((rule) => rule.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    price -= calculateDiscountAmount(price, winner)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.round(price)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((rule) => rule.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

export function applyCartLevelDiscounts(subtotal, rules) {
  const eligibleRules = rules.filter((rule) => subtotal >= Number(rule.minCartValue || 0))

  if (eligibleRules.length === 0) {
    return {
      appliedRules: [],
      skippedRules: rules.map((rule) => rule.ruleId),
      totalDiscount: 0,
      reasoning: '',
    }
  }

  const nonStackable = eligibleRules.filter((rule) => !rule.stackable)
  const stackable = eligibleRules.filter((rule) => rule.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) => calculateDiscountAmount(subtotal, b) - calculateDiscountAmount(subtotal, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let price = subtotal
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    const discount = calculateDiscountAmount(price, winner)
    price -= discount
    appliedRules.push(winner.ruleId)
    reasoningParts.push(`${ruleToReasoning(winner)} - Rs.${discount.toLocaleString('en-IN')} saved`)
  }

  for (const rule of stackable) {
    const discount = calculateDiscountAmount(price, rule)
    price -= discount
    appliedRules.push(rule.ruleId)
    reasoningParts.push(`${ruleToReasoning(rule)} - Rs.${discount.toLocaleString('en-IN')} saved`)
  }

  const finalTotal = Math.round(price)

  return {
    appliedRules,
    skippedRules: skipped.map((rule) => rule.ruleId),
    totalDiscount: subtotal - finalTotal,
    reasoning: reasoningParts.join(' + '),
  }
}

export function processCart(cartItems, rules) {
  const itemRules = rules.filter((rule) => rule.scope !== 'cart')
  const cartRules = rules.filter((rule) => rule.scope === 'cart')
  const items = cartItems.map((item) => applyDiscounts(item, itemRules))
  const subtotal = cartTotal(items)
  const cartOffer = applyCartLevelDiscounts(subtotal, cartRules)

  return {
    items,
    subtotal,
    cartOffer,
    total: subtotal - cartOffer.totalDiscount,
  }
}

export function cartTotal(results) {
  return results.reduce((sum, result) => sum + result.finalPrice, 0)
}
