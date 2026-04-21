import { useState, useMemo, useEffect } from 'react'
import Tooltip        from './ui/Tooltip'
import FormattedInput from './ui/FormattedInput'

// ── 계산 로직 ──────────────────────────────────────────────
function calcValuation(eps, growth, required, sectorPER) {
  const g = growth / 100
  const r = required / 100

  const ivA = eps * sectorPER

  let ivB = null
  let ddmWarning = false
  if (r <= g) {
    ddmWarning = true
  } else {
    ivB = (eps * (1 + g)) / (r - g)
  }

  return { ivA, ivB, ddmWarning }
}

function getVerdict(price, ivA) {
  if (price < ivA * 0.8)  return { label: '강력매수',   sub: '저평가',      bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', dot: 'bg-emerald-500' }
  if (price < ivA)        return { label: '매수',       sub: '소폭 저평가', bg: 'bg-blue-50',    border: 'border-blue-400',    text: 'text-blue-700',    dot: 'bg-blue-500' }
  if (price < ivA * 1.2)  return { label: '중립',       sub: '적정가',      bg: 'bg-gray-50',    border: 'border-gray-400',    text: 'text-gray-600',    dot: 'bg-gray-400' }
  return                         { label: '주의',       sub: '고평가',      bg: 'bg-red-50',     border: 'border-red-400',     text: 'text-red-700',     dot: 'bg-red-500' }
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────
const fmtKRW = (n) => `₩ ${Math.round(n).toLocaleString('ko-KR')}`
const fmtPct = (n, digits = 1) =>
  `${n >= 0 ? '+' : ''}${n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`

// ── 게이지 바 ─────────────────────────────────────────────
function ValuationGauge({ price, ivA, ivB }) {
  const lo = Math.min(ivA, ivB ?? ivA)
  const hi = Math.max(ivA, ivB ?? ivA)

  // 표시 범위: lo*0.5 ~ hi*1.5
  const rangeMin = lo * 0.5
  const rangeMax = hi * 1.5
  const span = rangeMax - rangeMin

  const toPct = (v) => Math.min(100, Math.max(0, ((v - rangeMin) / span) * 100))

  const pricePos = toPct(price)
  const ivAPos   = toPct(ivA)
  const ivBPos   = ivB != null ? toPct(ivB) : null

  const zoneLo   = toPct(lo)
  const zoneHi   = toPct(hi)

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        가격 위치 게이지
      </p>

      {/* 트랙 */}
      <div className="relative h-8 bg-gray-100 rounded-full overflow-visible mx-2">
        {/* 내재가치 구간 하이라이트 */}
        <div
          className="absolute top-0 h-full bg-blue-100 rounded-full"
          style={{ left: `${zoneLo}%`, width: `${zoneHi - zoneLo}%` }}
        />

        {/* IV_A 마커 */}
        <div
          className="absolute top-0 h-full w-0.5 bg-midblue"
          style={{ left: `${ivAPos}%` }}
        >
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-midblue font-semibold whitespace-nowrap">
            PER법
          </span>
        </div>

        {/* IV_B 마커 */}
        {ivBPos != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-blue-400"
            style={{ left: `${ivBPos}%` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-blue-400 font-semibold whitespace-nowrap">
              DDM
            </span>
          </div>
        )}

        {/* 현재가 마커 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-md z-10"
          style={{ left: `${pricePos}%` }}
        >
          <span className="absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-red-600 font-bold whitespace-nowrap">
            현재가
          </span>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-gray-400 mt-6 px-2">
        <span>{fmtKRW(rangeMin)}</span>
        <span>{fmtKRW(rangeMax)}</span>
      </div>
    </div>
  )
}

// ── 입력 필드 래퍼 ────────────────────────────────────────
const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-midblue focus:border-transparent transition'

function Field({ label, unit, children }) {
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

export const DEFAULT_STOCK = {
  name: '삼성전자',
  price: 74000,
  eps: 5000,
  growth: 8,
  required: 10,
  sectorPER: 15,
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function StockValuation({ onCalculate, stock, setStock }) {
  const { name, price, eps, growth, required, sectorPER } = stock
  const setName      = (v) => setStock((s) => ({ ...s, name: v }))
  const setPrice     = (v) => setStock((s) => ({ ...s, price: v }))
  const setEps       = (v) => setStock((s) => ({ ...s, eps: v }))
  const setGrowth    = (v) => setStock((s) => ({ ...s, growth: v }))
  const setRequired  = (v) => setStock((s) => ({ ...s, required: v }))
  const setSectorPER = (v) => setStock((s) => ({ ...s, sectorPER: v }))

  const { ivA, ivB, ddmWarning } = useMemo(
    () => calcValuation(eps, growth, required, sectorPER),
    [eps, growth, required, sectorPER],
  )

  const ivMid    = ivB != null ? (ivA + ivB) / 2 : ivA
  const verdict  = getVerdict(price, ivA)
  const upsideA  = ((ivA - price) / price) * 100
  const upsideB  = ivB != null ? ((ivB - price) / price) * 100 : null

  const validInputs = price > 0 && eps > 0

  useEffect(() => {
    if (!validInputs) return
    const v = getVerdict(price, ivA)
    onCalculate?.({
      name: name || '종목',
      type: '주식평가',
      result: `${v.label} · IV ${fmtKRW(ivA)}`,
    })
  }, [ivA, ivB, price, name])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── 입력 패널 ── */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3">
          종목 정보 입력
        </h2>

        <Field label="종목명">
          <input
            type="text"
            className={inputCls}
            value={name}
            placeholder="예: 삼성전자"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="현재 주가" unit="원">
          <FormattedInput className={inputCls} value={price} min={1} onChange={setPrice} />
        </Field>

        <Field label={<Tooltip text="주당순이익(EPS) — 당기순이익을 발행 주식 수로 나눈 값. PER 계산의 기준이 됩니다.">EPS 주당순이익</Tooltip>} unit="원">
          <FormattedInput className={inputCls} value={eps} min={1} onChange={setEps} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="EPS 성장률" unit="%">
            <FormattedInput className={inputCls} value={growth} min={0} step={0.1} onChange={setGrowth} />
          </Field>
          <Field label={<Tooltip text="요구수익률(r) — 투자자가 기대하는 최소 수익률. DDM 모델에서 r > g 조건이 필요합니다.">요구수익률 r</Tooltip>} unit="%">
            <FormattedInput className={inputCls} value={required} min={0} step={0.1} onChange={setRequired} />
          </Field>
        </div>

        <Field label={<Tooltip text="PER(주가수익비율) — 주가 ÷ EPS. 업종 평균 PER를 기준으로 내재가치를 산출합니다.">업종 평균 PER</Tooltip>}>
          <FormattedInput className={inputCls} value={sectorPER} min={0} step={0.1} onChange={setSectorPER} />
        </Field>

        {/* DDM 경고 */}
        {ddmWarning && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
            <span className="mt-0.5">⚠️</span>
            <span>요구수익률(r)이 성장률(g) 이하입니다. DDM 모델은 <strong>r &gt; g</strong> 조건이 필요합니다.</span>
          </div>
        )}
      </div>

      {/* ── 결과 패널 ── */}
      <div className="space-y-5">
        {/* 판정 배너 */}
        {validInputs && (
          <div className={`rounded-xl border-2 ${verdict.bg} ${verdict.border} p-5 flex items-center justify-between`}>
            <div>
              <p className="text-xs text-gray-500 mb-1">{name || '종목'} 평가 판정</p>
              <p className={`text-2xl font-extrabold ${verdict.text}`}>{verdict.label}</p>
              <p className={`text-sm font-medium ${verdict.text} opacity-75`}>{verdict.sub}</p>
            </div>
            <div className={`w-14 h-14 rounded-full ${verdict.dot} flex items-center justify-center shadow-inner`}>
              <span className="text-white text-2xl">
                {verdict.label === '강력매수' ? '↑↑' :
                 verdict.label === '매수'     ? '↑'  :
                 verdict.label === '중립'     ? '→'  : '↓'}
              </span>
            </div>
          </div>
        )}

        {/* 내재가치 카드 */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3">
            내재가치 분석
          </h2>

          {/* 현재가 vs IV 범위 */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">현재 주가</p>
              <p className="font-bold text-red-600 text-sm">{fmtKRW(price)}</p>
            </div>
            <div className="bg-accent rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">PER법 (IV_A)</p>
              <p className="font-bold text-navy text-sm">{fmtKRW(ivA)}</p>
            </div>
            <div className={`rounded-lg p-3 ${ivB != null ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-400 mb-1">DDM (IV_B)</p>
              <p className={`font-bold text-sm ${ivB != null ? 'text-midblue' : 'text-gray-400'}`}>
                {ivB != null ? fmtKRW(ivB) : '계산불가'}
              </p>
            </div>
          </div>

          {/* 업사이드 */}
          <div className="flex gap-3">
            <div className="flex-1 border border-gray-100 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">PER법 업사이드</p>
              <p className={`font-bold text-sm ${upsideA >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {fmtPct(upsideA)}
              </p>
            </div>
            {upsideB != null && (
              <div className="flex-1 border border-gray-100 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">DDM 업사이드</p>
                <p className={`font-bold text-sm ${upsideB >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fmtPct(upsideB)}
                </p>
              </div>
            )}
          </div>

          {/* 내재가치 범위 요약 */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
            내재가치 범위:&nbsp;
            <span className="font-semibold text-navy">{fmtKRW(Math.min(ivA, ivB ?? ivA))}</span>
            <span className="mx-1 text-gray-400">~</span>
            <span className="font-semibold text-navy">{fmtKRW(Math.max(ivA, ivB ?? ivA))}</span>
          </div>

          {/* 게이지 바 */}
          {validInputs && (
            <ValuationGauge price={price} ivA={ivA} ivB={ivB} />
          )}
        </div>
      </div>
    </div>
  )
}
