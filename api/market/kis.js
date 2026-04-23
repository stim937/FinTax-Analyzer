/* global process */

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'

export function isKisConfigured() {
  return Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET)
}

export async function getKisAccessToken() {
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
    throw new Error(data?.msg1 || 'KIS 액세스 토큰 발급에 실패했습니다.')
  }

  return data.access_token
}

export async function getKisStockQuote(ticker, accessToken) {
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
    throw new Error(data?.msg1 || 'KIS 시세 응답이 올바르지 않습니다.')
  }

  return {
    ticker,
    price: Number(output.stck_prpr),
    name: output.hts_kor_isnm,
    change: Number(output.prdy_vrss),
    changeRate: Number(output.prdy_ctrt),
    eps: Number(output.eps) || 0,
    per: Number(output.per) || 0,
    pbr: Number(output.pbr) || 0,
    bps: Number(output.bps) || 0,
  }
}
