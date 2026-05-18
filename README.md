# FI Stock Manager

Internal stock management system for **Form Imagination** (Ballarat, VIC).

Built on Supabase (PostgreSQL) with a shared database across all clients — changes made on any platform are visible everywhere in real time.

---

## Files

| File | Platform | Description |
|------|----------|-------------|
| `fi-stock-web.html` | Desktop / Browser | Full web app — open directly in any browser |
| `FI_Stock_App.js` | iOS / Android | React Native (Expo) mobile app |
| `fi-stock-import.html` | Browser (one-time) | Shopify export import tool |

---

## Features

- **Inventory** — search, filter by category, stock level badges (In Stock / Low / Out)
- **Adjust stock** — log movements in and out with job/PO reference numbers
- **Edit items** — update name, SKU, category, unit cost, and minimum level
- **Activity log** — full movement history, searchable by item, job number, or PO number
- **Reports** — stock value by category, stock health breakdown
- **Categories** — add/remove categories, synced across all clients
- **Barcode scanning** — mobile app supports scanning FIS/FIF barcodes to adjust or add items
- **Real-time sync** — web app polls every 8 seconds; mobile has pull-to-refresh

---

## Setup

### Web App

1. Download `fi-stock-web.html`
2. Open it in any modern browser (Chrome, Edge, Firefox, Safari)
3. No installation required — it connects directly to Supabase

### Mobile App (Expo)

1. Install **Expo Go** on your iOS or Android device
2. Go to [snack.expo.dev](https://snack.expo.dev)
3. Paste the contents of `FI_Stock_App.js` into `App.js`
4. In `package.json`, ensure `"expo-camera": "~16.0.18"` is listed under dependencies
5. Save — scan the QR code with Expo Go

### Import Tool (one-time)

1. Open `fi-stock-import.html` in a browser
2. Click **Check DB counts** to see what's already in the database
3. Click **▶ Start Import** to load all products
4. Safe to re-run — existing items are skipped automatically

---

## Database

Hosted on [Supabase](https://supabase.com). Tables:

```
stock_items    — id, name, sku, category, qty, unit, min_level, cost, created_at
stock_history  — id, item_id, item_name, type, qty, note, date, created_at
departments    — id, name, created_at
```

RLS policies allow public read/write (internal tool — not exposed publicly).

---

## Tech Stack

- **Database:** Supabase (PostgreSQL)
- **Web:** Vanilla HTML/CSS/JS — zero dependencies, no build step
- **Mobile:** React Native via Expo (Snack)
- **Barcode scanning:** expo-camera (ZXing — QR, Code128, EAN-13, UPC-A, DataMatrix)

---

## Branding

- Primary: `#00A89D` (teal)
- Background: `#111418` (dark)
- Accent: `#f5f5f3` (off-white)
