# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Purpose

Use this document as the high-level explanation sheet for the project: what the app does, how it is structured, and where the important business logic lives.

## Commands

```bash
npm run dev       # Start Vite dev server only (http://localhost:5173)
npm run dev:api   # Start Vercel Functions locally (http://localhost:3000)
npm run dev:full  # Windows integrated flow: load .env.local and start App + API
npm run build     # Production build
npm run preview   # Serve production build locally
npm run lint      # Run ESLint
```

No test framework is configured.

## Product summary

FinTax Analyzer is a React + Vite app for Korean financial analysis and corporate tax workflows. It combines calculation-heavy frontend screens with Vercel serverless routes for market data and Supabase for auth and persistence.

## Architecture

### Navigation model

`src/App.jsx` is the root of the app. Navigation is tab-based and controlled by local state such as `activeTab`, `activeFinanceTab`, and `activeTaxTab`. There is no React Router.

### State management

Most application state is managed directly in `src/App.jsx` with plain `useState`. Child components receive data as props and update parent state through callbacks.

Important state includes:

| Variable | Purpose |
|---|---|
| `transactions` | Tax transaction ledger |
| `taxResults` | Output of `analyzeTax()` including reserve tracking |
| `calcHistory` | Recent calculation history |
| `portfolioHoldings` / `portfolioReturnsText` | Portfolio risk inputs |
| `stock`, `bond` | Calculator state preserved across tab changes |

### Key directories

- `src/components/` - feature tabs such as bond, stock, portfolio, tax entry, tax validation, tax report, and dashboard
- `src/components/Auth/` - login and auth gate
- `src/components/ui/` - shared UI primitives
- `src/hooks/useDebounce.js` - debounce hook with pending-state UX
- `src/lib/supabase.js` - Supabase client
- `src/utils/taxCalc.js` - tax engine
- `api/market/stock.js` - KIS stock proxy
- `api/market/bond.js` - BOK ECOS proxy

## Backend and data flow

- Auth uses Supabase email/password auth.
- Persistence uses Supabase tables such as `transactions` and `calc_history`.
- Market data is fetched through `/api/market/*` Vercel routes.
- PDF generation is handled client-side with `@react-pdf/renderer`.
- Database setup reference lives in `supabase-schema.sql`.

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `KIS_APP_KEY` | KIS stock API key |
| `KIS_APP_SECRET` | KIS stock API secret |
| `BOK_API_KEY` | Bank of Korea ECOS key |

## Domain notes

- `src/utils/taxCalc.js` contains the core logic for Korean corporate tax handling under 법인세법 §42③.
- Bond, stock, and VaR features each live mostly within their own component files.
- The project currently favors a straightforward, single-root state model over deep abstraction.

## Communication

- All communication should be in Korean.
