import { useState, useMemo, useEffect } from 'react'
import UITooltip from './ui/Tooltip'
import FormattedInput from './ui/FormattedInput'
import Spinner from './ui/Spinner'
import { generateSampleReturns, DEFAULT_HOLDINGS } from './portfolioDefaults'
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

function calcVaR(returns, portfolioValue) {
  const sorted = [...returns].sort((a, b) => a - b)
  const var95 = Math.abs(sorted[Math.floor(sorted.length * 0.05)])
  const var99 = Math.abs(sorted[Math.floor(sorted.length * 0.01)])
  return {
    var95: (var95 / 100) * portfolioValue,
    var99: (var99 / 100) * portfolioValue,
    var95pct: var95,
    var99pct: var99,
    raw95: -var95,
    raw99: -var99,
  }
}

const BIN_WIDTH = 0.5

function buildHistogram(returnsPct) {
  if (!returnsPct.length) {
    return null
  }

  const minR = Math.min(...returnsPct)
  const maxR = Math.max(...returnsPct)
  const start = Math.floor(minR / BIN_WIDTH) * BIN_WIDTH
  const end = Math.ceil(maxR / BIN_WIDTH) * BIN_WIDTH

  const bins = []
  for (let bin = start; bin <= end + BIN_WIDTH * 0.01; bin = +(bin + BIN_WIDTH).toFixed(8)) {
    bins.push(+bin.toFixed(8))
  }

  const counts = new Array(bins.length).fill(0)
  for (const value of returnsPct) {
    const index = Math.floor((value - start) / BIN_WIDTH)
    if (index >= 0 && index < counts.length) {
      counts[index] += 1
    }
  }

  const labels = bins.map((bin) => `${bin >= 0 ? '+' : ''}${bin.toFixed(1)}`)
  const getIdx = (pct) => Math.max(-0.5, Math.min(bins.length - 0.5, (pct - start) / BIN_WIDTH))

  return { labels, counts, getIdx }
}

const fmtKRW = (value) => `₩ ${Math.round(Math.abs(value)).toLocaleString('ko-KR')}`
const fmtPct = (value) => (
  value.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + '%'
)

const inputCls =
  'border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-midblue focus:border-transparent transition w-full'

