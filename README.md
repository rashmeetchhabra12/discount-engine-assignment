# Opptra Discount Engine

Working prototype for the Opptra FDE Intern assignment.

## Live URL

https://discount-engine-hazel.vercel.app/

## Deployed Recording Video

https://drive.google.com/file/d/1FnMuR0_0CQPQ6X-DRusKyrsJ-AEFyD93/view?usp=sharing

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

For natural-language rule parsing, set `GEMINI_API_KEY` before starting the dev server:

```bash
$env:GEMINI_API_KEY="your_key_here"
npm run dev
```

## What Is Built

- CSV upload for discount rules and cart items.
- Item-level discount engine with max-saving non-stackable rule selection.
- Stackable rule application on top of the winning non-stackable rule.
- Cart-level offers using `scope=cart` and `min_cart_value`.
- Natural-language rule input through a server-side Gemini endpoint at `/api/parse-rule`.
- Confirmation step before an LLM-parsed rule is added.
- PDF cart upload using client-side `pdfjs-dist` parsing.
- Customer-facing results with item rows, optional cart-offer row, subtotal, and final cart total.

## CSV Formats

`sample-data/rules.csv`

```csv
rule_id,scope,applies_to,type,value,stackable,min_cart_value
RULE-01,platform,Amazon India,percentage,15,false,
RULE-02,brand,Natura Casa,flat,150,false,
RULE-03,platform,Flipkart,percentage,10,true,
RULE-04,cart,,percentage,10,false,4000
```

`sample-data/cart.csv`

```csv
item_id,product,brand,platform,base_price
ITEM-01,Cushion Cover,Natura Casa,Amazon India,1299
ITEM-02,Bed Sheet Set,Natura Casa,Flipkart,849
ITEM-03,Wall Shelf,LivSpace Pro,Amazon India,599
ITEM-04,Ceramic Vase,LivSpace Pro,Noon,2499
ITEM-05,Cutting Board,Nordic Basics,Amazon India,449
ITEM-06,Desk Organiser,Nordic Basics,Flipkart,899
```

## Expected Sample Result

- Item subtotal after item-level discounts: `Rs.5,932`
- Cart offer: `RULE-04`, `10% off`, saving `Rs.593`
- Final cart total: `Rs.5,339`

## Design Notes

- The engine stays pure. CSV, PDF, and LLM inputs all adapt into the same `DiscountRule` and `CartItem` shapes.
- Cart rules are evaluated after item-level discounts and shown as a separate cart-offer line.
- If the cart total is below a cart-rule threshold, no cart-offer row is shown. This is not treated as an error.
- The Gemini API key is never exposed to the browser. Vite serves the same `/api/parse-rule` endpoint locally, and Vercel can deploy `api/parse-rule.js`.
- PDF upload assumes a text-based cart PDF with `Product`, `Brand`, `Platform`, and `Base Price` columns. Malformed or scanned PDFs surface a readable error.
