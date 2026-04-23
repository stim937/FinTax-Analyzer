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
