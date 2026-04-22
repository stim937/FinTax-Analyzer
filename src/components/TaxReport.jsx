import { useMemo } from 'react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

// ── 포맷 헬퍼 ─────────────────────────────────────────────
const fmtKRW   = (n) => `${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
const fmtWon   = (n) => `₩ ${fmtKRW(n)}`
const signWon  = (n) => n === 0 ? '₩ 0' : `${n > 0 ? '' : '△'}₩ ${fmtKRW(n)}`

// ── 집계 헬퍼 ─────────────────────────────────────────────
function sumType(rows, type) {
  return rows.filter((r) => r.adjType === type).reduce((s, r) => s + r.amount, 0)
}

function buildStockReserves(rows) {
  const map = {}
  for (const r of rows) {
    if (r.reserveDelta === 0) continue
    if (!map[r.stock]) map[r.stock] = { generated: 0, reversed: 0 }
    if (r.reserveDelta > 0) map[r.stock].generated += r.reserveDelta
    else                    map[r.stock].reversed  += Math.abs(r.reserveDelta)
  }
  return Object.entries(map).map(([stock, { generated, reversed }]) => ({
    stock,
    generated,
    reversed,
    balance: generated - reversed,
  }))
}

// ── 소득처분 매핑 ──────────────────────────────────────────
const DISPOSITION = {
  '익금산입':   '기타사외유출',
  '손금불산입': '유보',
  '익금불산입': '△유보',
  '유보추인':   '유보추인',
  '매수':       '—',
}

// ── 요약 카드 ─────────────────────────────────────────────
function SummaryCard({ label, value, sub, topColor, textColor }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-4 border-t-4 ${topColor} no-print`}>
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums ${textColor}`}>
        ₩ {fmtKRW(value)}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── 도넛 차트 ─────────────────────────────────────────────
function AdjDonut({익금산입, 손금불산입, 익금불산입, 유보추인 }) {
  const labels = ['익금산입', '손금불산입', '익금불산입', '유보추인']
  const values = [익금산입, 손금불산입, 익금불산입, 유보추인]
  const total  = values.reduce((s, v) => s + v, 0)

  if (total === 0) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
      조정 항목 없음
    </div>
  )

  const data = {
    labels,
    datasets: [{
      data:            values,
      backgroundColor: ['#EF4444','#3B82F6','#10B981','#F97316'],
      borderColor:     ['#fff','#fff','#fff','#fff'],
      borderWidth:     3,
      hoverOffset:     6,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'right',
        labels: { font: { size: 12 }, padding: 14, usePointStyle: true },
      },
      title: {
        display: true,
        text: '세무조정 항목별 비중',
        color: '#374151',
        font: { size: 13, weight: '600' },
        padding: { bottom: 8 },
      },
      tooltip: {
        callbacks: {
          label: (item) => ` ${item.label}: ₩ ${fmtKRW(item.raw)} (${total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0}%)`,
        },
      },
    },
  }

  return (
    <div style={{ height: 240 }}>
      <Doughnut data={data} options={options} />
    </div>
  )
}

// ── 계산서 테이블 행 ──────────────────────────────────────
function CalcRow({ label, stock, amount, disposition, indent, isSubtotal, isEmpty }) {
  if (isEmpty) return (
    <tr>
      <td colSpan={4} className="py-2 px-3 text-xs text-gray-400 text-center border border-gray-300">
        해당 항목 없음
      </td>
    </tr>
  )
  if (isSubtotal) return (
    <tr className="bg-gray-50 font-semibold">
      <td className="py-2 px-3 border border-gray-300 text-sm" colSpan={2}>{label}</td>
      <td className="py-2 px-3 border border-gray-300 text-right tabular-nums text-sm">
        {fmtKRW(amount)}
      </td>
      <td className="py-2 px-3 border border-gray-300 text-sm" />
    </tr>
  )
  return (
    <tr className="hover:bg-blue-50 transition-colors">
      <td className={`py-2 border border-gray-300 text-xs text-gray-500 ${indent ? 'pl-6 pr-3' : 'px-3'}`}>
        {label}
      </td>
      <td className="py-2 px-3 border border-gray-300 text-sm">{stock}</td>
      <td className="py-2 px-3 border border-gray-300 text-right tabular-nums text-sm">
        {fmtKRW(amount)}
      </td>
      <td className="py-2 px-3 border border-gray-300 text-sm text-center">{disposition}</td>
    </tr>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function TaxReport({ taxResults = [], taxYear = 2025, company = '' }) {
  const 익금산입액   = useMemo(() => sumType(taxResults, '익금산입'),   [taxResults])
  const 손금불산입액 = useMemo(() => sumType(taxResults, '손금불산입'), [taxResults])
  const 익금불산입액 = useMemo(() => sumType(taxResults, '익금불산입'), [taxResults])
  const 유보추인액   = useMemo(() => sumType(taxResults, '유보추인'),   [taxResults])
  const 손금산입액   = useMemo(() => 유보추인액, [유보추인액])   // 유보추인 = 사실상 손금산입

  const finalReserve = taxResults.length > 0
    ? taxResults[taxResults.length - 1].runningReserve
    : 0

  const addSubtotal = 익금산입액 + 손금불산입액
  const subSubtotal = 손금산입액 + 익금불산입액
  const netAdj      = addSubtotal - subSubtotal

  const addRows = taxResults.filter((r) => ['익금산입', '손금불산입'].includes(r.adjType))
  const subRows = taxResults.filter((r) => ['익금불산입', '유보추인'].includes(r.adjType))

  const stockReserves = useMemo(() => buildStockReserves(taxResults), [taxResults])

  if (taxResults.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <p className="text-4xl mb-3">📄</p>
        <p className="text-gray-500 font-medium">세무 검증 결과가 없습니다</p>
        <p className="text-sm text-gray-400 mt-1">거래 입력 → 저장 후 이 탭에서 리포트를 확인하세요</p>
      </div>
    )
  }

  return (
    <>
      {/* ── 인쇄 전용 CSS ── */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 18mm 15mm; }
          body * { visibility: hidden; }
          #tax-report-print, #tax-report-print * { visibility: visible; }
          #tax-report-print { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="space-y-6">
        {/* 상단 액션 */}
        <div className="flex items-center justify-between no-print">
          <h2 className="text-lg font-bold text-gray-700">세무 요약 리포트</h2>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-midblue transition shadow-sm"
          >
            🖨️ 인쇄 / PDF 저장
          </button>
        </div>

        {/* 요약 카드 4개 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
          <SummaryCard label="익금산입 합계"   value={익금산입액}   sub="배당·유보추인 등"     topColor="border-red-400"    textColor="text-red-600"    />
          <SummaryCard label="손금산입 합계"   value={손금산입액}   sub="유보추인 해소"        topColor="border-blue-400"   textColor="text-blue-600"   />
          <SummaryCard label="익금불산입 합계" value={익금불산입액} sub="평가이익 세무 제외"    topColor="border-green-400"  textColor="text-green-600"  />
          <SummaryCard label="유보 잔액"       value={Math.abs(finalReserve)} sub={finalReserve > 0 ? '추인 예정' : '완전 해소'} topColor="border-orange-400" textColor="text-orange-600" />
        </div>

        {/* 도넛 차트 + 유보 추적 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <AdjDonut
              익금산입={익금산입액}
              손금불산입={손금불산입액}
              익금불산입={익금불산입액}
              유보추인={유보추인액}
            />
          </div>

          {/* 종목별 유보 추적 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 border-b border-gray-100 pb-2">
              종목별 유보 현황
            </h3>
            {stockReserves.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">유보 거래 없음</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left pb-2">종목명</th>
                    <th className="text-right pb-2">유보발생</th>
                    <th className="text-right pb-2">유보추인</th>
                    <th className="text-right pb-2">현재잔액</th>
                    <th className="text-center pb-2">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stockReserves.map(({ stock, generated, reversed, balance }) => (
                    <tr key={stock} className="hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-700">{stock}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-600">{fmtKRW(generated)}</td>
                      <td className="py-2.5 text-right tabular-nums text-orange-600">{reversed > 0 ? fmtKRW(reversed) : '—'}</td>
                      <td className={`py-2.5 text-right tabular-nums font-bold ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmtKRW(balance)}
                      </td>
                      <td className="py-2.5 text-center">
                        {balance > 0
                          ? <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">추인대기</span>
                          : <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">완료</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── 인쇄 대상 계산서 ── */}
        <div id="tax-report-print" className="bg-white rounded-xl shadow-sm p-8">
          {/* 계산서 헤더 */}
          <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
            <p className="text-sm text-gray-500 mb-1">{company}</p>
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              법인세 세무조정 계산서
            </h2>
            <p className="text-sm text-gray-500 mt-1">{taxYear}년 귀속 · 상장주식</p>
          </div>

          {/* 계산서 테이블 */}
          <table className="w-full border-collapse text-sm" style={{ borderColor: '#111' }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-800 py-2 px-3 text-left w-48">구분</th>
                <th className="border border-gray-800 py-2 px-3 text-left">과목 (종목)</th>
                <th className="border border-gray-800 py-2 px-3 text-right w-36">금액 (원)</th>
                <th className="border border-gray-800 py-2 px-3 text-center w-28">소득처분</th>
              </tr>
            </thead>
            <tbody>
              {/* ─ 그룹 1: 익금산입 및 손금불산입 ─ */}
              <tr className="bg-blue-50">
                <td className="border border-gray-800 py-2 px-3 font-bold text-blue-800" colSpan={4}>
                  Ⅰ. 익금산입 및 손금불산입
                </td>
              </tr>
              {addRows.length === 0
                ? <CalcRow isEmpty />
                : addRows.map((r, i) => (
                    <CalcRow
                      key={i}
                      label={r.adjType}
                      stock={r.stock}
                      amount={r.amount}
                      disposition={DISPOSITION[r.adjType] ?? '—'}
                      indent
                    />
                  ))
              }
              <CalcRow label="소  계" amount={addSubtotal} isSubtotal />

              {/* ─ 그룹 2: 손금산입 및 익금불산입 ─ */}
              <tr className="bg-green-50">
                <td className="border border-gray-800 py-2 px-3 font-bold text-green-800" colSpan={4}>
                  Ⅱ. 손금산입 및 익금불산입
                </td>
              </tr>
              {subRows.length === 0
                ? <CalcRow isEmpty />
                : subRows.map((r, i) => (
                    <CalcRow
                      key={i}
                      label={r.adjType}
                      stock={r.stock}
                      amount={r.amount}
                      disposition={DISPOSITION[r.adjType] ?? '—'}
                      indent
                    />
                  ))
              }
              <CalcRow label="소  계" amount={subSubtotal} isSubtotal />

              {/* ─ 차가감 합계 ─ */}
              <tr className="bg-navy text-white font-extrabold">
                <td className="border border-gray-800 py-3 px-3 text-base" colSpan={2}>
                  차가감 세무조정 합계 (Ⅰ − Ⅱ)
                </td>
                <td className="border border-gray-800 py-3 px-3 text-right tabular-nums text-base">
                  {signWon(netAdj)}
                </td>
                <td className="border border-gray-800 py-3 px-3 text-center">—</td>
              </tr>
            </tbody>
          </table>

          {/* 각주 */}
          <div className="mt-5 text-xs text-gray-500 space-y-1 border-t border-gray-200 pt-4">
            <p>※ 상장주식 기말평가손익은 세무상 손금·익금 불산입하고 유보로 처분함 (법인세법 §42③)</p>
            <p>※ 배당수령액은 수입배당금 익금불산입 검토 후 별도 조정 필요</p>
            <p className="text-gray-400 mt-2">생성일시: {new Date().toLocaleString('ko-KR')}</p>
          </div>
        </div>
      </div>
    </>
  )
}
