import { useState, useEffect, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import AnnotationPlugin from 'chartjs-plugin-annotation'
import { Line } from 'react-chartjs-2'
import UITooltip      from './ui/Tooltip'
import Spinner        from './ui/Spinner'
import FormattedInput from './ui/FormattedInput'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler, AnnotationPlugin,
)

// ── 계산 로직 ──────────────────────────────────────────────
function calcBond(face, couponRate, years, ytm, freq) {
  const C = face * (couponRate / 100) / freq
  const r = (ytm / 100) / freq
  const n = years * freq
  let P = 0, macSum = 0, convSum = 0
  for (let t = 1; t <= n; t++) {
    const df = Math.pow(1 + r, t)
    const pv = C / df
    const ty = t / freq
    P += pv
    macSum  += ty * pv
    convSum += C * ty * (ty + 1 / freq) / Math.pow(1 + r, t + 2)
  }
  const pvFace = face / Math.pow(1 + r, n)
  P += pvFace; macSum += years * pvFace
  convSum += face * years * (years + 1 / freq) / Math.pow(1 + r, n + 2)
  return { P, macaulay: macSum / P, modified: (macSum / P) / (1 + r), convexity: convSum / P }
}

const YTM_POINTS = Array.from({ length: 29 }, (_, i) => +(1 + i * 0.5).toFixed(1))

const fmt    = (n, d = 2) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtKRW = (n) => `₩ ${Math.abs(n).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`

const FREQ_OPTIONS = [
  { value: 1, label: '연 1회' },
  { value: 2, label: '반기 (연 2회)' },
  { value: 4, label: '분기 (연 4회)' },
]

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-midblue focus:border-transparent transition'

function InputField({ label, unit, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
        {unit && <span className="ml-1 font-normal normal-case text-gray-400">({unit})</span>}
      </label>
      {children}
    </div>
  )
}

