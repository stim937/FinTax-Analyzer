/**
 * Vercel Serverless Function — 한국 채권 금리 프록시
 * 한국은행 경제통계시스템(ECOS) API를 경유합니다.
 *
 * 사용: GET /api/market/bond?type=국고채3년
 * 디버그: GET /api/market/bond?debug=items  ← ECOS 항목 코드 조회
 *
 * 환경변수:
 *   BOK_API_KEY — 한국은행 ECOS API 키 (https://ecos.bok.or.kr/)
 */

const BOK_BASE = 'https://ecos.bok.or.kr/api'

// 통계 코드 매핑 (한국은행 ECOS)
// itemCode는 ECOS StatisticItemList에서 확인한 실제 코드 사용
const STAT_CODES = {
  '국고채3년':  { statCode: '817Y002', itemCode: '010200000' },
  '국고채5년':  { statCode: '817Y002', itemCode: '010200001' },
  '국고채10년': { statCode: '817Y002', itemCode: '010210000' },
  'CD91일':     { statCode: '817Y002', itemCode: '010502000' },
}

const MOCK_RATES = {
  '국고채3년':  { rate: 3.45 },
  '국고채5년':  { rate: 3.60 },
  '국고채10년': { rate: 3.75 },
  'CD91일':     { rate: 3.55 },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type = '국고채3년', debug } = req.query

  const bokKey = process.env.BOK_API_KEY
  console.log('[bond] BOK_API_KEY 존재:', !!bokKey, '| 길이:', bokKey?.length ?? 0)

  if (!bokKey) {
    const today = new Date().toISOString().slice(0, 10)
    const mock = MOCK_RATES[type] ?? { rate: 3.5 }
    return res.json({ type, ...mock, date: today, mock: true })
  }

  // ── 디버그 모드: ECOS 항목 코드 목록 조회 ──────────────────
  if (debug === 'items') {
    try {
      const url = `${BOK_BASE}/StatisticItemList/${bokKey}/json/kr/1/100/817Y002`
      console.log('[bond][debug] StatisticItemList 요청')
      const apiRes = await fetch(url)
      const data   = await apiRes.json()
      return res.json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── 일반 금리 조회 ─────────────────────────────────────────
  try {
    const codes = STAT_CODES[type]
    if (!codes) return res.status(400).json({ error: `지원하지 않는 채권 유형: ${type}` })

    const today     = new Date()
    const endDate   = today.toISOString().slice(0, 10).replace(/-/g, '')
    const startDate = new Date(today - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10).replace(/-/g, '')

    const url =
      `${BOK_BASE}/StatisticSearch/${bokKey}/json/kr/1/5` +
      `/${codes.statCode}/D/${startDate}/${endDate}/${codes.itemCode}`

    console.log('[bond] ECOS 요청 URL (키 제외):', url.replace(bokKey, '***'))

    const apiRes = await fetch(url)
    const data   = await apiRes.json()
    const rows   = data?.StatisticSearch?.row

    console.log('[bond] ECOS 응답 rows:', rows?.length ?? 0, '| 전체키:', Object.keys(data ?? {}))
    if (data?.RESULT) console.log('[bond] ECOS RESULT:', JSON.stringify(data.RESULT))

    if (!rows || rows.length === 0) {
      return res.status(502).json({
        error: 'ECOS 응답 없음',
        detail: JSON.stringify(data?.RESULT ?? data).slice(0, 300),
        hint: '올바른 itemCode 확인: /api/market/bond?debug=items',
      })
    }

    const latest = rows[rows.length - 1]
    return res.json({
      type,
      rate: Number(latest.DATA_VALUE),
      date: latest.TIME,
    })
  } catch (err) {
    return res.status(500).json({ error: '금리 조회 실패', detail: err.message })
  }
}
