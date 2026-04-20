import { useState, useMemo, useEffect } from 'react'
import UITooltip from './ui/Tooltip'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import AnnotationPlugin from 'chartjs-plugin-annotation'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, AnnotationPlugin)

// ── 수익률 생성 (Box-Muller 정규분포) ──────────────────────
function randNormal(mean, std) {
  let u, v
  do { u = Math.random() } while (u === 0)
  do { v = Math.random() } while (v === 0)
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std
}

function generateSampleReturns() {
  return Array.from({ length: 250 }, () => +randNormal(0.03, 1.2).toFixed(4)).join(', ')
}

// ── 계산 로직 ──────────────────────────────────────────────
// returns: percent 단위 (예: 1.2, -0.8)
function calcVaR(returns, portfolioValue) {
  const sorted = [...returns].sort((a, b) => a - b)
  const var95 = Math.abs(sorted[Math.floor(sorted.length * 0.05)])
  const var99 = Math.abs(sorted[Math.floor(sorted.length * 0.01)])
  return {
    var95:    (var95 / 100) * portfolioValue,
    var99:    (var99 / 100) * portfolioValue,
    var95pct: var95,
    var99pct: var99,
    raw95:   -var95,   // 실제 5th-percentile 위치 (음수)
    raw99:   -var99,
  }
}

const BIN_WIDTH = 0.5  // percent