function ResultRow({ label, value, tooltip, highlight, sub }) {
  return (
    <div className={`flex items-center justify-between py-3 border-b border-gray-100 last:border-0
                     ${highlight ? 'bg-accent -mx-4 px-4 rounded-lg' : ''}`}>
      <span className="text-sm text-gray-600">
        {tooltip
          ? <UITooltip text={tooltip}>{label}</UITooltip>
          : label}
      </span>
      <div className="text-right">
        <span className={`font-bold ${highlight ? 'text-navy text-lg' : 'text-gray-800'}`}>
          {value}
        </span>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── 차트 컴포넌트 ──────────────────────────────────────────
function PriceCurveChart({ face, coupon, years, freq, ytm }) {
  const canvasRef = useRef(null)
  const prices    = YTM_POINTS.map((y) => calcBond(face, coupon, years, y, freq).P)
  const labels    = YTM_POINTS.map((y) => `${y}%`)
  const currentIdx = YTM_POINTS.reduce(
    (b, y, i) => Math.abs(y - ytm) < Math.abs(YTM_POINTS[b] - ytm) ? i : b, 0,
  )
  const data = {
    labels,
    datasets: [{
      label: '채권 가격', data: prices,
      borderColor: '#1F3C88', borderWidth: 2,
      pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#1F3C88',
      fill: true, tension: 0.35,
      backgroundColor: (ctx) => {
        const { ctx: c, chartArea } = ctx.chart
        if (!chartArea) return 'rgba(30,92,172,0.08)'
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
        g.addColorStop(0, 'rgba(30,92,172,0.18)')
        g.addColorStop(1, 'rgba(30,92,172,0.01)')
        return g
      },
    }],
  }
  const options = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'YTM 변화에 따른 채권 가격', color: '#374151', font: { size: 13, weight: '600' }, padding: { bottom: 12 } },
      tooltip: { callbacks: { label: (i) => ` ${fmtKRW(i.raw)}` } },
      annotation: {
        annotations: {
          currentYTM: {
            type: 'line', scaleID: 'x', value: currentIdx,
            borderColor: '#EF4444', borderWidth: 2, borderDash: [5, 4],
            label: { display: true, content: `YTM ${ytm}%`, backgroundColor: '#EF4444', color: '#fff', font: { size: 11, weight: '600' }, position: 'start', yAdjust: 8, padding: { x: 6, y: 3 }, borderRadius: 4 },
          },
        },
      },
    },
    scales: {
      x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 11 }, maxTicksLimit: 8, callback: (_, i) => Number.isInteger(YTM_POINTS[i]) ? `${YTM_POINTS[i]}%` : '' } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 11 }, callback: (v) => fmtKRW(v) } },
    },
  }
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div style={{ height: 300 }}>
        <Line ref={canvasRef} data={data} options={options} />
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function BondCalculator() {
  const [face,          setFace]          = useState(1000000)
  const [coupon,        setCoupon]        = useState(5)
  const [years,         setYears]         = useState(3)
  const [ytm,           setYtm]           = useState(4)
  const [freq,          setFreq]          = useState(1)
  const [result,        setResult]        = useState(null)
  const [error,         setError]         = useState('')
  const [isCalculating, setIsCalculating] = useState(false)

  // 100ms 딜레이 스피너 + 계산
  useEffect(() => {
    if (face <= 0 || coupon < 0 || years <= 0 || ytm <= 0) {
      setError('모든 값은 0보다 커야 합니다.')
      setResult(null)
      setIsCalculating(false)
      return
    }
    setError('')
    setIsCalculating(true)
    const t = setTimeout(() => {
      setResult(calcBond(face, coupon, years, ytm, freq))
      setIsCalculating(false)
    }, 100)
    return () => clearTimeout(t)
  }, [face, coupon, years, ytm, freq])

  const upDelta   = result ? -result.modified * result.P * 0.01 : null
  const downDelta = result ?  result.modified * result.P * 0.01 : null

  return (
    <div className="space-y-6">
      {/* 상단: 입력 + 결과 — md 이상 2열 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 입력 패널 */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3">
            입력 파라미터
          </h2>

          <InputField label="액면가" unit="원">
            <FormattedInput className={inputCls} value={face} min={1}
              onChange={setFace} placeholder="1,000,000" />
          </InputField>

          <InputField label="쿠폰율" unit="%">
            <input type="number" className={inputCls} value={coupon} min={0} step={0.1}
              onChange={(e) => setCoupon(Number(e.target.value))} />
          </InputField>

          <InputField label="만기" unit="년">
            <input type="number" className={inputCls} value={years} min={1} step={1}
              onChange={(e) => setYears(Math.max(1, Math.floor(Number(e.target.value))))} />
          </InputField>

          <InputField label="시장금리 YTM" unit="%">
            <input type="number" className={inputCls} value={ytm} min={0.01} step={0.1}
              onChange={(e) => setYtm(Number(e.target.value))} />
          </InputField>

          <InputField label="이자지급 횟수">
            <select className={inputCls} value={freq}
              onChange={(e) => setFreq(Number(e.target.value))}>
              {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </InputField>
        </div>

        {/* 결과 패널 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-base font-semibold text-gray-700">계산 결과</h2>
            {isCalculating && <Spinner size="sm" label="" />}
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              ⚠️ {error}
            </div>
          )}

          {!error && !result && !isCalculating && (
            <p className="text-sm text-gray-400 text-center py-8">입력값을 확인 중입니다…</p>
          )}

          {!error && result && !isCalculating && (
            <>
              <div className="mb-6">
                <ResultRow label="채권 현재가격" value={fmtKRW(result.P)} highlight
                  sub={`액면가 대비 ${fmt(result.P / face * 100)}%`} />
                <ResultRow
                  label="Macaulay Duration"
                  value={`${fmt(result.macaulay)} 년`}
                  tooltip="쿠폰과 원금 현금흐름의 가중평균 만기. 이자율 변동에 대한 채권 가격 민감도의 기초 지표입니다."
                />
                <ResultRow
                  label="Modified Duration"
                  value={fmt(result.modified)}
                  tooltip="금리 1% 변동 시 채권 가격의 변화율(%). Macaulay Duration ÷ (1 + r/freq)로 계산됩니다."
                />
                <ResultRow
                  label="Convexity"
                  value={fmt(result.convexity)}
                  tooltip="듀레이션이 이자율 변동에 따라 변화하는 속도. Convexity가 클수록 금리 하락 시 이득이, 금리 상승 시 손실이 완화됩니다."
                />
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  금리 변동 시 가격 영향 (±1%)
                </p>
                <div className="flex gap-3">
                  <div className="flex-1 bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-red-400 mb-1">금리 +1%</p>
                    <p className="font-bold text-red-600 text-sm">
                      {upDelta < 0 ? '▼ ' : '▲ '}{fmtKRW(upDelta)}
                    </p>
                  </div>
                  <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-500 mb-1">금리 −1%</p>
                    <p className="font-bold text-green-600 text-sm">▲ {fmtKRW(downDelta)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 하단: 가격 곡선 차트 */}
      {!error && result && !isCalculating && (
        <PriceCurveChart face={face} coupon={coupon} years={years} freq={freq} ytm={ytm} />
      )}
    </div>
  )
}
