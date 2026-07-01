import { useEffect, useMemo, useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { normaliseParsedRule, parseCartCSV, parseRulesCSV, validateRule } from './engine/csvParser.js'
import { processCart } from './engine/discountEngine.js'
import { parseCartPDF } from './engine/pdfCartParser.js'

const money = (value) => `Rs.${value.toLocaleString('en-IN')}`

const RULES_COLUMNS = [
  { key: 'ruleId', label: 'Rule ID' },
  { key: 'scope', label: 'Scope', render: (value) => value.charAt(0).toUpperCase() + value.slice(1) },
  { key: 'appliesTo', label: 'Applies To', render: (value, row) => row.scope === 'cart' ? 'Entire cart' : value },
  { key: 'type', label: 'Type', render: (value) => value.charAt(0).toUpperCase() + value.slice(1) },
  {
    key: 'value',
    label: 'Value',
    render: (value, row) => row.type === 'percentage' ? `${value}% off` : `${money(value)} off`,
  },
  {
    key: 'minCartValue',
    label: 'Threshold',
    render: (value, row) => row.scope === 'cart' ? money(value) : '-',
  },
  { key: 'stackable', label: 'Stackable', render: (value) => (value ? 'Yes' : 'No') },
]

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: money },
]

const RESULTS_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'Base Price', render: money },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (value, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>
        {money(value)}
      </span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (value) => value > 0
      ? <span style={{ color: '#1e5c2c', fontWeight: 600 }}>{money(value)}</span>
      : <span style={{ color: '#888' }}>-</span>,
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (value) => (
      <span style={{ color: value === 'No offers available' ? '#888' : '#131A48', fontStyle: value === 'No offers available' ? 'italic' : 'normal' }}>
        {value}
      </span>
    ),
  },
]

