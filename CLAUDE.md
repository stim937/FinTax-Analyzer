# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server only (http://localhost:5173)
npm run dev:api   # Start Vercel Functions locally (http://localhost:3000)
npm run build     # Production build
npm run preview   # Serve production build locally
npm run lint      # Run ESLint
```

No test framework is configured.

## Architecture

FinTax Analyzer is a React + Vite app for Korean financial institutions — it performs bond/stock/portfolio calculations and Korean corporate tax compliance checks (법인세법 §42③). It uses Supabase for auth/persistence and Vercel Serverless Functions for market data proxying.

### Navigation model

`App.jsx` is the root — it owns all shared state and implements tab-based routing via `activeTab` / `activeFinanceTab` / `activeTaxTab` state variables. There is no React Router.

### State management

All state lives in `App.jsx` as plain `useState`. Child components receive data as props and call parent callbacks (`onCalculate`, `onSave`, `onUpdate`) to mutate state. No Context API, Redux, or Zustand is used.

Key state in `App.jsx`:

| Variable | Purpose |
|---|---|
| `transactions` | Tax transaction ledger (buy/sell/dividend/evaluation) |
| `taxResults` | Rows analyzed by `analyzeTax()`, includes running reserve (유보) |
| `calcHistory` | Last 20 calculations, upserted by type |
| `portfolioHoldings` / `portfolioReturnsText` | VaR inputs shared across components |
| `stock`, `bond` | Calculator input states persisted across tab switches |

### Key directories

- `src/components/` — one file per feature tab (BondCalculator, StockValuation, PortfolioRisk, TaxEntry, TaxValidator, TaxReport, Dashboard)
- `src/components/Auth/` — LoginForm.jsx (email/password auth), AuthGuard.jsx (session gate)
- `src/components/ui/` — shared primitives: `FormattedInput` (thousand-separator), `Tooltip`, `Spinner`
- `src/lib/supabase.js` — Supabase client (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
- `src/hooks/useDebounce.js` — custom debounce with `isPending` flag for loading UX
- `src/utils/taxCalc.js` — pure `analyzeTax()` function; implements reserve-delta tracking per stock across transaction types
- `api/market/stock.js` — Vercel Serverless: KIS API proxy for Korean stock prices
- `api/market/bond.js` — Vercel Serverless: BOK ECOS API proxy for bond rates

### Backend & Auth

- **Auth**: Supabase Auth (email/password). `App.jsx` owns user state via `supabase.auth.onAuthStateChange()`. `AuthGuard` wraps the entire app.
- **Persistence**: `transactions` and `calc_history` tables in Supabase. Data loads on login; saves fire-and-forget. TaxHeader saved to `localStorage` keyed by `user.id`.
- **Market data**: Client calls `/api/market/stock?ticker=XXXXXX`. When `KIS_APP_KEY` is not set, returns mock prices for major tickers (개발용).
- **PDF**: `@react-pdf/renderer` with Nanum Gothic font. `PDFDownloadLink` in TaxReport generates client-side PDF.
- **DB schema**: See `supabase-schema.sql`. Run in Supabase SQL Editor before first deploy.
- **Local dev API**: `npm run dev` alone does not serve `/api/*`. Start `npm run dev:api` as well, or use `run-dev-with-api.bat` on Windows.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` + Vercel | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` + Vercel | Supabase anon key |
| `KIS_APP_KEY` | `.env.local` + Vercel | KIS stock API key (server-only) |
| `KIS_APP_SECRET` | `.env.local` + Vercel | KIS stock API secret (server-only) |
| `BOK_API_KEY` | `.env.local` + Vercel | Bank of Korea ECOS key (server-only) |

### Design tokens

Defined in `tailwind.config.js` and `index.css`:
- `navy` → `#1F3C88` (primary)
- `midblue` → `#2E5FAC`
- `accent` → `#E8F0FE`

### Charting

Chart.js 4 + react-chartjs-2. `chartjs-plugin-annotation` is used for YTM markers (BondCalculator) and VaR threshold lines (PortfolioRisk).

### Tax logic

`analyzeTax(transactions)` in `src/utils/taxCalc.js` is the core tax engine. It processes transactions chronologically, tracks per-stock reserve deltas (유보 증감), and returns compliance status per row based on Korean corporate tax law §42③.

## 💬 Communication
- All communication should be in **Korean**.
