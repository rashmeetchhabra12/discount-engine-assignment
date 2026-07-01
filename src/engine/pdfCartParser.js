import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const PRICE_RE = /(?:rs\.?\s*)?([\d,]+)(?:\.\d+)?$/i
const KNOWN_PLATFORMS = ['Amazon India', 'Flipkart', 'Noon']
const KNOWN_BRANDS = ['Natura Casa', 'LivSpace Pro', 'Nordic Basics']

function groupTextItemsByLine(textItems) {
  const sorted = textItems
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0,
    }))
    .filter((item) => item.text)
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const lines = []

  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) < 3)
    if (line) {
      line.parts.push(item)
      line.y = (line.y + item.y) / 2
    } else {
      lines.push({ y: item.y, parts: [item] })
    }
  }

  return lines.map((line) => ({
    ...line,
    parts: line.parts.sort((a, b) => a.x - b.x),
    text: joinParts(line.parts),
  }))
}

function joinParts(parts) {
  const sorted = [...parts].sort((a, b) => a.x - b.x)
  let text = ''
  let previous = null

  for (const part of sorted) {
    if (previous) {
      const gap = part.x - (previous.x + previous.width)
      if (gap > 3) text += ' '
    }
    text += part.text
    previous = part
  }

  return text.replace(/\s+/g, ' ').trim()
}

function findColumnX(line, label) {
  const direct = line.parts.find((part) => part.text.toLowerCase().includes(label))
  if (direct) return direct.x

  const chars = []
  for (const part of line.parts) {
    for (const char of part.text) {
      if (!/\s/.test(char)) chars.push({ char: char.toLowerCase(), x: part.x })
    }
  }

  const compact = chars.map((entry) => entry.char).join('')
  const index = compact.indexOf(label)
  return index >= 0 ? chars[index].x : undefined
}

function splitByHeaderColumns(line, header) {
  const columns = {
    product: [],
    brand: [],
    platform: [],
    basePrice: [],
  }

  const productEnd = (header.brandX + header.productX) / 2
  const brandEnd = (header.platformX + header.brandX) / 2
  const platformEnd = (header.priceX + header.platformX) / 2

  for (const part of line.parts) {
    if (part.x < productEnd) columns.product.push(part.text)
    else if (part.x < brandEnd) columns.brand.push(part.text)
    else if (part.x < platformEnd) columns.platform.push(part.text)
    else columns.basePrice.push(part.text)
  }

  return {
    product: joinParts(columns.product),
    brand: joinParts(columns.brand),
    platform: joinParts(columns.platform),
    basePriceText: joinParts(columns.basePrice),
  }
}

function parseFallbackLine(text) {
  const priceMatch = text.match(PRICE_RE)
  if (!priceMatch) return null

  let beforePrice = text.slice(0, priceMatch.index).trim()
  const platform = KNOWN_PLATFORMS.find((candidate) =>
    beforePrice.toLowerCase().endsWith(candidate.toLowerCase())
  )
  if (!platform) return null

  beforePrice = beforePrice.slice(0, -platform.length).trim()
  const brand = KNOWN_BRANDS.find((candidate) =>
    beforePrice.toLowerCase().endsWith(candidate.toLowerCase())
  )
  if (!brand) return null

  return {
    product: beforePrice.slice(0, -brand.length).trim(),
    brand,
    platform,
    basePriceText: priceMatch[1],
  }
}

function parseRow(row, index) {
  const basePrice = Number.parseInt(String(row.basePriceText).replace(/[^\d]/g, ''), 10)

  if (!row.product || !row.brand || !row.platform || !Number.isFinite(basePrice) || basePrice <= 0) {
    return {
      error: `PDF row ${index + 1}: expected Product, Brand, Platform, and Base Price`,
    }
  }

  return {
    item: {
      itemId: `PDF-ITEM-${String(index + 1).padStart(2, '0')}`,
      product: row.product,
      brand: row.brand,
      platform: row.platform,
      basePrice,
    },
  }
}

export async function parseCartPDF(file) {
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const candidateRows = []
  const errors = []

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo)
    const textContent = await page.getTextContent()
    const lines = groupTextItemsByLine(textContent.items)
    const headerLine = lines.find((line) => {
      const text = line.text.toLowerCase()
      return text.includes('product') && text.includes('brand') && text.includes('platform') && text.includes('price')
    })

    if (headerLine) {
      const header = {
        y: headerLine.y,
        productX: findColumnX(headerLine, 'product'),
        brandX: findColumnX(headerLine, 'brand'),
        platformX: findColumnX(headerLine, 'platform'),
        priceX: findColumnX(headerLine, 'price'),
      }

      if (Object.values(header).every((value) => Number.isFinite(value))) {
        for (const line of lines.filter((candidate) => candidate.y < header.y - 5)) {
          const row = splitByHeaderColumns(line, header)
          if (PRICE_RE.test(row.basePriceText)) candidateRows.push(row)
        }
      }
    }

    if (candidateRows.length === 0) {
      for (const line of lines) {
        const fallback = parseFallbackLine(line.text)
        if (fallback) candidateRows.push(fallback)
      }
    }
  }

  const dataRows = []
  candidateRows.forEach((row, index) => {
    const parsed = parseRow(row, index)
    if (parsed.error) errors.push(parsed.error)
    else dataRows.push(parsed.item)
  })

  if (dataRows.length === 0 && errors.length === 0) {
    errors.push('Could not find a cart table with Product, Brand, Platform, and Base Price columns.')
  }

  return { data: dataRows, errors }
}
