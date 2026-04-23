function randNormal(mean, std) {
  let u
  let v
  do { u = Math.random() } while (u === 0)
  do { v = Math.random() } while (v === 0)
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std
}

export function generateSampleReturns() {
  return Array.from({ length: 250 }, () => +randNormal(0.03, 1.2).toFixed(4)).join(', ')
}

export const DEFAULT_HOLDINGS = [
  { id: 1, name: '삼성전자', ticker: '005930', qty: 10, price: 74000 },
  { id: 2, name: 'SK하이닉스', ticker: '000660', qty: 5, price: 180000 },
  { id: 3, name: 'NAVER', ticker: '035420', qty: 3, price: 210000 },
]
