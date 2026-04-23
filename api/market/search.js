import fs from 'fs';
import path from 'path';

const KIS_BASE = 'https://openapi.koreainvestment.com:9443';
const DATA_PATH = path.join(process.cwd(), 'api/market/data/stocks.json');

// 전 종목 리스트 로드 (서버 실행 시 한 번만 로드하여 메모리 활용)
let STOCK_MASTER = [];
try {
  if (fs.existsSync(DATA_PATH)) {
    STOCK_MASTER = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
} catch (e) {
  console.error('Failed to load stocks.json:', e);
}

function normalizeQuery(value) {
  return String(value ?? '').trim().toLowerCase()
}

async function getAccessToken() {
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey:     process.env.KIS_APP_KEY,
      appsecret:  process.env.KIS_APP_SECRET,
    }),
  })
  const json = await res.json()
  return json.access_token
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { q } = req.query
  if (!q) return res.status(400).json({ error: '검색어(q)가 필요합니다' })

  const query = normalizeQuery(q)
  const isTicker = /^\d{6}$/.test(query)

  // 1. 로컬 stocks.json에서 검색 (종목명 또는 코드)
  if (STOCK_MASTER.length > 0) {
    // 완전 일치 우선 (코드 또는 이름)
    let found = STOCK_MASTER.find(s => s.ticker === query || s.name.toLowerCase() === query);
    
    // 부분 일치 (이름 검색인 경우)
    if (!found && !isTicker) {
      found = STOCK_MASTER.find(s => s.name.toLowerCase().includes(query));
    }

    if (found) {
      return res.json({ ticker: found.ticker, name: found.name, source: 'local' });
    }
  }

  // 2. 로컬에 없으면 KIS API 시도 (종목코드인 경우 유리)
  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    return res.status(503).json({
      error: 'KIS API 환경변수가 설정되지 않았습니다. `.env.local`의 `KIS_APP_KEY`, `KIS_APP_SECRET`를 확인해 주세요.',
    })
  }

  try {
    const token = await getAccessToken()
    const searchRes = await fetch(
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/search-stock-info` +
      `?PRDT_TYPE_CD=300&PDNO=${encodeURIComponent(query)}`,
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization:  `Bearer ${token}`,
          appkey:         process.env.KIS_APP_KEY,
          appsecret:      process.env.KIS_APP_SECRET,
          tr_id:          'CTPF1604R',
          custtype:       'P',
        },
      },
    )

    const data   = await searchRes.json()
    const output = data.output

    if (output?.pdno) {
      return res.json({
        ticker: output.pdno,
        name:   output.prdt_abrv_name ?? output.prdt_name ?? q,
        source: 'kis'
      })
    }
    
    return res.status(404).json({
      error: `'${q}' 종목을 찾지 못했습니다. 종목명 또는 6자리 종목코드를 확인해 주세요.`,
    })

  } catch (err) {
    return res.status(500).json({ error: '종목 검색 실패', detail: err.message })
  }
}
