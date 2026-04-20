const DEFAULT_SUMMARY = [
  { icon: '📊', label: '총 평가자산',    valueKey: 'totalAssets',  fallback: '₩ 0' },
  { icon: '⚠️', label: '포트폴리오 VaR', valueKey: 'portfolioVaR', fallback: '0.00%' },
  { icon: '📋', label: '세무 유보 잔액', valueKey: 'taxReserve',   fallback: '₩ 0' },
]

const HISTORY_COLS = ['종목명', '유형', '날짜', '결과']

const TYPE_STYLE = {
  '채권계산': 'bg-navy/10 text-navy',
  '주식평가': 'bg-emerald-100 text-emerald-700',
  'VaR분석':  'bg-purple-100 text-purple-700',
  '세무검증': 'bg-amber-100 text-amber-700',
}
function TypeBadge({ type }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLE[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {type}
    </span>
  )
}

const QUICK_ACTIONS = ['채권 계산', '주식 평가', '세무 검증']

function SummaryCard({ icon, label, value }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden flex-1 min-w-0">
      <div className="h-1 bg-navy" />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500 font-medium">{label}</span>
          <span className="text-2xl leading-none">{icon}</span>
        </div>
        <p className="text-2xl font-bold text-gray-800 truncate">{value}</p>
      </div>
    </div>
  )
}

export default function Dashboard({ summaryData = {}, onQuickAction, history = [] }) {
  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="flex gap-4">
        {DEFAULT_SUMMARY.map(({ icon, label, valueKey, fallback }) => (
          <SummaryCard
            key={valueKey}
            icon={icon}
            label={label}
            value={summaryData[valueKey] ?? fallback}
          />
        ))}
      </div>

      {/* 하단 2단 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 계산 이력 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">최근 계산 이력</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {HISTORY_COLS.map((col) => (
                    <th
                      key={col}
                      className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={HISTORY_COLS.length} className="py-10 text-center text-gray-400 text-sm">
                      계산 이력이 없습니다
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-gray-700">{h.name}</td>
                      <td className="py-2.5 px-3"><TypeBadge type={h.type} /></td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs whitespace-nowrap">{h.date}</td>
                      <td className="py-2.5 px-3 text-gray-600 text-xs">{h.result}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 빠른 계산 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">빠른 계산</h2>
          <div className="flex flex-col gap-3">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => onQuickAction?.(action)}
                className="w-full py-3 px-4 rounded-lg border-2 border-accent text-midblue font-medium text-sm
                           hover:bg-accent hover:border-midblue transition-colors text-left"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
