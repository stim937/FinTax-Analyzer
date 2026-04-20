import { useState, useMemo } from 'react'
import FormattedInput from './ui/FormattedInput'

// ── 상수 ──────────────────────────────────────────────────
const BROKERS   = ['미래에셋', '삼성', 'KB', 'NH', '키움', '기타']
const FUNDS     = ['자체투자', '펀드A', '펀드B', '기타']
const TX_TYPES  = [
  '매수',
  '기말평가(평가이익)',
  '기말평가(평가손실)',
  '배당수령',
  '매도',
]

const TYPE_STYLE = {
  '매수':             { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  '기말평가(평가이익)': { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400'  },
  '기말평가(평가손실)': { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-400'    },
  '배당수령':          { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  '매도':             { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
}

// ── 샘플 데이터 ───────────────────────────────────────────
let _nextId = 4
const INITIAL_ROWS = [
  { id: 1, date: '2025-01-15', name: '삼성전자',        type: '매수',             qty: 100, price: 70000,  memo: '' },
  { id: 2, date: '2025-12-31', name: '삼성전자',        type: '기말평가(평가이익)', qty: 100, price: 7000,   memo: '기말 공정가치 평가' },
  { id: 3, date: '2025-03-22', name: 'LG에너지솔루션', type: '매수',             qty: 50,  price: 400000, memo: '' },
]

// ── 포맷 헬퍼 ─────────────────────────────────────────────
const fmtKRW = (n) =>
  n === 0 ? '₩ 0' : `₩ ${Math.abs(n).toLocaleString('ko-KR')}`

const inputCls =
  'border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-midblue focus:border-transparent transition w-full'

const selectCls = `${inputCls} bg-white`

// ── 거래유형 배지 ─────────────────────────────────────────
function TypeBadge({ type }) {
  const s = TYPE_STYLE[type] ?? { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {type}
    </span>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function TaxEntry({ onSave }) {
  // 헤더
  const [company,    setCompany]    = useState('FinTax 자산운용')
  const [broker,     setBroker]     = useState('미래에셋')
  const [fund,       setFund]       = useState('자체투자')
  const [taxYear,    setTaxYear]    = useState(2025)

  // 거래 행
  const [rows, setRows] = useState(INITIAL_ROWS)

  // ── 행 편집 ────────────────────────────────────────────
  const update = (id, field, value) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { id: _nextId++, date: '', name: '', type: '매수', qty: 0, price: 0, memo: '' },
    ])

  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id))

  // ── 집계 ───────────────────────────────────────────────
  const summary = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const amt = r.qty * r.price
      if (!map[r.type]) map[r.type] = { count: 0, total: 0 }
      map[r.type].count += 1
      map[r.type].total += amt
    }
    return Object.entries(map).sort(
      (a, b) => TX_TYPES.indexOf(a[0]) - TX_TYPES.indexOf(b[0]),
    )
  }, [rows])

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + r.qty * r.price, 0),
    [rows],
  )

  // ── 저장 ───────────────────────────────────────────────
  const handleSave = () => {
    const data = {
      header: { company, broker, fund, taxYear },
      transactions: rows.map((r) => ({ ...r, amount: r.qty * r.price })),
      summary: Object.fromEntries(summary),
      grandTotal,
      savedAt: new Date().toISOString(),
    }
    onSave?.(data)
    alert(`✅ ${taxYear}년 거래 데이터 ${rows.length}건이 저장되었습니다.`)
  }

  return (
    <div className="space-y-6">
      {/* ── 거래 입력 헤더 ── */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3 mb-5">
          세무조정 기본 정보
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              회사명
            </label>
            <input
              type="text" className={inputCls} value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="회사명 입력"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              증권사
            </label>
            <select className={selectCls} value={broker} onChange={(e) => setBroker(e.target.value)}>
              {BROKERS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              펀드 구분
            </label>
            <select className={selectCls} value={fund} onChange={(e) => setFund(e.target.value)}>
              {FUNDS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              과세연도
            </label>
            <input
              type="number" className={inputCls} value={taxYear} min={2000} max={2099}
              onChange={(e) => setTaxYear(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ── 거래 내역 입력 ── */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
          <h2 className="text-base font-semibold text-gray-700">
            거래 내역
            <span className="ml-2 text-xs font-normal text-gray-400">{rows.length}건</span>
          </h2>
          <button
            onClick={addRow}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-midblue transition"
          >
            <span className="text-base leading-none">+</span> 행 추가
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left py-2 pr-2 w-32">거래일</th>
                <th className="text-left py-2 px-2 w-36">종목명</th>
                <th className="text-left py-2 px-2 w-44">거래유형</th>
                <th className="text-right py-2 px-2 w-24">수량</th>
                <th className="text-right py-2 px-2 w-28">단가 (원)</th>
                <th className="text-right py-2 px-2 w-32">금액 (원)</th>
                <th className="text-left py-2 px-2">메모</th>
                <th className="py-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => {
                const amount = r.qty * r.price
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2 pr-2">
                      <input
                        type="date" className={inputCls} value={r.date}
                        onChange={(e) => update(r.id, 'date', e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text" className={inputCls} value={r.name}
                        placeholder="종목명"
                        onChange={(e) => update(r.id, 'name', e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        className={selectCls} value={r.type}
                        onChange={(e) => update(r.id, 'type', e.target.value)}
                      >
                        {TX_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <FormattedInput
                        className={`${inputCls} text-right`} value={r.qty} min={0}
                        onChange={(v) => update(r.id, 'qty', v)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <FormattedInput
                        className={`${inputCls} text-right`} value={r.price} min={0}
                        onChange={(v) => update(r.id, 'price', v)}
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-semibold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                        {amount.toLocaleString('ko-KR')}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text" className={inputCls} value={r.memo}
                        placeholder="선택 입력"
                        onChange={(e) => update(r.id, 'memo', e.target.value)}
                      />
                    </td>
                    <td className="py-2 pl-1">
                      <button
                        onClick={() => removeRow(r.id)}
                        className="text-gray-300 hover:text-red-400 transition text-base leading-none"
                        aria-label="행 삭제"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={5} className="py-3 pl-3 text-sm font-semibold text-gray-500">
                  합계
                </td>
                <td className="py-3 px-2 text-right font-extrabold text-navy tabular-nums">
                  {grandTotal.toLocaleString('ko-KR')}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── 하단: 요약 테이블 + 저장 버튼 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 유형별 집계 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3 mb-4">
            거래 유형별 요약
          </h2>
          {summary.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">거래 내역을 입력하세요</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left pb-2">거래유형</th>
                  <th className="text-right pb-2">건수</th>
                  <th className="text-right pb-2">합계금액 (원)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {summary.map(([type, { count, total }]) => (
                  <tr key={type} className="hover:bg-gray-50">
                    <td className="py-2.5">
                      <TypeBadge type={type} />
                    </td>
                    <td className="py-2.5 text-right text-gray-600 tabular-nums">
                      {count}건
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-700 tabular-nums">
                      {total.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="pt-3 text-sm font-bold text-gray-600">
                    총계 ({rows.length}건)
                  </td>
                  <td />
                  <td className="pt-3 text-right font-extrabold text-navy tabular-nums">
                    {grandTotal.toLocaleString('ko-KR')}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* 저장 패널 */}
        <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3 mb-4">
              저장 및 내보내기
            </h2>
            <dl className="space-y-2 text-sm">
              {[
                ['회사명',    company   ],
                ['증권사',    broker    ],
                ['펀드 구분', fund      ],
                ['과세연도',  `${taxYear}년`],
                ['거래 건수', `${rows.length}건`],
                ['거래 합계', fmtKRW(grandTotal)],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-gray-400">{label}</dt>
                  <dd className="font-semibold text-gray-700">{val}</dd>
                </div>
              ))}
            </dl>
          </div>

          <button
            onClick={handleSave}
            disabled={rows.length === 0}
            className="mt-6 w-full py-3 rounded-xl bg-navy text-white font-bold text-sm
                       hover:bg-midblue transition disabled:opacity-40 disabled:cursor-not-allowed
                       shadow-sm hover:shadow-md"
          >
            💾 거래 데이터 저장
          </button>
        </div>
      </div>
    </div>
  )
}
