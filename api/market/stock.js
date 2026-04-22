/**
 * Vercel Serverless Function — 한국 주식 현재가 프록시
 * KIS(한국투자증권) Open API를 경유하여 API Key를 서버에서 보호합니다.
 *
 * 사용: GET /api/market/stock?ticker=005930
 *
 * 환경변수 (Vercel Dashboard에 설정):
 *   KIS_APP_KEY     — 한국투자증권 앱키
 *   KIS_APP_SECRET  — 한국투자증권 앱시크릿
 *
 * 로컬 개발: vercel dev 사용 또는 .env.local에 KIS 키 설정 후 vercel dev 실행
 */

import fs from 'fs'
import path from 'path'

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'

const DATA_PATH = path.join(process.cwd(), 'api/market/data/stocks.json')
let STOCK_MASTER = []
try {
  if (fs.existsSync(DATA_PATH)) {
    STOCK_MASTER = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
  }
} catch (_) {}

async function getAccessToken() {
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:  'client_credentials',
      appkey:      process.env.KIS_APP_KEY,
      appsecret:   process.env.KIS_APP_SECRET,
    }),
  })
  const json = await res.json()
  return json.access_token
}

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { ticker } = req.query
  if (!ticker) {
    return res.status(400).json({ error: 'ticker 파라미터가 필요합니다 (예: ?ticker=005930)' })
  }

  // KIS 키가 설정되지 않은 경우 — 개발용 mock 응답
  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    const MOCK_PRICES = {
      '005930': { price: 74000,  name: '삼성전자' },
      '000660': { price: 180000, name: 'SK하이닉스' },
      '035420': { price: 210000, name: 'NAVER' },
      '035720': { price: 88000,  name: '카카오' },
      '051910': { price: 620000, name: 'LG화학' },
    }
    const mock = MOCK_PRICES[ticker]
    if (mock) return res.json({ ticker, ...mock, mock: true })
    const stockInfo = STOCK_MASTER.find(s => s.ticker === ticker)
    if (stockInfo) return res.json({ ticker, name: stockInfo.name, mock: true })
    return res.status(404).json({
      error: 'KIS_APP_KEY 환경변수가 설정되지 않았습니다. Vercel Dashboard에서 설정하세요.',
      mock: true,
    })
  }

  try {
    const token = await getAccessToken()

    const priceRes = await fetch(
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization:  `Bearer ${token}`,
          appkey:         process.env.KIS_APP_KEY,
          appsecret:      process.env.KIS_APP_SECRET,
          tr_id:          'FHKST01010100',
          custtype:       'P',
        },
      },
    )

    const data = await priceRes.json()
    const output = data.output

    if (!output?.stck_prpr) {
      return res.status(502).json({ error: 'KIS API 응답 오류', detail: data })
    }

    return res.json({
      ticker,
      price:      Number(output.stck_prpr),
      name:       output.hts_kor_isnm,
      change:     Number(output.prdy_vrss),
      changeRate: Number(output.prdy_ctrt),
      eps:        Number(output.eps)  || 0,
      per:        Number(output.per)  || 0,
      pbr:        Number(output.pbr)  || 0,
      bps:        Number(output.bps)  || 0,
    })
  } catch (err) {
    return res.status(500).json({ error: '시세 조회 실패', detail: err.message })
  }
}
