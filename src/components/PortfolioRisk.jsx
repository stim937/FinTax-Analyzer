import { useState, useMemo, useEffect, useRef } from 'react'
import UITooltip from './ui/Tooltip'
import FormattedInput from './ui/FormattedInput'
import Spinner from './ui/Spinner'
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import AnnotationPlugin from 'chartjs-plugin-annotation'
import { Bar, Doughnut } from 'react-chartjs-2'

const CenterTextPlugin = {
  id: 'centerText',
  afterDatasetsDraw(chart, _args, pluginOptions) {
    if (!pluginOptions?.change) {
      return
    }

    const arc = chart.getDatasetMeta(0)?.data?.[0]
    if (!arc) {
      return
    }

    const { ctx } = chart
    const { x, y, innerRadius } = arc
    const titleY = y - innerRadius * 0.12
    const changeY = y + innerRadius * 0.18

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.fillStyle = pluginOptions.titleColor ?? '#9CA3AF'
    ctx.font = `600 ${Math.max(11, innerRadius * 0.16)}px sans-serif`
    ctx.fillText(pluginOptions.title, x, titleY)

    ctx.fillStyle = pluginOptions.changeColor ?? '#059669'
    ctx.font = `800 ${Math.max(13, innerRadius * 0.24)}px sans-serif`
    ctx.fillText(pluginOptions.change, x, changeY)

    ctx.restore()
  },
}

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, AnnotationPlugin, CenterTextPlugin)

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
const MIN_VAR_OBSERVATIONS = 20

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createSeededRandom(seed) {
  let state = seed || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function generateBackfillReturns(seedSource, count) {
  if (count <= 0) {
    return []
  }

  const rand = createSeededRandom(hashString(seedSource))
  return Array.from({ length: count }, () => {
    const u1 = Math.max(rand(), 1e-9)
    const u2 = Math.max(rand(), 1e-9)
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return Number((z * 1.15).toFixed(4))
  })
}

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

const DONUT_COLORS = ['#1D4ED8', '#0F766E', '#F97316', '#7C3AED', '#DC2626', '#0891B2', '#65A30D']

let nextHoldingId = 4

export default function PortfolioRisk({
  onUpdate,
  holdings,
  setHoldings,
  returnSeries,
  cloudState,
  cloudActions,
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [lookupState, setLookupState] = useState({})
  const lookupRequestsRef = useRef({})

  const totalValue = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.qty * holding.currentPrice, 0),
    [holdings],
  )

  const holdingsWithWeight = useMemo(
    () => holdings.map((holding) => ({
      ...holding,
      value: holding.qty * holding.currentPrice,
      costValue: holding.qty * holding.avgPrice,
      returnPct: holding.avgPrice > 0
        ? ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100
        : 0,
      weight: totalValue > 0 ? (holding.qty * holding.currentPrice) / totalValue * 100 : 0,
    })),
    [holdings, totalValue],
  )

  const totalCost = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.qty * holding.avgPrice, 0),
    [holdings],
  )

  const totalProfit = totalValue - totalCost
  const totalReturnPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0

  const donutData = useMemo(() => {
    const items = holdingsWithWeight.filter((holding) => holding.value > 0)

    if (items.length === 0) {
      return null
    }

    return {
      labels: items.map((holding) => holding.name || holding.ticker || '미입력 종목'),
      datasets: [
        {
          data: items.map((holding) => holding.value),
          backgroundColor: items.map((_, index) => DONUT_COLORS[index % DONUT_COLORS.length]),
          borderColor: '#FFFFFF',
          borderWidth: 3,
          hoverOffset: 4,
        },
      ],
    }
  }, [holdingsWithWeight])

  const donutOptions = useMemo(() => ({
    cutout: '68%',
    plugins: {
      legend: { display: false },
      centerText: {
        title: 'PORTFOLIO',
        change: `${totalReturnPct >= 0 ? '+' : ''}${fmtPct(totalReturnPct)}`,
        changeColor: totalReturnPct >= 0 ? '#059669' : '#EF4444',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = Number(context.raw) || 0
            const weight = totalValue > 0 ? (value / totalValue) * 100 : 0
            return `${context.label}: ${fmtKRW(value)} · ${weight.toFixed(1)}%`
          },
        },
      },
    },
  }), [totalValue])

  const lookupFeedback = useMemo(() => {
    const entries = Object.entries(lookupState)
      .filter(([, state]) => state?.message && !state?.loading && state?.tone !== 'success')
      .sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

    if (entries.length === 0) {
      return null
    }

    const [id, state] = entries[0]
    const holding = holdings.find((item) => String(item.id) === id)
    return {
      message: state.message,
      tone: state.tone,
      label: holding?.name?.trim() || holding?.ticker || '현재 행',
    }
  }, [holdings, lookupState])

  const returnRows = useMemo(
    () => (Array.isArray(returnSeries) ? returnSeries : []),
    [returnSeries],
  )

  const actualReturnsPct = useMemo(
    () => returnRows
      .map((row) => Number(row.returnPct))
      .filter((value) => !Number.isNaN(value) && Number.isFinite(value)),
    [returnRows],
  )

  const backfillSeed = useMemo(
    () => JSON.stringify(
      holdings.map(({ ticker, qty, avgPrice }) => ({
        ticker,
        qty,
        avgPrice,
      })),
    ),
    [holdings],
  )

  const backfillReturnsPct = useMemo(
    () => generateBackfillReturns(backfillSeed, Math.max(0, MIN_VAR_OBSERVATIONS - actualReturnsPct.length)),
    [actualReturnsPct.length, backfillSeed],
  )

  const returnsPct = useMemo(
    () => [...backfillReturnsPct, ...actualReturnsPct],
    [actualReturnsPct, backfillReturnsPct],
  )

  const varResult = useMemo(() => {
    if (returnsPct.length < MIN_VAR_OBSERVATIONS || totalValue <= 0) {
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
      { id: nextHoldingId++, name: '', ticker: '', qty: 1, avgPrice: 0, currentPrice: 0 },
    ])
  }

  const removeRow = (id) => {
    setHoldings((prev) => prev.filter((holding) => holding.id !== id))
    setLookupState((prev) => {
      if (!prev[id]) {
        return prev
      }

      const next = { ...prev }
      delete next[id]
      return next
    })
    delete lookupRequestsRef.current[id]
  }

  const setLookupStatus = (id, patch) => {
    setLookupState((prev) => ({
      ...prev,
      [id]: {
        loading: false,
        message: '',
        tone: '',
        lastKey: '',
        ...prev[id],
        updatedAt: Date.now(),
        ...patch,
      },
    }))
  }

  const lookupHolding = async (id, field, rawValue) => {
    const normalized = field === 'ticker'
      ? rawValue.replace(/\D/g, '')
      : rawValue.trim()

    if (!normalized) {
      setLookupStatus(id, { loading: false, message: '', tone: '', lastKey: '' })
      return
    }

    if (field === 'ticker' && normalized.length !== 6) {
      setLookupStatus(id, {
        loading: false,
        message: '종목코드는 6자리 숫자로 입력해 주세요.',
        tone: 'error',
        lastKey: '',
      })
      return
    }

    const requestKey = `${field}:${normalized.toLowerCase()}`
    const currentRequest = lookupRequestsRef.current[id]
    const currentState = lookupState[id]

    if (currentRequest === requestKey || currentState?.lastKey === requestKey) {
      return
    }

    lookupRequestsRef.current[id] = requestKey
    setLookupStatus(id, { loading: true, message: '', tone: '', lastKey: requestKey })

    try {
      const searchRes = await fetch(`/api/market/search?q=${encodeURIComponent(normalized)}`)
      const searchData = await searchRes.json()

      if (!searchRes.ok || !searchData.ticker) {
        throw new Error(searchData.error || '종목을 찾을 수 없습니다.')
      }

      const stockRes = await fetch(`/api/market/stock?ticker=${encodeURIComponent(searchData.ticker)}`)
      const stockData = await stockRes.json()
      const hasStockError = !stockRes.ok || stockData.error

      setHoldings((prev) => prev.map((holding) => {
        if (holding.id !== id) {
          return holding
        }

        return {
          ...holding,
          ticker: searchData.ticker,
          name: stockData.name || searchData.name || holding.name,
          currentPrice: Number(stockData.price) > 0 ? Number(stockData.price) : holding.currentPrice,
        }
      }))

      if (hasStockError) {
        const fallbackMessage = stockData.error || '종목명은 찾았지만 현재가 조회는 실패했습니다.'

        setLookupStatus(id, {
          loading: false,
          message: fallbackMessage,
          tone: 'warn',
          lastKey: requestKey,
        })
        return
      }

      setLookupStatus(id, {
        loading: false,
        message: '',
        tone: '',
        lastKey: requestKey,
      })
    } catch (error) {
      setLookupStatus(id, {
        loading: false,
        message: error.message || '종목 검색에 실패했습니다.',
        tone: 'error',
        lastKey: '',
      })
    } finally {
      if (lookupRequestsRef.current[id] === requestKey) {
        delete lookupRequestsRef.current[id]
      }
    }
  }

  const handleLookupKeyDown = (event, holding, field) => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    lookupHolding(holding.id, field, event.currentTarget.value)
  }

  const handleRefreshPrices = async () => {
    setRefreshing(true)
    setRefreshMsg('')

    try {
      const updated = []
      for (const holding of holdings) {
        if (!holding.ticker) {
          updated.push(holding)
          continue
        }

        try {
          const response = await fetch(`/api/market/stock?ticker=${holding.ticker}`)
          const data = await response.json()
          updated.push(Number(data?.price) > 0 ? { ...holding, currentPrice: Number(data.price) } : holding)
        } catch {
          updated.push(holding)
        }
      }

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
    isSaving,
    isRestoring,
    saveError,
    restoreError,
    notice,
    lastSavedAt,
    hasRemoteSnapshot,
    hasCheckedRemote,
    hasPortfolioChanges,
    returnHistoryLoading,
    returnHistoryError,
    lastCapturedAt,
  } = cloudState ?? {}

  const { onSave } = cloudActions ?? {}
  const hasManyHoldings = holdingsWithWeight.length >= 6

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <div className="relative mx-auto h-56 w-full max-w-[280px]">
            {donutData ? (
              <div className="absolute inset-0">
                <Doughnut data={donutData} options={donutOptions} plugins={[CenterTextPlugin]} />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-gray-200 bg-gray-50 text-sm font-semibold text-gray-400">
                종목을 추가하면 비중이 표시됩니다
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-700">포트폴리오 요약</h2>
              <p className="mt-1 text-sm text-gray-500">
                저장된 구성은 유지하고, 현재가는 실시간 조회값으로만 계산합니다.
              </p>
              {lastSavedAt && (
                <p className="mt-1 text-xs text-gray-400">마지막 저장: {lastSavedAt}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-400">총 평가금액</p>
                <p className="mt-1 text-lg font-extrabold text-gray-800">{fmtKRW(totalValue)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-400">총 매입금액</p>
                <p className="mt-1 text-lg font-extrabold text-gray-800">{fmtKRW(totalCost)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-400">총 수익률</p>
                <p className={`mt-1 text-lg font-extrabold ${totalReturnPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {totalReturnPct >= 0 ? '+' : ''}{fmtPct(totalReturnPct)}
                </p>
              </div>
            </div>

            {donutData && (
              <div className="flex flex-wrap gap-2">
                {holdingsWithWeight
                  .filter((holding) => holding.value > 0)
                  .map((holding, index) => (
                    <div key={holding.id} className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
                      />
                      <span>{holding.name || holding.ticker || '미입력 종목'}</span>
                      <span className="font-semibold text-gray-800">{holding.weight.toFixed(1)}%</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-6">
        <div className="min-w-0 bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-base font-semibold text-gray-700">포트폴리오 구성</h2>
            <div className="flex items-center gap-2">
              <div className="min-w-[96px] text-right">
                {refreshMsg && (
                  <span className={`text-xs whitespace-nowrap ${refreshMsg.includes('실패') ? 'text-red-500' : 'text-emerald-600'}`}>
                    {refreshMsg}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={!isSupabaseConfigured || isSaving || isRestoring || !hasPortfolioChanges}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {isSaving ? <Spinner size="xs" label="" /> : '저장'}
              </button>
              <button
                onClick={handleRefreshPrices}
                disabled={refreshing}
                title="종목코드로 실시간 시세 조회"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-midblue text-midblue text-xs font-semibold hover:bg-accent transition disabled:opacity-40"
              >
                {refreshing ? <Spinner size="sm" label="" /> : '📡'} 시세 갱신
              </button>
            </div>
          </div>

          <div className="mb-4 space-y-2">
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
                아직 저장된 포트폴리오가 없습니다. 종목 구성을 입력한 뒤 저장해 주세요.
              </div>
            )}
            {!isSupabaseConfigured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Supabase 설정이 없어서 저장과 불러오기를 사용할 수 없습니다.
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className={hasManyHoldings ? 'max-h-[332px] overflow-y-auto pr-1' : ''}>
              <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left pb-2 pr-2">종목명</th>
                  <th className="text-left pb-2 px-1 w-20">종목코드</th>
                  <th className="text-right pb-2 px-2 w-24">수량</th>
                  <th className="text-right pb-2 px-2">평단가(원)</th>
                  <th className="text-right pb-2 px-2">현재가(원)</th>
                  <th className="text-right pb-2 px-2">수익률(%)</th>
                  <th className="text-right pb-2 px-2">비중(%)</th>
                  <th className="pb-2 w-6" />
                </tr>
              </thead>
                <tbody className="divide-y divide-gray-50">
                  {holdingsWithWeight.length > 0 ? holdingsWithWeight.map((holding) => (
                    <tr key={holding.id}>
                      <td className="py-2 pr-2">
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              type="text"
                              className={`${inputCls} pr-8`}
                              value={holding.name}
                              placeholder="종목명"
                              onChange={(event) => {
                                updateHolding(holding.id, 'name', event.target.value)
                                setLookupStatus(holding.id, { message: '', tone: '', lastKey: '' })
                              }}
                              onBlur={(event) => lookupHolding(holding.id, 'name', event.target.value)}
                              onKeyDown={(event) => handleLookupKeyDown(event, holding, 'name')}
                            />
                            {lookupState[holding.id]?.loading && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                                <Spinner size="xs" label="" />
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-1">
                        <div className="relative">
                          <input
                            type="text"
                            className={`${inputCls} text-center`}
                            value={holding.ticker ?? ''}
                            placeholder="000000"
                            maxLength={6}
                            onChange={(event) => {
                              updateHolding(holding.id, 'ticker', event.target.value.replace(/\D/g, ''))
                              setLookupStatus(holding.id, { message: '', tone: '', lastKey: '' })
                            }}
                            onBlur={(event) => lookupHolding(holding.id, 'ticker', event.target.value)}
                            onKeyDown={(event) => handleLookupKeyDown(event, holding, 'ticker')}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2 w-24">
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
                          value={holding.avgPrice}
                          min={0}
                          onChange={(value) => updateHolding(holding.id, 'avgPrice', value)}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <FormattedInput
                          className={`${inputCls} text-right bg-gray-50 cursor-default select-none text-gray-500`}
                          value={holding.currentPrice}
                          min={0}
                          onChange={(value) => updateHolding(holding.id, 'currentPrice', value)}
                          readOnly
                        />
                      </td>
                      <td className={`py-2 px-2 text-right font-semibold ${holding.returnPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {holding.avgPrice > 0
                          ? `${holding.returnPct >= 0 ? '+' : ''}${fmtPct(holding.returnPct)}`
                          : '-'}
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
                      <td colSpan={8} className="py-10 text-center">
                        <div className="space-y-2">
                          <p className="text-3xl">🗂️</p>
                          <p className="text-sm font-semibold text-gray-500">포트폴리오가 비어 있습니다</p>
                          <p className="text-xs text-gray-400">
                            저장본이 없거나 모두 삭제된 상태입니다. 종목을 추가해 다시 시작하세요.
                          </p>
                          <button
                            type="button"
                            onClick={addRow}
                            className="mt-2 px-3 py-1.5 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 text-xs font-semibold hover:border-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
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
          </div>

          {holdingsWithWeight.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={addRow}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-500 transition hover:border-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <span className="text-base leading-none">+</span>
                종목 추가
              </button>
            </div>
          )}

          {lookupFeedback && (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
              lookupFeedback.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-600'
                : lookupFeedback.tone === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              {lookupFeedback.label}: {lookupFeedback.message}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between bg-accent rounded-lg px-4 py-3">
            <span className="text-sm font-semibold text-navy">총 포트폴리오 가치</span>
            <span className="text-lg font-extrabold text-navy">{fmtKRW(totalValue)}</span>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-700">일별 수익률 히스토리</h2>
                <p className="text-xs text-gray-400 mt-0.5">장 마감 후 저장된 포트폴리오 평가금액 기준</p>
              </div>
              {returnHistoryLoading && <Spinner size="xs" label="" />}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-400">최근 적재일</p>
                <p className="mt-1 text-sm font-bold text-gray-700">{returnRows.at(-1)?.tradeDate || '-'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-400">실제 누적 데이터</p>
                <p className="mt-1 text-sm font-bold text-gray-700">{actualReturnsPct.length}일</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-400">VaR 계산 상태</p>
                <p className={`mt-1 text-sm font-bold ${returnsPct.length >= MIN_VAR_OBSERVATIONS ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {returnsPct.length >= MIN_VAR_OBSERVATIONS ? '계산 가능' : `${MIN_VAR_OBSERVATIONS - returnsPct.length}일 더 필요`}
                </p>
              </div>
            </div>

            {lastCapturedAt && (
              <p className="mt-3 text-xs text-gray-400">마지막 스냅샷 적재: {lastCapturedAt}</p>
            )}

            {backfillReturnsPct.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                실제 수익률 {actualReturnsPct.length}일에 보조 데이터 {backfillReturnsPct.length}일을 더해 초기 VaR를 계산합니다.
              </div>
            )}

            {returnHistoryError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {returnHistoryError}
              </div>
            )}

            {returnRows.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-100">
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">기준일</th>
                        <th className="px-4 py-3 text-right">일별 수익률</th>
                        <th className="px-4 py-3 text-right">평가금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...returnRows].reverse().slice(0, 10).map((row) => (
                        <tr key={row.tradeDate}>
                          <td className="px-4 py-3 text-gray-600">{row.tradeDate}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${
                            Number(row.returnPct) >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {Number.isFinite(Number(row.returnPct))
                              ? `${Number(row.returnPct) >= 0 ? '+' : ''}${fmtPct(Number(row.returnPct))}`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-700">
                            {fmtKRW(row.portfolioValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                <p className="text-3xl mb-2">🕒</p>
                <p className="text-sm font-semibold text-gray-500">아직 적재된 일별 수익률이 없습니다</p>
                <p className="mt-1 text-xs text-gray-400">
                  Cron이 실행되면 날짜별 평가금액과 수익률이 자동으로 쌓입니다.
                </p>
              </div>
            )}
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
                  역사적 시뮬레이션 기준 · 실제 {actualReturnsPct.length}일
                  {backfillReturnsPct.length > 0 ? ` + 보조 ${backfillReturnsPct.length}일` : ''}
                  {' '}데이터 사용
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
              {actualReturnsPct.length === 0 ? (
                <>
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-semibold text-gray-500 text-sm mb-1">수익률 기록이 아직 없습니다</p>
                  <p className="text-xs text-gray-400">
                    일일 스냅샷이 누적되면 자동으로 VaR 계산에 사용됩니다
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
                    데이터 {returnsPct.length}개 — 최소 {MIN_VAR_OBSERVATIONS}개 필요
                  </p>
                  <p className="text-xs text-gray-400">일일 스냅샷이 더 누적되면 VaR를 계산할 수 있습니다</p>
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
