export function analyzeTax(transactions) {
  const results       = []
  const stockReserves = {}

  for (const tx of transactions) {
    const amount = tx.amount ?? tx.qty * tx.price
    const stock  = tx.name || '(미입력)'

    if (!stockReserves[stock]) stockReserves[stock] = 0

    switch (tx.type) {
      case '매수':
        results.push({
          _tx: tx, stock, amount,
          adjType: '매수', taxAdj: '없음', category: '—',
          detail: '취득가액으로 세무 장부가 등록',
          reserveDelta: 0,
        })
        break

      case '기말평가(평가이익)':
        stockReserves[stock] += amount
        results.push({
          _tx: tx, stock, amount,
          adjType: '익금불산입', category: '유보',
          detail: '상장주식 평가이익 — 세무상 익금 불산입',
          reserveDelta: +amount,
        })
        break

      case '기말평가(평가손실)':
        stockReserves[stock] += amount
        results.push({
          _tx: tx, stock, amount,
          adjType: '손금불산입', category: '유보',
          detail: '상장주식 평가손실 — 세무상 손금 불산입',
          reserveDelta: +amount,
        })
        break

      case '배당수령':
        results.push({
          _tx: tx, stock, amount,
          adjType: '익금산입', category: '없음',
          detail: '배당소득 익금산입',
          withholdingTax: amount * 0.14,
          reserveDelta: 0,
        })
        break

      case '매도': {
        const relatedReserve = stockReserves[stock] || 0
        stockReserves[stock] = 0
        results.push({
          _tx: tx, stock, amount,
          adjType: '유보추인', category: '유보감소',
          detail: '처분에 따른 기존 유보 추인(해소)',
          reserveDelta: relatedReserve > 0 ? -relatedReserve : 0,
        })
        break
      }

      default:
        break
    }
  }

  let running = 0
  return results.map((r) => {
    running += r.reserveDelta
    return { ...r, runningReserve: running }
  })
}
