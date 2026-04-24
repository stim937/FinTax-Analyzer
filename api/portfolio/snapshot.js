/* global process */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'
const TOKEN_CACHE_PATH = path.join(os.tmpdir(), 'fintax-kis-token.json')
const PRICE_RETRY_DELAYS = [300, 700, 1500, 3000]
let cachedAccessToken = ''
let cachedAccessTokenExpiresAt = 0

function isKisConfigured() {
  return Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET)
}

async function getKisAccessToken() {
  const now = Date.now()
  if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken
  }

  try {
    const raw = await fs.readFile(TOKEN_CACHE_PATH, 'utf8')
    const saved = JSON.parse(raw)
    if (saved?.accessToken && now < Number(saved.expiresAt) - 60_000) {
      cachedAccessToken = saved.accessToken
      cachedAccessTokenExpiresAt = Number(saved.expiresAt)
      return cachedAccessToken
    }
  } catch {
    // 토큰 파일 캐시는 보조 경로라 실패해도 새 토큰 발급으로 진행합니다.
  }

  const response = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
  })

  const data = await response.json()

  if (!response.ok || !data?.access_token) {
    if (data?.error_code === 'EGW00133' && cachedAccessToken) {
      return cachedAccessToken
    }
    throw new Error(data?.msg1 || 'KIS 액세스 토큰 발급에 실패했습니다.')
  }

  cachedAccessToken = data.access_token
  cachedAccessTokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000
  try {
    await fs.writeFile(
      TOKEN_CACHE_PATH,
      JSON.stringify({
        accessToken: cachedAccessToken,
        expiresAt: cachedAccessTokenExpiresAt,
      }),
      'utf8',
    )
  } catch {
    // 서버리스 임시 저장소 쓰기 실패는 다음 호출에서 다시 토큰을 발급받으면 됩니다.
  }
  return cachedAccessToken
}

async function getKisStockQuote(ticker, accessToken) {
  const response = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${accessToken}`,
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
        tr_id: 'FHKST01010100',
        custtype: 'P',
      },
    },
  )

  const data = await response.json()
  const output = data?.output

  if (!response.ok || !output?.stck_prpr) {
    throw new Error(`${ticker} KIS 시세 조회 실패 (${response.status}): ${data?.msg1 || 'KIS 시세 응답이 올바르지 않습니다.'}`)
  }

  return {
    ticker,
    price: Number(output.stck_prpr),
    name: output.hts_kor_isnm,
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function getKisStockQuoteWithRetry(ticker, accessToken, attempts = 5) {
  let lastError = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getKisStockQuote(ticker, accessToken)
    } catch (error) {
      lastError = error

      if (attempt < attempts - 1) {
        await wait(PRICE_RETRY_DELAYS[attempt] ?? PRICE_RETRY_DELAYS.at(-1))
      }
    }
  }

  throw lastError ?? new Error(`${ticker} KIS 시세 조회 실패`)
}

async function priceHoldingsWithLimit(holdings, accessToken, concurrency = 2) {
  const priced = [...holdings]

  async function worker(startIndex) {
    for (let index = startIndex; index < holdings.length; index += concurrency) {
      const holding = holdings[index]

      try {
        const quote = await getKisStockQuoteWithRetry(holding.ticker, accessToken)
        priced[index] = {
          ...holding,
          currentPrice: quote.price,
          priced: true,
        }
      } catch (error) {
        priced[index] = {
          ...holding,
          priced: false,
          error: error.message,
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, holdings.length || 1) }, (_, index) => worker(index)),
  )

  return priced
}

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

function formatCompositionQty(qty) {
  const value = Number(qty) || 0
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)))
}

function buildCompositionKey(holdings) {
  return holdings
    .map((holding) => `${holding.ticker}:${formatCompositionQty(holding.qty)}`)
    .sort()
    .join('|')
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

      const priced = await priceHoldingsWithLimit(holdings, accessToken)

      const pricedHoldings = priced.filter((holding) => holding.priced && holding.currentPrice > 0)
      const failedTickers = priced.filter((holding) => !holding.priced).map((holding) => holding.ticker)

      if (pricedHoldings.length === 0) {
        results.push({ userId: row.user_id, status: 'skipped', reason: 'pricing-failed' })
        continue
      }

      const portfolioValue = pricedHoldings.reduce((sum, holding) => sum + holding.qty * holding.currentPrice, 0)
      const compositionKey = buildCompositionKey(pricedHoldings)

      const { data: previous, error: previousError } = await supabase
        .from('portfolio_returns')
        .select('trade_date, portfolio_value, meta')
        .eq('user_id', row.user_id)
        .lt('trade_date', tradeDate)
        .order('trade_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (previousError) {
        throw new Error(`직전 수익률 조회 실패: ${previousError.message}`)
      }

      const previousValue = Number(previous?.portfolio_value) || 0
      const previousCompositionKey = typeof previous?.meta?.composition_key === 'string'
        ? previous.meta.composition_key
        : ''
      const returnStatus = previousValue > 0 && previousCompositionKey === compositionKey
        ? 'clean'
        : 'composition_changed'
      const returnPct = returnStatus === 'clean'
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
          composition_key: compositionKey,
          return_status: returnStatus,
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
        returnStatus,
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