function buildHistogram(returnsPct) {
  if (!returnsPct.length) return null
  const minR  = Math.min(...returnsPct)
  const maxR  = Math.max(...returnsPct)
  const start = Math.floor(minR / BIN_WIDTH) * BIN_WIDTH
  const end   = Math.ceil(maxR  / BIN_WIDTH) * BIN_WIDTH

  const bins = []
  for (let b = start; b <= end + BIN_WIDTH * 0.01; b = +(b + BIN_WIDTH).toFixed(8)) {
    bins.push(+b.toFixed(8))
  }

  const counts = new Array(bins.length).fill(0)
  for (const r of returnsPct) {
    const idx = Math.floor((r - start) / BIN_WIDTH)
    if (idx >= 0 && idx < counts.length) counts[idx]++
  }

  const labels = bins.map((b) => `${b >= 0 ? '+' : ''}${b.toFixed(1)}`)

  // 연속값 → 빈 인덱스 위치 (소수점 허용)
  const getIdx = (pct) =>
    Math.max(-0.5, Math.min(bins.length - 0.5, (pct - start) / BIN_WIDTH))

  return { labels, counts, bins, start, getIdx }
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────
const fmtKRW = (n) => `₩ ${Math.round(Math.abs(n)).toLocaleString('ko-KR')}`
const fmtPct = (n) =>
  n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'

// ── 입력 스타일 ───────────────────────────────────────────
const inputCls =
  'border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-midblue focus:border-transparent transition w-full'

// ── 히스토그램 컴포넌트 ───────────────────────────────────
function ReturnHistogram({ returnsPct, var95pct, var99pct }) {
  const hist = useMemo(() => buildHistogram(returnsPct), [returnsPct])
  if (!hist) return null

  const { labels, counts, getIdx } = hist

  const data = {
    labels,
    datasets: [
      {
        label: '빈도',
        data: counts,
        backgroundColor: labels.map((l) => {
          const v = parseFloat(l)
          if (v <= -var99pct) return 'rgba(239,68,68,0.75)'
          if (v <= -var95pct) return 'rgba(249,115,22,0.6)'
          return 'rgba(46,95,172,0.45)'
        }),
        borderColor: labels.map((l) => {
          const v = parseFloat(l)
          if (v <= -var99pct) return 'rgba(239,68,68,1)'
          if (v <= -var95pct) return 'rgba(249,115,22,1)'
          return 'rgba(46,95,172,0.7)'
        }),
        borderWidth: 1,
        borderRadius: 3,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: '일별 수익률 분포 히스토그램',
        color: '#374151',
        font: { size: 13, weight: '600' },
        padding: { bottom: 12 },
      },
      tooltip: {
        callbacks: {
          title: ([item]) => `수익률 구간: ${item.label}%`,
          label: (item)   => ` 빈도: ${item.raw}일`,
        },
      },
      annotation: {
        annotations: {
          var95line: {
            type: 'line',
            scaleID: 'x',
            value: getIdx(-var95pct),
            borderColor: '#F97316',
            borderWidth: 2,
            borderDash: [5, 4],
            label: {
              display: true,
              content: `95% VaR  −${fmtPct(var95pct)}`,
              backgroundColor: '#F97316',
              color: '#fff',
              font: { size: 10, weight: '600' },
              position: 'start',
              yAdjust: 10,
              padding: { x: 6, y: 3 },
              borderRadius: 4,
            },
          },
          var99line: {
            type: 'line',
            scaleID: 'x',
            value: getIdx(-var99pct),
            borderColor: '#EF4444',
            borderWidth: 2,
            borderDash: [5, 4],
            label: {
              display: true,
              content: `99% VaR  −${fmtPct(var99pct)}`,
              backgroundColor: '#EF4444',
              color: '#fff',
              font: { size: 10, weight: '600' },
              position: 'start',
              yAdjust: 36,
              padding: { x: 6, y: 3 },
              borderRadius: 4,
            },
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: {
          color: '#9CA3AF',
          font: { size: 11 },
          maxTicksLimit: 12,
          callback: (_, i) => {
            const v = parseFloat(hist.labels[i])
            return Number.isInteger(v) ? `${v}%` : ''
          },
        },
        title: {
          display: true,
          text: '수익률 (%)',
          color: '#6B7280',
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { color: '#9CA3AF', font: { size: 11 } },
        title: {
          display: true,
          text: '빈도 (일)',
          color: '#6B7280',
          font: { size: 11 },
        },
      },
    },
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div style={{ height: 320 }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
let _nextId = 4

export default function PortfolioRisk({ onUpdate }) {
  const [holdings, setHoldings] = useState([
    { id: 1, name: '삼성전자',  qty: 10, price: 74000  },
    { id: 2, name: 'SK하이닉스', qty: 5,  price: 180000 },
    { id: 3, name: 'NAVER',     qty: 3,  price: 210000 },
  ])
  const [returnsText, setReturnsText] = useState(() => generateSampleReturns())

  // ── 포트폴리오 계산 ────────────────────────────────────
  const totalValue = useMemo(
    () => holdings.reduce((s, h) => s + h.qty * h.price, 0),
    [holdings],
  )

  const holdingsWithWeight = useMemo(
    () =>
      holdings.map((h) => ({
        ...h,
        value:  h.qty * h.price,
        weight: totalValue > 0 ? (h.qty * h.price) / totalValue * 100 : 0,
      })),
    [holdings, totalValue],
  )

  // ── 수익률 파싱 ────────────────────────────────────────
  const returnsPct = useMemo(() => {
    return returnsText
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && isFinite(n))
  }, [returnsText])

  const varResult = useMemo(() => {
    if (returnsPct.length < 20 || totalValue <= 0) return null
    return calcVaR(returnsPct, totalValue)
  }, [returnsPct, totalValue])

  // ── 상위 컴포넌트 갱신 ────────────────────────────────
  useEffect(() => {
    onUpdate?.({ totalValue, var95pct: varResult?.var95pct ?? 0 })
  }, [totalValue, varResult]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 종목 행 편집 ───────────────────────────────────────
  const updateHolding = (id, field, value) =>
    setHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)),
    )

  const addRow = () => {
    setHoldings((prev) => [
      ...prev,
      { id: _nextId++, name: '', qty: 1, price: 0 },
    ])
  }

  const removeRow = (id) =>
    setHoldings((prev) => prev.filter((h) => h.id !== id))

  return (
    <div className="space-y-6">
      {/* 상단 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── 포트폴리오 구성 ── */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-base font-semibold text-gray-700">포트폴리오 구성</h2>
            <button
              onClick={addRow}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-midblue transition"
            >
              <span className="text-base leading-none">+</span> 종목 추가
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left pb-2 pr-2">종목명</th>
                  <th className="text-right pb-2 px-2">수량</th>
                  <th className="text-right pb-2 px-2">현재가(원)</th>
                  <th className="text-right pb-2 px-2">비중(%)</th>
                  <th className="pb-2 w-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {holdingsWithWeight.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        className={inputCls}
                        value={h.name}
                        placeholder="종목명"
                        onChange={(e) => updateHolding(h.id, 'name', e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        className={`${inputCls} text-right`}
                        value={h.qty}
                        min={0}
                        onChange={(e) => updateHolding(h.id, 'qty', Number(e.target.value))}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        className={`${inputCls} text-right`}
                        value={h.price}
                        min={0}
                        onChange={(e) => updateHolding(h.id, 'price', Number(e.target.value))}
                      />
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-gray-600">
                      {h.weight.toFixed(1)}%
                    </td>
                    <td className="py-2 pl-1">
                      <button
                        onClick={() => removeRow(h.id)}
                        className="text-gray-300 hover:text-red-400 transition text-base leading-none"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 총 자산 */}
          <div className="mt-4 flex items-center justify-between bg-accent rounded-lg px-4 py-3">
            <span className="text-sm font-semibold text-navy">총 포트폴리오 가치</span>
            <span className="text-lg font-extrabold text-navy">{fmtKRW(totalValue)}</span>
          </div>
        </div>

        {/* ── 수익률 입력 + 결과 ── */}
        <div className="space-y-5">
          {/* 수익률 입력 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-700">일별 수익률 입력</h2>
                <p className="text-xs text-gray-400 mt-0.5">쉼표로 구분, % 단위 (예: 1.2, -0.8, 0.3)</p>
              </div>
              <button
                onClick={() => setReturnsText(generateSampleReturns())}
                className="px-3 py-1.5 rounded-lg border border-midblue text-midblue text-xs font-semibold hover:bg-accent transition whitespace-nowrap"
              >
                예시 데이터 생성
              </button>
            </div>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-midblue resize-none"
              rows={5}
              value={returnsText}
              onChange={(e) => setReturnsText(e.target.value)}
              placeholder="일별 수익률을 쉼표로 구분하여 입력하세요"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              입력된 데이터: <span className="font-semibold text-gray-600">{returnsPct.length}개</span>
              {returnsPct.length < 20 && returnsPct.length > 0 && (
                <span className="text-amber-500 ml-2">⚠ 최소 20개 이상 필요</span>
              )}
            </p>
          </div>

          {/* VaR 결과 카드 */}
          {varResult ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* 95% VaR */}
                <div className="bg-white rounded-xl shadow-sm p-4 border-t-4 border-orange-400">
                  <p className="text-xs font-semibold text-orange-500 mb-2">
                    <UITooltip text="95% VaR — 정상 시장 환경에서 하루 손실이 이 금액을 초과할 확률이 5%임을 의미합니다.">
                      95% VaR (신뢰수준)
                    </UITooltip>
                  </p>
                  <p className="text-xl font-extrabold text-gray-800">{fmtKRW(varResult.var95)}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{fmtPct(varResult.var95pct)}</p>
                </div>
                {/* 99% VaR */}
                <div className="bg-white rounded-xl shadow-sm p-4 border-t-4 border-red-500">
                  <p className="text-xs font-semibold text-red-500 mb-2">
                    <UITooltip text="99% VaR — 손실이 이 금액을 초과할 확률이 1%로, 95% VaR보다 극단적 리스크 시나리오를 나타냅니다.">
                      99% VaR (신뢰수준)
                    </UITooltip>
                  </p>
                  <p className="text-xl font-extrabold text-gray-800">{fmtKRW(varResult.var99)}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{fmtPct(varResult.var99pct)}</p>
                </div>
              </div>
              {/* 해석 문구 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-gray-600">
                <p>
                  📊 하루 최대 손실이 <strong>95% 확률</strong>로&nbsp;
                  <span className="font-bold text-orange-600">{fmtKRW(varResult.var95)}</span> 이내
                </p>
                <p>
                  🔴 하루 최대 손실이 <strong>99% 확률</strong>로&nbsp;
                  <span className="font-bold text-red-600">{fmtKRW(varResult.var99)}</span> 이내
                </p>
                <p className="text-xs text-gray-400 pt-1 border-t border-gray-200">
                  역사적 시뮬레이션 기준 · 과거 수익률 {returnsPct.length}개 데이터 사용
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
              {returnsPct.length === 0 ? (
                <>
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-semibold text-gray-500 text-sm mb-1">수익률 데이터가 없습니다</p>
                  <p className="text-xs text-gray-400">
                    위의 <span className="font-semibold text-midblue">예시 데이터 생성</span> 버튼을 눌러보세요
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl mb-2">⏳</p>
                  <p className="font-semibold text-gray-500 text-sm mb-1">
                    데이터 {returnsPct.length}개 — 최소 20개 필요
                  </p>
                  <p className="text-xs text-gray-400">수익률을 더 입력하거나 예시 데이터를 생성하세요</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 히스토그램 (전체 너비) */}
      {varResult && (
        <ReturnHistogram
          returnsPct={returnsPct}
          var95pct={varResult.var95pct}
          var99pct={varResult.var99pct}
        />
      )}
    </div>
  )
}
