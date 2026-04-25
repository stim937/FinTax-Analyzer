import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import './index.css'

import { isSupabaseConfigured, supabase } from './lib/supabase'
import AuthGuard from './components/Auth/AuthGuard'
import Dashboard from './components/Dashboard'
import BondCalculator, { DEFAULT_BOND } from './components/BondCalculator'
import StockValuation, { DEFAULT_STOCK } from './components/StockValuation'
import PortfolioRisk from './components/PortfolioRisk'
import TaxEntry from './components/TaxEntry'
import TaxValidator from './components/TaxValidator'
import TaxReport from './components/TaxReport'
import { analyzeTax } from './utils/taxCalc'

const MAIN_TABS = [
  { id: 'finance', label: '금융상품 평가' },
  { id: 'tax', label: '세무 자동화' },
]

const FINANCE_TABS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'bond', label: '채권 계산기' },
  { id: 'stock', label: '주식 평가' },
  { id: 'portfolio', label: '포트폴리오 VaR' },
]

const TAX_TABS = [
  { id: 'entry', label: '거래 입력' },
  { id: 'validator', label: '세무 검증' },
  { id: 'report', label: '세무 리포트' },
]

const TODAY = new Date().toLocaleDateString('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

function buildDefaultPortfolioDraft() {
  return {
    holdings: [],
  }
}

const PORTFOLIO_TABLE = 'portfolio'
const MIN_VAR_OBSERVATIONS = 20
const DASHBOARD_VAR_LOOKBACK_DAYS = 120
const DASHBOARD_HISTORY_FETCH_CONCURRENCY = 2

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeTicker(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  return digits.slice(-6).padStart(6, '0')
}

function normalizeHoldings(holdings) {
  return (Array.isArray(holdings) ? holdings : [])
    .map((holding, index) => ({
      id: toNumber(holding?.id, index + 1),
      name: typeof holding?.name === 'string' ? holding.name : '',
      ticker: normalizeTicker(holding?.ticker),
      qty: Math.max(0, toNumber(holding?.qty)),
      avgPrice: Math.max(0, toNumber(holding?.avgPrice ?? holding?.avg_price)),
      currentPrice: Math.max(0, toNumber(holding?.currentPrice ?? holding?.current_price ?? holding?.price)),
    }))
    .filter((holding) => (
      holding.name.trim() ||
      holding.ticker ||
      holding.qty > 0 ||
      holding.avgPrice > 0 ||
      holding.currentPrice > 0
    ))
}

function buildPortfolioSnapshot(holdings) {
  return normalizeHoldings(holdings)
    .map(({ id, name, ticker, qty, avgPrice }) => ({
      id,
      name,
      ticker,
      qty,
      avgPrice,
    }))
}

function serializePortfolioSnapshot(holdings) {
  return JSON.stringify(buildPortfolioSnapshot(holdings))
}

const PRICE_RETRY_DELAYS = [300, 700, 1500, 3000]

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchLivePrice(ticker) {
  const response = await fetch(`/api/market/stock?ticker=${encodeURIComponent(ticker)}`)
  const data = await response.json()

  if (!response.ok || !Number(data?.price)) {
    const reason = data?.detail || data?.error || '현재가 조회 실패'
    throw new Error(`${ticker} 현재가 조회 실패 (${response.status}): ${reason}`)
  }

  return data
}

async function fetchLivePriceWithRetry(ticker, attempts = 5) {
  let lastError = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchLivePrice(ticker)
    } catch (error) {
      lastError = error

      if (attempt < attempts - 1) {
        await wait(PRICE_RETRY_DELAYS[attempt] ?? PRICE_RETRY_DELAYS.at(-1))
      }
    }
  }

  throw lastError ?? new Error('현재가 조회 실패')
}

async function attachLivePrices(holdings) {
  const normalized = normalizeHoldings(holdings)
  const priced = [...normalized]
  const failedTickers = []
  const concurrency = 2

  async function worker(startIndex) {
    for (let index = startIndex; index < normalized.length; index += concurrency) {
      const holding = normalized[index]

      if (!holding?.ticker) {
        priced[index] = holding
        continue
      }

      try {
        const data = await fetchLivePriceWithRetry(holding.ticker)
        priced[index] = {
          ...holding,
          name: data.name || holding.name,
          currentPrice: Number(data.price),
        }
      } catch {
        failedTickers.push(holding.ticker)
        priced[index] = holding
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, normalized.length || 1) }, (_, index) => worker(index)),
  )

  return {
    holdings: priced,
    failedTickers,
  }
}