const S = {
  page: { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header: { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff' },
  logoSpan: { color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main: { maxWidth: 1180, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' },
  btn: {
    background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 1.3rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  secondaryBtn: {
    background: '#131A48', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.55rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  ghostBtn: {
    background: '#fff', color: '#131A48', border: '1px solid #CECECE', borderRadius: 4,
    padding: '0.55rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  btnDisabled: {
    background: '#CECECE', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 1.3rem', fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  field: {
    width: '100%', minHeight: 88, border: '1px solid #CECECE', borderRadius: 4,
    padding: '0.75rem', fontSize: 13, color: '#131A48', resize: 'vertical',
  },
  totalRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem',
    borderTop: '2px solid #131A48',
  },
  totalLabel: { fontWeight: 700, fontSize: 14, color: '#131A48' },
  totalValue: { fontWeight: 700, fontSize: 16, color: '#131A48' },
  subtle: { fontSize: 11, color: '#888', marginTop: 6 },
  confirmBox: { marginTop: '0.8rem', padding: '0.8rem', background: '#fafafa', border: '1px solid #CECECE', borderRadius: 4 },
}

function nextRuleId(rules) {
  const max = rules.reduce((highest, rule) => {
    const match = String(rule.ruleId).match(/RULE-(\d+)/i)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `RULE-${String(max + 1).padStart(2, '0')}`
}

export default function App() {
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErrors] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')

  const [results, setResults] = useState(null)
  const [ruleText, setRuleText] = useState('')
  const [ruleParseError, setRuleParseError] = useState('')
  const [pendingRule, setPendingRule] = useState(null)
  const [isParsingRule, setIsParsingRule] = useState(false)
  const [isParsingPdf, setIsParsingPdf] = useState(false)

  const canCalculate = rules.length > 0 && cartItems.length > 0

  useEffect(() => {
    if (canCalculate) {
      setResults(processCart(cartItems, rules))
    } else {
      setResults(null)
    }
  }, [cartItems, rules, canCalculate])

  const cartOfferRow = useMemo(() => {
    if (!results?.cartOffer?.totalDiscount) return null
    return {
      itemId: 'CART',
      product: 'Cart offer',
      basePrice: results.subtotal,
      finalPrice: results.total,
      totalDiscount: results.cartOffer.totalDiscount,
      reasoning: results.cartOffer.reasoning,
    }
  }, [results])

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErrors(errors)
    setRulesFileName(fileName)
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
  }

  async function handlePdfCartLoad(file, fileName) {
    setIsParsingPdf(true)
    setCartErrors([])
    try {
      const { data, errors } = await parseCartPDF(file)
      setCartItems(data)
      setCartErrors(errors)
      setCartFileName(fileName)
    } catch (error) {
      setCartErrors([error.message])
    } finally {
      setIsParsingPdf(false)
    }
  }

  async function handleParseRule() {
    setIsParsingRule(true)
    setRuleParseError('')
    setPendingRule(null)

    try {
      const response = await fetch('/api/parse-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: ruleText }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Could not parse rule.')
      }

      const rule = {
        ...normaliseParsedRule(payload.rule, rules.length),
        ruleId: nextRuleId(rules),
      }
      const validationErrors = validateRule(rule, 'Parsed rule')
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(' '))
      }

      setPendingRule(rule)
    } catch (error) {
      setRuleParseError(error.message)
    } finally {
      setIsParsingRule(false)
    }
  }

  function handleConfirmRule() {
    if (!pendingRule) return
    setRules((current) => [...current, pendingRule])
    setPendingRule(null)
    setRuleText('')
    setRuleParseError('')
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.logoTxt}>O<span style={S.logoSpan}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>
        <div style={S.grid2}>
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={S.subtle}>{rules.length} rule{rules.length > 1 ? 's' : ''} loaded</div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <CsvUploader
                label="cart.csv"
                description="Upload cart CSV"
                onLoad={handleCartLoad}
                hasData={cartItems.length > 0 && cartFileName.toLowerCase().endsWith('.csv')}
                fileName={cartFileName}
              />
              <CsvUploader
                label="cart.pdf"
                description="Upload cart PDF"
                onLoad={handlePdfCartLoad}
                hasData={cartItems.length > 0 && cartFileName.toLowerCase().endsWith('.pdf')}
                fileName={isParsingPdf ? 'Reading PDF...' : cartFileName}
                accept=".pdf,application/pdf"
                readMode="file"
              />
            </div>
            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={S.subtle}>{cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded</div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>Natural Language Rule</div>
          <textarea
            style={S.field}
            value={ruleText}
            onChange={(event) => setRuleText(event.target.value)}
            placeholder="20% off for Natura Casa brand, stackable with other offers"
          />
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
            <button
              style={ruleText.trim() && !isParsingRule ? S.secondaryBtn : S.btnDisabled}
              disabled={!ruleText.trim() || isParsingRule}
              onClick={handleParseRule}
            >
              {isParsingRule ? 'Parsing...' : 'Parse Rule'}
            </button>
            {pendingRule && (
              <>
                <button style={S.btn} onClick={handleConfirmRule}>Confirm Rule</button>
                <button style={S.ghostBtn} onClick={() => setPendingRule(null)}>Discard</button>
              </>
            )}
          </div>
          <ErrorBanner errors={ruleParseError ? [ruleParseError] : []} />
          {pendingRule && (
            <div style={S.confirmBox}>
              <DataTable columns={RULES_COLUMNS} rows={[pendingRule]} />
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <button
            style={canCalculate ? S.btn : S.btnDisabled}
            onClick={() => setResults(processCart(cartItems, rules))}
            disabled={!canCalculate}
          >
            Calculate Discounts
          </button>
          {!canCalculate && <div style={S.subtle}>Upload rules and cart data to calculate</div>}
        </div>

        {results && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results.items} />
            {cartOfferRow && (
              <div style={{ marginTop: '0.75rem' }}>
                <DataTable columns={RESULTS_COLUMNS} rows={[cartOfferRow]} />
              </div>
            )}
            <div style={S.totalRow}>
              <span style={S.totalLabel}>Cart Total Before Cart Offer</span>
              <span style={S.totalValue}>{money(results.subtotal)}</span>
            </div>
            {results.cartOffer.totalDiscount > 0 && (
              <div style={S.totalRow}>
                <span style={S.totalLabel}>Cart Offer</span>
                <span style={S.totalValue}>-{money(results.cartOffer.totalDiscount)}</span>
              </div>
            )}
            <div style={S.totalRow}>
              <span style={S.totalLabel}>Final Cart Total</span>
              <span style={S.totalValue}>{money(results.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
