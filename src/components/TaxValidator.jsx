import { useMemo } from 'react'
import { analyzeTax } from '../utils/taxCalc'
import Tooltip from './ui/Tooltip'

// ── 스텝퍼 정의 ───────────────────────────────────────────
const STEPS = [
  { id: '매수',   label: '매수',   icon: '📥', match: ['매수'] },
  { id: '기말평가', label: '기말평가', icon: '📊', match: ['기말평가(평가이익)', '기말평가(평가손실)'] },
  { id: '배당',   label: '배당',   icon: '💰', match: ['배당수령'] },
  { id: '매도',   label: '매도',   icon: '📤', match: ['매도'] },
]

// ── 조정유형별 스타일 ──────────────────────────────────────
const ADJ_STYLE = {
  '매수':       { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  '익금불산입': { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200'  },
  '손금불산입': { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'    },
  '익금산입':   { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  '유보추인':   { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────
const fmtKRW = (n) => `₩ ${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
const signKRW = (n) =>
  n === 0 ? '₩ 0' : `${n > 0 ? '+' : '−'} ${fmtKRW(n)}`

// ── 스텝퍼 컴포넌트 ───────────────────────────────────────
function Stepper({ typeSet }) {
  const doneSet = new Set(
    STEPS.filter((s) => s.match.some((m) => typeSet.has(m))).map((s) => s.id),
  )
  const firstPending = STEPS.find((s) => !doneSet.has(s.id))?.id ?? null

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between">
        {STEPS.map((step, i) => {
          const done    = doneSet.has(step.id)
          const current = !done && step.id === firstPending

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* 노드 */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold border-2 transition-all ${
                  done    ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                  : current ? 'bg-blue-50 border-midblue text-midblue shadow-sm'
                  :           'bg-gray-100 border-gray-200 text-gray-400'
                }`}>
                  {done ? '✓' : step.icon}
                </div>
                <span className={`text-xs font-semibold ${
                  done    ? 'text-emerald-600'
                  : current ? 'text-midblue'
                  :           'text-gray-400'
                }`}>
                  {step.label}
                </span>
                {done && (
                  <span className="text-[10px] text-emerald-500 font-medium -mt-0.5">완료</span>
                )}
                {current && (
                  <span className="text-[10px] text-midblue font-medium -mt-0.5">진행중</span>
                )}
              </div>

              {/* 연결선 (마지막 제외) */}
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded ${
                  doneSet.has(STEPS[i + 1]?.id) || done ? 'bg-emerald-300' : 'bg-gray-200'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function TaxValidator({ transactions = [] }) {
  const rows = useMemo(() => analyzeTax(transactions), [transactions])

  const typeSet = useMemo(
    () => new Set(transactions.map((t) => t.type)),
    [transactions],
  )

  // 최종 유보잔액
  const finalReserve = rows.length > 0 ? rows[rows.length - 1].runningReserve : 0

  // 평가이익 있는 종목 중 매도가 없는 종목 검출
  const evalStocks = new Set(
    transactions
      .filter((t) => t.type === '기말평가(평가이익)')
      .map((t) => t.name),
  )
  const soldStocks = new Set(
    transactions.filter((t) => t.type === '매도').map((t) => t.name),
  )
  const unsoldEvalStocks = [...evalStocks].filter((s) => !soldStocks.has(s))

  // 배당 원천징수 합계
  const totalWithholding = rows
    .filter((r) => r.withholdingTax)
    .reduce((s, r) => s + r.withholdingTax, 0)

  if (transactions.length === 0) {
    return (
      <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
        <p className="text-5xl mb-4">📝</p>
        <p className="text-lg font-semibold text-gray-600 mb-2">거래를 먼저 입력해주세요</p>
        <p className="text-sm text-gray-400">
          <span className="font-medium text-navy">거래 입력</span> 탭에서 종목과 거래 유형을 입력한 뒤<br />
          저장 버튼을 누르면 세무조정이 자동 검증됩니다
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 스텝퍼 */}
      <Stepper typeSet={typeSet} />

      {/* 경고/안내 배너 */}
      <div className="space-y-3">
        {finalReserve > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800 text-sm">유보 잔액 추인 예정</p>
              <p className="text-sm text-amber-700 mt-0.5">
                매도 시 유보 <strong>{fmtKRW(finalReserve)}</strong> 추인 예정입니다.
                보유 종목 처분 시 세무조정 역산입이 발생합니다.
              </p>
            </div>
          </div>
        )}
        {unsoldEvalStocks.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
            <span className="text-xl mt-0.5">🔴</span>
            <div>
              <p className="font-semibold text-red-700 text-sm">확인 필요 종목 있음</p>
              <p className="text-sm text-red-600 mt-0.5">
                평가이익 계상 후 매도 미처리 종목:&nbsp;
                {unsoldEvalStocks.map((s, i) => (
                  <span key={s}>
                    <strong>{s}</strong>
                    {i < unsoldEvalStocks.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}
        {finalReserve === 0 && unsoldEvalStocks.length === 0 && rows.length > 0 && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
            <span className="text-xl">✅</span>
            <p className="font-semibold text-emerald-700 text-sm">세무조정 이상 없음 — 유보 잔액이 완전히 해소되었습니다.</p>
          </div>
        )}
      </div>

      {/* 세무조정 계산서 테이블 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3 mb-4">
          세무조정 계산서
          <span className="ml-2 text-xs font-normal text-gray-400">{rows.length}건</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left py-2 pr-3 w-28">거래일</th>
                <th className="text-left py-2 px-3 w-36">종목</th>
                <th className="text-left py-2 px-3 w-36">
                  <Tooltip text="익금산입·손금불산입 = 과세소득 증가. 익금불산입·손금산입 = 과세소득 감소.">구분</Tooltip>
                </th>
                <th className="text-right py-2 px-3 w-36">조정금액</th>
                <th className="text-left py-2 px-3">세무처리</th>
                <th className="text-right py-2 pl-3 w-36">
                  <Tooltip text="유보(留保) — 세무상 인정되지 않아 미래 과세연도로 이연된 손익. 처분(매도) 시 추인(해소)됩니다." position="left">유보잔액</Tooltip>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, idx) => {
                const style = ADJ_STYLE[row.adjType] ?? { bg: '', text: 'text-gray-700', border: '' }
                return (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-3 text-gray-500 text-xs tabular-nums">
                      {row._tx.date || '—'}
                    </td>
                    <td className="py-3 px-3 font-medium text-gray-700">{row.stock}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                        {row.adjType}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-medium">
                      <span className={row.adjType === '유보추인' ? 'text-orange-600' : 'text-gray-700'}>
                        {row.amount > 0 ? fmtKRW(row.amount) : '—'}
                      </span>
                      {row.withholdingTax && (
                        <p className="text-[10px] text-purple-500 mt-0.5">
                          원천징수 {fmtKRW(row.withholdingTax)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-500 leading-relaxed">
                      {row.detail}
                      {row.adjType === '유보추인' && row.reserveDelta !== 0 && (
                        <p className="text-orange-500 font-medium mt-0.5">
                          유보 해소: {fmtKRW(Math.abs(row.reserveDelta))}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pl-3 text-right tabular-nums">
                      <span className={`font-bold text-sm ${
                        row.runningReserve > 0 ? 'text-amber-600'
                        : row.runningReserve < 0 ? 'text-red-500'
                        : 'text-gray-400'
                      }`}>
                        {row.runningReserve !== 0 ? signKRW(row.runningReserve) : '₩ 0'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label:  '총 익금불산입',
            value:  fmtKRW(rows.filter((r) => r.adjType === '익금불산입').reduce((s, r) => s + r.amount, 0)),
            sub:    '유보 발생',
            color:  'border-green-400',
            textColor: 'text-green-700',
          },
          {
            label:  '총 손금불산입',
            value:  fmtKRW(rows.filter((r) => r.adjType === '손금불산입').reduce((s, r) => s + r.amount, 0)),
            sub:    '유보 발생',
            color:  'border-red-400',
            textColor: 'text-red-600',
          },
          {
            label:  '최종 유보잔액',
            value:  finalReserve !== 0 ? signKRW(finalReserve) : '₩ 0',
            sub:    finalReserve > 0 ? '추인 예정' : '완전 해소',
            color:  finalReserve > 0 ? 'border-amber-400' : 'border-emerald-400',
            textColor: finalReserve > 0 ? 'text-amber-600' : 'text-emerald-600',
          },
          {
            label:  '배당 원천징수',
            value:  totalWithholding > 0 ? fmtKRW(totalWithholding) : '₩ 0',
            sub:    '세율 14%',
            color:  'border-purple-400',
            textColor: 'text-purple-700',
          },
        ].map(({ label, value, sub, color, textColor }) => (
          <div key={label} className={`bg-white rounded-xl shadow-sm p-4 border-t-4 ${color}`}>
            <p className="text-xs text-gray-400 font-medium mb-2">{label}</p>
            <p className={`text-lg font-extrabold tabular-nums ${textColor}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
