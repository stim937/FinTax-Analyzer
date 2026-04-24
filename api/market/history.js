/* global process */

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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function formatKisDate(value) {
  const raw = String(value ?? '')
  if (raw.length !== 8) {
    return ''
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function normalizeDailyRows(output, period) {
  const rows = (Array.isArray(output) ? output : [])
    .map((row) => ({
      tradeDate: formatKisDate(row?.stck_bsop_date),
      close: Number(row?.stck_clpr),
    }))
    .filter((row) => row.tradeDate && row.close > 0)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))

  return rows
    .map((row, index) => {
      const previous = rows[index - 1]
      return {
        ...row,
        returnPct: previous?.close > 0
          ? Number((((row.close - previous.close) / previous.close) * 100).toFixed(6))
          : null,
      }
    })
    .filter((row) => row.returnPct != null && Number.isFinite(Number(row.returnPct)))
    .slice(-period)
}

async function getKisDailyHistory(ticker, accessToken, period) {
  const response = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-price` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=0`,
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${accessToken}`,
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
        tr_id: 'FHKST01010400',
        custtype: 'P',
      },
    },
  )

  const data = await response.json()

  const output = Array.isArray(data?.output)
    ? data.output
    : Array.isArray(data?.output2)
      ? data.output2
      : null

  if (!response.ok || !output) {
    throw new Error(`${ticker} KIS 일봉 조회 실패 (${response.status}): ${data?.msg1 || 'KIS 일봉 응답이 올바르지 않습니다.'}`)
  }

  return normalizeDailyRows(output, period)
}

async function getKisDailyHistoryWithRetry(ticker, accessToken, period, attempts = 5) {
  let lastError = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getKisDailyHistory(ticker, accessToken, period)
    } catch (error) {
      lastError = error

      if (attempt < attempts - 1) {
        await wait(PRICE_RETRY_DELAYS[attempt] ?? PRICE_RETRY_DELAYS.at(-1))
      }
    }
  }

  throw lastError ?? new Error(`${ticker} KIS 일봉 조회 실패`)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ticker = String(req.query.ticker ?? '').replace(/\D/g, '').slice(0, 6)
  const period = Math.max(20, Math.min(240, Number(req.query.period) || 120))

  if (!ticker) {
    return res.status(400).json({ error: 'ticker 파라미터가 필요합니다 (예: ?ticker=005930)' })
  }

  if (!isKisConfigured()) {
    return res.status(503).json({
      error: 'KIS API 환경변수가 설정되지 않았습니다. `.env.local`의 `KIS_APP_KEY`, `KIS_APP_SECRET`를 확인해 주세요.',
    })
  }

  try {
    const token = await getKisAccessToken()
    const rows = await getKisDailyHistoryWithRetry(ticker, token, period)
    return res.json({ ticker, period, rows })
  } catch (err) {
    return res.status(500).json({ error: '일봉 조회 실패', detail: err.message })
  }
}
