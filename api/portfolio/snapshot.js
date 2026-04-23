/* global process */

import { createClient } from '@supabase/supabase-js'
import { getKisAccessToken, getKisStockQuote, isKisConfigured } from '../market/kis.js'

function getKstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )

  return {
    tradeDate: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
  }
}

function normalizeHolding(holding, index) {
  return {
    id: Number(holding?.id) || index + 1,
    name: typeof holding?.name === 'string' ? holding.name : '',
    ticker: typeof holding?.ticker === 'string' ? holding.ticker.replace(/\D/g, '').slice(0, 6) : '',
    qty: Math.max(0, Number(holding?.qty) || 0),
    avgPrice: Math.max(0, Number(holding?.avgPrice ?? holding?.avg_price) || 0),
  }
}

function createServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL(VITE_SUPABASE_URL) 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.')
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function isAuthorized(req) {
  if (req.headers['x-vercel-cron']) {
    return true
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return false
  }

  const header = req.headers.authorization || ''
  return header === `Bearer ${secret}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'GET 또는 POST만 지원합니다.' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Cron 호출 권한이 없습니다.' })
  }

  if (!isKisConfigured()) {
    return res.status(503).json({ error: 'KIS API 환경변수가 설정되지 않았습니다.' })
  }

  let supabase
  try {
    supabase = createServiceSupabase()
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }

  const { tradeDate, weekday } = getKstDateParts()
  if (weekday === 'Sat' || weekday === 'Sun') {
    return res.status(200).json({
      ok: true,
      tradeDate,
      skipped: true,
      reason: 'weekend',
    })
  }

  try {
    const [{ data: portfolios, error: portfolioError }, accessToken] = await Promise.all([
      supabase
        .from('portfolio')
        .select('user_id, holdings'),
      getKisAccessToken(),
    ])

    if (portfolioError) {
      throw new Error(`portfolio 조회 실패: ${portfolioError.message}`)
    }

    const users = Array.isArray(portfolios) ? portfolios : []
    const results = []

    for (const row of users) {
      const holdings = (Array.isArray(row.holdings) ? row.holdings : [])
        .map(normalizeHolding)
        .filter((holding) => holding.ticker && holding.qty > 0)

      if (holdings.length === 0) {
        results.push({ userId: row.user_id, status: 'skipped', reason: 'empty-holdings' })
        continue
      }

      const priced = await Promise.all(
        holdings.map(async (holding) => {
          try {
            const quote = await getKisStockQuote(holding.ticker, accessToken)
            return {
              ...holding,
              currentPrice: quote.price,
              priced: true,
            }
          } catch (error) {
            return {
              ...holding,
              currentPrice: 0,
              priced: false,
              error: error.message,
            }
          }
        }),
      )

      const pricedHoldings = priced.filter((holding) => holding.priced && holding.currentPrice > 0)
      const failedTickers = priced.filter((holding) => !holding.priced).map((holding) => holding.ticker)

      if (pricedHoldings.length === 0) {
        results.push({ userId: row.user_id, status: 'skipped', reason: 'pricing-failed' })
        continue
      }

      const portfolioValue = pricedHoldings.reduce((sum, holding) => sum + holding.qty * holding.currentPrice, 0)

      const { data: previous, error: previousError } = await supabase
        .from('portfolio_returns')
        .select('trade_date, portfolio_value')
        .eq('user_id', row.user_id)
        .lt('trade_date', tradeDate)
        .order('trade_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (previousError) {
        throw new Error(`직전 수익률 조회 실패: ${previousError.message}`)
      }

      const previousValue = Number(previous?.portfolio_value) || 0
      const returnPct = previousValue > 0
        ? Number((((portfolioValue - previousValue) / previousValue) * 100).toFixed(6))
        : null

      const payload = {
        user_id: row.user_id,
        trade_date: tradeDate,
        portfolio_value: Number(portfolioValue.toFixed(2)),
        return_pct: returnPct,
        meta: {
          holdings_count: pricedHoldings.length,
          tickers: pricedHoldings.map((holding) => holding.ticker),
          pricing_status: failedTickers.length > 0 ? 'partial' : 'complete',
          failed_tickers: failedTickers,
          snapshot_source: 'vercel-cron',
        },
      }

      const { error: upsertError } = await supabase
        .from('portfolio_returns')
        .upsert(payload, { onConflict: 'user_id,trade_date' })

      if (upsertError) {
        throw new Error(`portfolio_returns 저장 실패: ${upsertError.message}`)
      }

      results.push({
        userId: row.user_id,
        status: 'saved',
        tradeDate,
        portfolioValue: payload.portfolio_value,
        returnPct,
        pricingStatus: payload.meta.pricing_status,
      })
    }

    return res.status(200).json({
      ok: true,
      tradeDate,
      processed: results.length,
      results,
    })
  } catch (error) {
    return res.status(500).json({
      error: '포트폴리오 일일 스냅샷 적재 실패',
      detail: error.message,
    })
  }
}