function ReturnHistogram({ returnsPct, var95pct, var99pct }) {
  const hist = useMemo(() => buildHistogram(returnsPct), [returnsPct])
  if (!hist) {
    return null
  }

  const { labels, counts, getIdx } = hist

  const data = {
    labels,
    datasets: [
      {
        label: '빈도',
        data: counts,
        backgroundColor: labels.map((label) => {
          const value = parseFloat(label)
          if (value <= -var99pct) {
            return 'rgba(239,68,68,0.75)'
          }
          if (value <= -var95pct) {
            return 'rgba(249,115,22,0.6)'
          }
          return 'rgba(46,95,172,0.45)'
        }),
        borderColor: labels.map((label) => {
          const value = parseFloat(label)
          if (value <= -var99pct) {
            return 'rgba(239,68,68,1)'
          }
          if (value <= -var95pct) {
            return 'rgba(249,115,22,1)'
          }
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
          label: (item) => ` 빈도: ${item.raw}일`,
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
          callback: (_, index) => {
            const label = hist.labels[index]
            return label ? `${label}%` : ''
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

let nextHoldingId = 4

export default function PortfolioRisk({
  onUpdate,
  holdings,
  setHoldings,
  returnsText,
  setReturnsText,
  cloudState,
  cloudActions,
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  const totalValue = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.qty * holding.price, 0),
    [holdings],
  )

  const holdingsWithWeight = useMemo(
    () => holdings.map((holding) => ({
      ...holding,
      value: holding.qty * holding.price,
      weight: totalValue > 0 ? (holding.qty * holding.price) / totalValue * 100 : 0,
    })),
    [holdings, totalValue],
  )

  const returnsPct = useMemo(() => returnsText
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => !Number.isNaN(value) && Number.isFinite(value)), [returnsText])

  const varResult = useMemo(() => {
    if (returnsPct.length < 20 || totalValue <= 0) {
      return null
    }
    return calcVaR(returnsPct, totalValue)
  }, [returnsPct, totalValue])

  useEffect(() => {
    onUpdate?.({ totalValue, var95pct: varResult?.var95pct ?? 0 })
  }, [onUpdate, totalValue, varResult])

  useEffect(() => {
    const maxId = holdings.reduce((currentMax, holding) => Math.max(currentMax, Number(holding.id) || 0), 0)
    nextHoldingId = Math.max(nextHoldingId, maxId + 1)
  }, [holdings])

  const updateHolding = (id, field, value) => {
    setHoldings((prev) => prev.map((holding) => (
      holding.id === id ? { ...holding, [field]: value } : holding
    )))
  }

  const addRow = () => {
    setHoldings((prev) => [
      ...prev,
      { id: nextHoldingId++, name: '', ticker: '', qty: 1, price: 0 },
    ])
  }

  const removeRow = (id) => {
    setHoldings((prev) => prev.filter((holding) => holding.id !== id))
  }

  const handleRefreshPrices = async () => {
    setRefreshing(true)
    setRefreshMsg('')

    try {
      const updated = await Promise.all(
        holdings.map(async (holding) => {
          if (!holding.ticker) {
            return holding
          }

          try {
            const response = await fetch(`/api/market/stock?ticker=${holding.ticker}`)
            const data = await response.json()
            return data.price ? { ...holding, price: data.price } : holding
          } catch {
            return holding
          }
        }),
      )

      setHoldings(updated)
      setRefreshMsg('시세 업데이트 완료')
    } catch {
      setRefreshMsg('업데이트 실패')
    } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshMsg(''), 3000)
    }
  }

  const {
    isSupabaseConfigured,
    userEmail,
    isSaving,
    isRestoring,
    saveError,
    restoreError,
    notice,
    lastSavedAt,
    hasRemoteSnapshot,
    hasCheckedRemote,
  } = cloudState ?? {}

  const { onSave, onRestore } = cloudActions ?? {}

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-gray-700">클라우드 저장</h2>
            <p className="text-sm text-gray-500">
              로그인 계정으로 포트폴리오를 저장하고, 다음 로그인 때 자동으로 복원합니다.
            </p>
            {userEmail && (
              <p className="text-xs text-gray-500">
                저장 계정: <span className="font-semibold text-gray-700">{userEmail}</span>
              </p>
            )}
            {!isSupabaseConfigured && (
              <p className="text-xs text-amber-600">
                `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정하면 저장 기능이 활성화됩니다.
              </p>
            )}
            {lastSavedAt && (
              <p className="text-xs text-gray-400">마지막 저장: {lastSavedAt}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRestore}
              disabled={!isSupabaseConfigured || isRestoring || isSaving}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:border-midblue hover:text-midblue transition disabled:opacity-50"
            >
              {isRestoring ? '불러오는 중...' : '저장본 다시 불러오기'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!isSupabaseConfigured || isSaving || isRestoring}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '지금 저장'}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {saveError}
            </div>
          )}
          {restoreError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {restoreError}
            </div>
          )}
          {notice && !saveError && !restoreError && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          )}
          {isSupabaseConfigured && hasCheckedRemote && !hasRemoteSnapshot && !notice && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              아직 저장된 포트폴리오가 없습니다. 현재 내용을 다듬은 뒤 저장해 주세요.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-base font-semibold text-gray-700">포트폴리오 구성</h2>
            <div className="flex items-center gap-2">
              {refreshMsg && (
                <span className={`text-xs ${refreshMsg.includes('실패') ? 'text-red-500' : 'text-emerald-600'}`}>
                  {refreshMsg}
                </span>
              )}
              <button
                onClick={handleRefreshPrices}
                disabled={refreshing}
                title="종목코드로 실시간 시세 조회"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-midblue text-midblue text-xs font-semibold hover:bg-accent transition disabled:opacity-40"
              >
                {refreshing ? <Spinner size="sm" label="" /> : '📡'} 시세 갱신
              </button>
              <button
                onClick={addRow}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-midblue transition"
              >
                <span className="text-base leading-none">+</span> 종목 추가
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left pb-2 pr-2">종목명</th>
                  <th className="text-left pb-2 px-1 w-20">종목코드</th>
                  <th className="text-right pb-2 px-2">수량</th>
                  <th className="text-right pb-2 px-2">현재가(원)</th>
                  <th className="text-right pb-2 px-2">비중(%)</th>
                  <th className="pb-2 w-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {holdingsWithWeight.length > 0 ? holdingsWithWeight.map((holding) => (
                  <tr key={holding.id}>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        className={inputCls}
                        value={holding.name}
                        placeholder="종목명"
                        onChange={(event) => updateHolding(holding.id, 'name', event.target.value)}
                      />
                    </td>
                    <td className="py-2 px-1">
                      <input
                        type="text"
                        className={`${inputCls} text-center`}
                        value={holding.ticker ?? ''}
                        placeholder="000000"
                        maxLength={6}
                        onChange={(event) => updateHolding(holding.id, 'ticker', event.target.value.replace(/\D/g, ''))}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <FormattedInput
                        className={`${inputCls} text-right`}
                        value={holding.qty}
                        min={0}
                        onChange={(value) => updateHolding(holding.id, 'qty', value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <FormattedInput
                        className={`${inputCls} text-right`}
                        value={holding.price}
                        min={0}
                        onChange={(value) => updateHolding(holding.id, 'price', value)}
                      />
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-gray-600">
                      {holding.weight.toFixed(1)}%
                    </td>
                    <td className="py-2 pl-1">
                      <button
                        onClick={() => removeRow(holding.id)}
                        className="text-gray-300 hover:text-red-400 transition text-base leading-none"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="py-10 text-center">
                      <div className="space-y-2">
                        <p className="text-3xl">🗂️</p>
                        <p className="text-sm font-semibold text-gray-500">포트폴리오가 비어 있습니다</p>
                        <p className="text-xs text-gray-400">
                          저장본이 없거나 모두 삭제된 상태입니다. 종목을 추가해 다시 시작하세요.
                        </p>
                        <button
                          type="button"
                          onClick={addRow}
                          className="mt-2 px-3 py-1.5 rounded-lg border border-midblue text-midblue text-xs font-semibold hover:bg-accent transition"
                        >
                          첫 종목 추가
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between bg-accent rounded-lg px-4 py-3">
            <span className="text-sm font-semibold text-navy">총 포트폴리오 가치</span>
            <span className="text-lg font-extrabold text-navy">{fmtKRW(totalValue)}</span>
          </div>
        </div>

        <div className="space-y-5">
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
              onChange={(event) => setReturnsText(event.target.value)}
              placeholder="일별 수익률을 쉼표로 구분하여 입력하세요"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              입력된 데이터: <span className="font-semibold text-gray-600">{returnsPct.length}개</span>
              {returnsPct.length < 20 && returnsPct.length > 0 && (
                <span className="text-amber-500 ml-2">⚠ 최소 20개 이상 필요</span>
              )}
            </p>
          </div>

          {varResult ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl shadow-sm p-4 border-t-4 border-orange-400">
                  <span className="text-xs font-semibold text-orange-500 mb-2 block">
                    <UITooltip text="95% VaR — 정상 시장 환경에서 하루 손실이 이 금액을 초과할 확률이 5%임을 의미합니다.">
                      95% VaR (신뢰수준)
                    </UITooltip>
                  </span>
                  <p className="text-xl font-extrabold text-gray-800">{fmtKRW(varResult.var95)}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{fmtPct(varResult.var95pct)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-t-4 border-red-500">
                  <span className="text-xs font-semibold text-red-500 mb-2 block">
                    <UITooltip text="99% VaR — 손실이 이 금액을 초과할 확률이 1%로, 95% VaR보다 극단적 리스크 시나리오를 나타냅니다.">
                      99% VaR (신뢰수준)
                    </UITooltip>
                  </span>
                  <p className="text-xl font-extrabold text-gray-800">{fmtKRW(varResult.var99)}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{fmtPct(varResult.var99pct)}</p>
                </div>
              </div>
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
              ) : holdingsWithWeight.length === 0 ? (
                <>
                  <p className="text-3xl mb-2">📦</p>
                  <p className="font-semibold text-gray-500 text-sm mb-1">보유 종목이 없어 VaR를 계산할 수 없습니다</p>
                  <p className="text-xs text-gray-400">종목을 추가하거나 저장된 포트폴리오를 불러와 주세요</p>
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