function formatDateTime(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function calcVaR(returns, portfolioValue) {
  const sorted = [...returns].sort((a, b) => a - b)
  const var95 = Math.abs(sorted[Math.floor(sorted.length * 0.05)])
  const var99 = Math.abs(sorted[Math.floor(sorted.length * 0.01)])
  return {
    var95: (var95 / 100) * portfolioValue,
    var99: (var99 / 100) * portfolioValue,
    var95pct: var95,
    var99pct: var99,
  }
}

async function fetchHistoryRows(ticker, period = DASHBOARD_VAR_LOOKBACK_DAYS) {
  const response = await fetch(`/api/market/history?ticker=${encodeURIComponent(ticker)}&period=${period}`)
  const data = await response.json()

  if (!response.ok || !Array.isArray(data?.rows)) {
    const reason = data?.detail || data?.error || '일봉 조회 실패'
    throw new Error(`${ticker} 일봉 조회 실패 (${response.status}): ${reason}`)
  }

  return data.rows
}

function buildRiskPositions(holdings, totalValue) {
  const byTicker = new Map()

  for (const holding of holdings) {
    const ticker = String(holding?.ticker ?? '').trim()
    const value = Math.max(0, Number(holding?.qty) || 0) * Math.max(0, Number(holding?.currentPrice) || 0)

    if (!ticker || value <= 0) {
      continue
    }

    const current = byTicker.get(ticker) ?? { ticker, value: 0 }
    current.value += value
    byTicker.set(ticker, current)
  }

  return Array.from(byTicker.values()).map((position) => ({
    ...position,
    weight: totalValue > 0 ? (position.value / totalValue) * 100 : 0,
  }))
}

function buildWeightedReturns(positions, historyResults, totalValue) {
  const successful = positions
    .map((position) => ({
      ...position,
      rows: historyResults[position.ticker] ?? [],
    }))
    .filter((position) => position.rows.length > 0)

  const coveredValue = successful.reduce((sum, position) => sum + position.value, 0)
  if (successful.length === 0 || coveredValue <= 0 || totalValue <= 0) {
    return []
  }

  const commonDates = successful
    .map((position) => new Set(position.rows.map((row) => row.tradeDate)))
    .reduce((intersection, dateSet) => (
      new Set([...intersection].filter((date) => dateSet.has(date)))
    ))

  const rowMaps = successful.map((position) => ({
    ...position,
    normalizedWeight: position.value / coveredValue,
    byDate: new Map(position.rows.map((row) => [row.tradeDate, row])),
  }))

  return [...commonDates]
    .sort((a, b) => a.localeCompare(b))
    .map((tradeDate) => rowMaps.reduce((sum, position) => (
      sum + position.normalizedWeight * Number(position.byDate.get(tradeDate)?.returnPct ?? 0)
    ), 0))
    .filter((value) => Number.isFinite(value))
    .slice(-DASHBOARD_VAR_LOOKBACK_DAYS)
}

function SubTabs({ tabs, active, onChange, badge }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            active === tab.id
              ? 'bg-navy text-white shadow-sm'
              : 'bg-white text-gray-500 border border-gray-200 hover:border-navy hover:text-navy'
          }`}
        >
          {tab.label}
        </button>
      ))}
      {badge}
    </div>
  )
}

export default function App() {
  const initialPortfolioDraft = useMemo(() => buildDefaultPortfolioDraft(), [])
  const loadedUserDataRef = useRef('')

  const [user, setUser] = useState(null)
  const userRef = useRef(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [activeTab, setActiveTab] = useState('finance')
  const [activeFinanceTab, setActiveFinanceTab] = useState('dashboard')
  const [activeTaxTab, setActiveTaxTab] = useState('entry')

  const [transactions, setTransactions] = useState([])
  const [taxResults, setTaxResults] = useState([])
  const [taxHeader, setTaxHeader] = useState({ company: '', taxYear: 2025 })
  const [portfolioHoldings, setPortfolioHoldings] = useState(initialPortfolioDraft.holdings)
  const [portfolioRiskPct, setPortfolioRiskPct] = useState(0)
  const [portfolioRiskLoading, setPortfolioRiskLoading] = useState(false)
  const [stock, setStock] = useState(DEFAULT_STOCK)
  const [bond, setBond] = useState(DEFAULT_BOND)
  const [calcHistory, setCalcHistory] = useState([])
  const [portfolioSync, setPortfolioSync] = useState({
    isSaving: false,
    isRestoring: false,
    saveError: '',
    restoreError: '',
    notice: '',
    lastSavedAt: '',
    hasRemoteSnapshot: false,
    hasCheckedRemote: false,
    savedSnapshot: '[]',
  })

  userRef.current = user

  const restorePortfolio = useCallback(async (userId, options = {}) => {
    const { navigate = false } = options

    if (!supabase || !userId) {
      return
    }

    setPortfolioSync((prev) => ({
      ...prev,
      isRestoring: true,
      restoreError: '',
      saveError: '',
      notice: '',
    }))

    const { data, error } = await supabase
      .from(PORTFOLIO_TABLE)
      .select('holdings, updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      setPortfolioSync((prev) => ({
        ...prev,
        isRestoring: false,
        restoreError: '저장된 포트폴리오를 불러오지 못했습니다. 스키마와 RLS 정책을 확인해 주세요.',
        hasCheckedRemote: true,
      }))
      return
    }

    if (!data) {
      setPortfolioHoldings([])
      setPortfolioSync((prev) => ({
        ...prev,
        isRestoring: false,
        restoreError: '',
        notice: '저장된 포트폴리오가 없습니다. 빈 상태에서 직접 입력해 주세요.',
        hasRemoteSnapshot: false,
        hasCheckedRemote: true,
        savedSnapshot: '[]',
      }))
      return
    }

    const {
      holdings: restoredHoldings,
      failedTickers,
    } = await attachLivePrices(data.holdings)
    const savedSnapshot = serializePortfolioSnapshot(data.holdings)
    setPortfolioHoldings(restoredHoldings)

    if (navigate) {
      setActiveTab('finance')
      setActiveFinanceTab('portfolio')
    }

    setPortfolioSync((prev) => ({
      ...prev,
      isRestoring: false,
      restoreError: '',
      notice: restoredHoldings.length === 0
        ? '저장된 포트폴리오는 비어 있습니다. 종목을 추가한 뒤 다시 저장해 주세요.'
        : failedTickers.length > 0
          ? `${failedTickers.join(', ')} 현재가 조회에 실패했습니다. 기존 가격을 유지했습니다.`
        : '',
      lastSavedAt: data.updated_at ?? '',
      hasRemoteSnapshot: true,
      hasCheckedRemote: true,
      savedSnapshot,
    }))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      loadedUserDataRef.current = ''
      return
    }

    if (loadedUserDataRef.current === user.id) {
      return
    }

    loadedUserDataRef.current = user.id

    async function loadUserData() {
      const transactionsTask = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true })

      const historyTask = supabase
        .from('calc_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      const taxHeaderTask = Promise.resolve().then(() => {
        try {
          const savedHeader = localStorage.getItem(`taxHeader_${user.id}`)
          if (savedHeader) {
            setTaxHeader(JSON.parse(savedHeader))
          }
        } catch (error) {
          console.warn('[TaxHeader] 저장된 헤더를 복원하지 못했습니다.', error)
        }
      })

      const [
        { data: txData },
        { data: histData },
      ] = await Promise.all([
        transactionsTask,
        historyTask,
        taxHeaderTask,
        restorePortfolio(user.id),
      ])

      if (txData && txData.length > 0) {
        const txs = txData.map((row) => ({
          id: row.id,
          date: row.date ?? '',
          name: row.name ?? '',
          type: row.type ?? '매수',
          qty: Number(row.qty) || 0,
          price: Number(row.price) || 0,
          amount: Number(row.amount) || 0,
          memo: row.memo ?? '',
        }))
        setTransactions(txs)
        setTaxResults(analyzeTax(txs))
      }

      if (histData && histData.length > 0) {
        const seen = new Set()
        setCalcHistory(
          histData
            .filter((row) => {
              if (seen.has(row.type)) {
                return false
              }
              seen.add(row.type)
              return true
            })
            .map((row) => ({
              id: row.id,
              name: row.label ?? '',
              type: row.type ?? '',
              result: row.value ?? '',
              date: new Date(row.created_at).toLocaleDateString('ko-KR'),
            })),
        )
      }
    }

    void loadUserData()
  }, [restorePortfolio, user])

  const addHistory = useCallback((entry) => {
    setCalcHistory((prev) => {
      const filtered = prev.filter((history) => history.type !== entry.type)
      return [
        { ...entry, id: Date.now(), date: new Date().toLocaleDateString('ko-KR') },
        ...filtered,
      ].slice(0, 20)
    })

    const currentUser = userRef.current

    if (currentUser) {
      void supabase
        .from('calc_history')
        .upsert(
          {
            user_id: currentUser.id,
            type: entry.type,
            label: entry.name,
            value: entry.result,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,type' },
        )
        .then(({ error }) => {
          if (error) {
            console.warn('[History] 계산 이력을 저장하지 못했습니다.', error.message)
          }
        })
    }
  }, [])

  const taxReserve = taxResults.length > 0
    ? taxResults[taxResults.length - 1].runningReserve
    : 0

  const portfolioValue = useMemo(
    () => portfolioHoldings.reduce((sum, holding) => sum + holding.qty * holding.currentPrice, 0),
    [portfolioHoldings],
  )

  useEffect(() => {
    let cancelled = false
    const positions = buildRiskPositions(portfolioHoldings, portfolioValue)

    if (positions.length === 0 || portfolioValue <= 0) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setPortfolioRiskPct(0)
          setPortfolioRiskLoading(false)
        }
      })
      return () => {
        cancelled = true
      }
    }

    async function calculateDashboardVaR() {
      setPortfolioRiskLoading(true)
      const historyResults = {}

      async function worker(startIndex) {
        for (let index = startIndex; index < positions.length; index += DASHBOARD_HISTORY_FETCH_CONCURRENCY) {
          const position = positions[index]

          try {
            historyResults[position.ticker] = await fetchHistoryRows(position.ticker)
          } catch {
            historyResults[position.ticker] = []
          }
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(DASHBOARD_HISTORY_FETCH_CONCURRENCY, positions.length || 1) },
          (_, index) => worker(index),
        ),
      )

      if (cancelled) {
        return
      }

      const returnsPct = buildWeightedReturns(positions, historyResults, portfolioValue)
      if (returnsPct.length < MIN_VAR_OBSERVATIONS) {
        setPortfolioRiskPct(0)
        setPortfolioRiskLoading(false)
        return
      }

      setPortfolioRiskPct(calcVaR(returnsPct, portfolioValue).var95pct)
      setPortfolioRiskLoading(false)
    }

    void calculateDashboardVaR()

    return () => {
      cancelled = true
    }
  }, [portfolioHoldings, portfolioValue])

  const summaryData = useMemo(() => ({
    totalAssets: portfolioValue > 0
      ? `₩ ${portfolioValue.toLocaleString('ko-KR')}`
      : '₩ 0',
    portfolioVaR: portfolioRiskPct > 0
      ? `${portfolioRiskPct.toFixed(2)}%`
      : '0.00%',
    taxReserve: taxReserve !== 0
      ? `₩ ${Math.abs(Math.round(taxReserve)).toLocaleString('ko-KR')}`
      : '₩ 0',
  }), [portfolioValue, portfolioRiskPct, taxReserve])

  const summaryLoading = Boolean(
    user
    && (
      portfolioSync.isRestoring
      || !portfolioSync.hasCheckedRemote
    ),
  )

  const summaryLoadingState = useMemo(() => ({
    totalAssets: summaryLoading,
    portfolioVaR: summaryLoading || portfolioRiskLoading,
    taxReserve: false,
  }), [portfolioRiskLoading, summaryLoading])

  const handlePortfolioSave = useCallback(async () => {
    if (!supabase || !user?.id) {
      setPortfolioSync((prev) => ({
        ...prev,
        saveError: '로그인 상태를 확인한 뒤 다시 시도해 주세요.',
        notice: '',
      }))
      return
    }

    const sanitizedHoldings = normalizeHoldings(portfolioHoldings)
    if (sanitizedHoldings.length === 0) {
      setPortfolioSync((prev) => ({
        ...prev,
        saveError: '저장할 종목이 없습니다. 종목을 추가한 뒤 다시 시도해 주세요.',
        notice: '',
      }))
      return
    }

    setPortfolioSync((prev) => ({
      ...prev,
      isSaving: true,
      saveError: '',
      restoreError: '',
      notice: '',
    }))

    const payload = {
      user_id: user.id,
      holdings: buildPortfolioSnapshot(sanitizedHoldings),
    }
    const savedSnapshot = serializePortfolioSnapshot(payload.holdings)

    const { data, error } = await supabase
      .from(PORTFOLIO_TABLE)
      .upsert(payload, { onConflict: 'user_id' })
      .select('updated_at')
      .single()

    if (error) {
      setPortfolioSync((prev) => ({
        ...prev,
        isSaving: false,
        saveError: '저장 중 오류가 발생했습니다. Supabase 권한과 테이블 구성을 확인해 주세요.',
        notice: '',
      }))
      return
    }

    setPortfolioSync((prev) => ({
      ...prev,
      isSaving: false,
      saveError: '',
      notice: '포트폴리오가 클라우드에 저장되었습니다.',
      lastSavedAt: data?.updated_at ?? new Date().toISOString(),
      hasRemoteSnapshot: true,
      hasCheckedRemote: true,
      savedSnapshot,
    }))
  }, [portfolioHoldings, user])

  const hasPortfolioChanges = useMemo(() => {
    const currentSnapshot = serializePortfolioSnapshot(portfolioHoldings)
    const savedSnapshot = portfolioSync.savedSnapshot ?? '[]'
    return currentSnapshot !== savedSnapshot
  }, [portfolioHoldings, portfolioSync.savedSnapshot])

  const handlePortfolioUpdate = useCallback(({ totalValue, var95pct }) => {
    setPortfolioRiskPct(var95pct)
    setPortfolioRiskLoading(false)
    if (totalValue > 0) {
      addHistory({
        name: '포트폴리오',
        type: 'VaR분석',
        result: `총 ₩${Math.round(totalValue).toLocaleString('ko-KR')} · VaR ${var95pct.toFixed(2)}%`,
      })
    }
  }, [addHistory])

  const handleTaxSave = useCallback(async (data) => {
    const results = analyzeTax(data.transactions)
    setTransactions(data.transactions)
    setTaxResults(results)
    setTaxHeader(data.header ?? { company: '', taxYear: 2025 })
    setActiveTaxTab('validator')

    if (user) {
      await supabase.from('transactions').delete().eq('user_id', user.id)

      if (data.transactions.length > 0) {
        await supabase.from('transactions').insert(
          data.transactions.map((tx) => ({
            user_id: user.id,
            date: tx.date,
            name: tx.name,
            type: tx.type,
            qty: tx.qty,
            price: tx.price,
            amount: tx.qty * tx.price,
            memo: tx.memo ?? '',
          })),
        )
      }

      try {
        localStorage.setItem(`taxHeader_${user.id}`, JSON.stringify(data.header))
      } catch (error) {
        console.warn('[TaxHeader] 헤더를 저장하지 못했습니다.', error)
      }
    }

    const reserve = results.length > 0 ? results[results.length - 1].runningReserve : 0
    addHistory({
      name: data.header?.company || '세무',
      type: '세무검증',
      result: `유보 ₩${Math.abs(Math.round(reserve)).toLocaleString('ko-KR')} · ${data.transactions.length}건`,
    })
  }, [addHistory, user])

  const handleQuickAction = useCallback((action) => {
    if (action === '채권 계산') {
      setActiveFinanceTab('bond')
    }
    if (action === '주식 평가') {
      setActiveFinanceTab('stock')
    }
    if (action === '세무 검증') {
      setActiveTab('tax')
      setActiveTaxTab('validator')
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.warn('[Auth] 로그아웃 요청 실패:', error.message)
      }
    } catch (error) {
      console.warn('[Auth] 로그아웃 요청 중 오류가 발생했습니다.', error)
    }

    setTransactions([])
    setTaxResults([])
    setCalcHistory([])
    setTaxHeader({ company: '', taxYear: 2025 })
    setPortfolioHoldings([])
    setPortfolioSync({
      isSaving: false,
      isRestoring: false,
      saveError: '',
      restoreError: '',
      notice: '',
      lastSavedAt: '',
      hasRemoteSnapshot: false,
      hasCheckedRemote: false,
      savedSnapshot: '[]',
    })
  }, [])

  return (
    <AuthGuard user={user} loading={authLoading}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-navy shadow-md">
          <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/fintax-icon.png"
                alt=""
                className="h-10 w-10 rounded-md bg-white/95 object-cover p-0.5 shadow-sm"
              />
              <div className="flex flex-col leading-none">
                <div className="text-white text-[2rem] font-black tracking-[-0.04em]">
                  fintax
                </div>
                <div className="text-blue-300 text-[0.65rem] font-semibold tracking-[0.38em] pl-1 mt-0.5">
                  ANALYZER
                </div>
              </div>
              <span className="hidden sm:inline text-blue-300 text-xs font-medium border border-blue-400 rounded px-1.5 py-0.5">
                Beta
              </span>
            </div>
            <div className="flex items-center gap-4">
              {portfolioValue > 0 && (
                <span className="hidden md:flex items-center gap-1.5 text-blue-200 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  포트폴리오 ₩{portfolioValue.toLocaleString('ko-KR')}
                </span>
              )}
              <span className="text-blue-200 text-sm hidden sm:block">{TODAY}</span>
              {user && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-300 text-xs hidden md:block truncate max-w-[160px]">
                    {user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-xs text-blue-200 hover:text-white border border-blue-400 hover:border-white rounded px-2 py-1 transition whitespace-nowrap"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-screen-xl mx-auto px-6 flex gap-0">
            {MAIN_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-8 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-midblue text-midblue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.id === 'finance' ? '📊 ' : '🧾 '}
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <main className="max-w-screen-xl mx-auto p-6">
          {activeTab === 'finance' && (
            <>
              <SubTabs
                tabs={FINANCE_TABS}
                active={activeFinanceTab}
                onChange={setActiveFinanceTab}
              />

              {activeFinanceTab === 'dashboard' && (
                <Dashboard
                  summaryData={summaryData}
                  summaryLoading={summaryLoadingState}
                  onQuickAction={handleQuickAction}
                  history={calcHistory}
                />
              )}

              {activeFinanceTab === 'bond' && (
                <BondCalculator
                  onCalculate={addHistory}
                  bond={bond}
                  setBond={setBond}
                />
              )}

              {activeFinanceTab === 'stock' && (
                <StockValuation
                  onCalculate={addHistory}
                  stock={stock}
                  setStock={setStock}
                />
              )}

              {activeFinanceTab === 'portfolio' && (
                <PortfolioRisk
                  onUpdate={handlePortfolioUpdate}
                  holdings={portfolioHoldings}
                  setHoldings={setPortfolioHoldings}
                  cloudState={{
                    isSupabaseConfigured,
                    userEmail: user?.email ?? '',
                    isSaving: portfolioSync.isSaving,
                    isRestoring: portfolioSync.isRestoring,
                    saveError: portfolioSync.saveError,
                    restoreError: portfolioSync.restoreError,
                    notice: portfolioSync.notice,
                    lastSavedAt: formatDateTime(portfolioSync.lastSavedAt),
                    hasRemoteSnapshot: portfolioSync.hasRemoteSnapshot,
                    hasCheckedRemote: portfolioSync.hasCheckedRemote,
                    hasPortfolioChanges,
                  }}
                  cloudActions={{
                    onSave: handlePortfolioSave,
                  }}
                />
              )}
            </>
          )}

          {activeTab === 'tax' && (
            <>
              <SubTabs
                tabs={TAX_TABS}
                active={activeTaxTab}
                onChange={setActiveTaxTab}
                badge={
                  transactions.length > 0 && (
                    <span className="ml-1 text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                      ✓ {transactions.length}건 저장
                    </span>
                  )
                }
              />

              {activeTaxTab === 'entry' && (
                <TaxEntry onSave={handleTaxSave} />
              )}

              {activeTaxTab === 'validator' && (
                <TaxValidator transactions={transactions} />
              )}

              {activeTaxTab === 'report' && (
                <TaxReport
                  taxResults={taxResults}
                  taxYear={taxHeader.taxYear}
                  company={taxHeader.company}
                />
              )}
            </>
          )}
        </main>

        <footer className="mt-12 border-t border-gray-200 bg-white">
          <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-gray-400">
            <span>FinTax Analyzer — 금융자산 평가 &amp; 세무자동화</span>
            <span>법인세법 §42③ 기준 · 참고용 계산서</span>
          </div>
        </footer>
      </div>
    </AuthGuard>
  )
}
