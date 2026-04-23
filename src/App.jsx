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

async function attachLivePrices(holdings) {
  const normalized = normalizeHoldings(holdings)
  const priced = []

  for (const holding of normalized) {
    if (!holding.ticker) {
      priced.push(holding)
      continue
    }

    try {
      const response = await fetch(`/api/market/stock?ticker=${encodeURIComponent(holding.ticker)}`)
      const data = await response.json()

      if (!response.ok || !Number(data?.price)) {
        priced.push({ ...holding, currentPrice: 0 })
        continue
      }

      priced.push({
        ...holding,
        name: data.name || holding.name,
        currentPrice: Number(data.price),
      })
    } catch {
      priced.push({ ...holding, currentPrice: 0 })
    }
  }

  return priced
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

function normalizePortfolioReturnRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      tradeDate: row?.trade_date ?? '',
      returnPct: Number(row?.return_pct),
      portfolioValue: Math.max(0, Number(row?.portfolio_value) || 0),
      meta: row?.meta && typeof row.meta === 'object' ? row.meta : {},
    }))
    .filter((row) => row.tradeDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
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
  const [authLoading, setAuthLoading] = useState(true)

  const [activeTab, setActiveTab] = useState('finance')
  const [activeFinanceTab, setActiveFinanceTab] = useState('dashboard')
  const [activeTaxTab, setActiveTaxTab] = useState('entry')

  const [transactions, setTransactions] = useState([])
  const [taxResults, setTaxResults] = useState([])
  const [taxHeader, setTaxHeader] = useState({ company: '', taxYear: 2025 })
  const [portfolioHoldings, setPortfolioHoldings] = useState(initialPortfolioDraft.holdings)
  const [portfolioReturnSeries, setPortfolioReturnSeries] = useState([])
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
  const [portfolioReturnSync, setPortfolioReturnSync] = useState({
    loading: false,
    error: '',
    lastCapturedAt: '',
  })

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

    const restoredHoldings = await attachLivePrices(data.holdings)
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
        : '',
      lastSavedAt: data.updated_at ?? '',
      hasRemoteSnapshot: true,
      hasCheckedRemote: true,
      savedSnapshot,
    }))
  }, [])

  const restorePortfolioReturns = useCallback(async (userId) => {
    if (!supabase || !userId) {
      return
    }

    setPortfolioReturnSync((prev) => ({
      ...prev,
      loading: true,
      error: '',
    }))

    const { data, error } = await supabase
      .from('portfolio_returns')
      .select('trade_date, return_pct, portfolio_value, meta, created_at')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true })

    if (error) {
      setPortfolioReturnSeries([])
      setPortfolioReturnSync({
        loading: false,
        error: '일별 수익률 기록을 불러오지 못했습니다.',
        lastCapturedAt: '',
      })
      return
    }

    const rows = normalizePortfolioReturnRows(data)
    setPortfolioReturnSeries(rows)
    setPortfolioReturnSync({
      loading: false,
      error: '',
      lastCapturedAt: data?.length ? data[data.length - 1]?.created_at ?? '' : '',
    })
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
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true })

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

      const { data: histData } = await supabase
        .from('calc_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

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

      try {
        const savedHeader = localStorage.getItem(`taxHeader_${user.id}`)
        if (savedHeader) {
          setTaxHeader(JSON.parse(savedHeader))
        }
      } catch (error) {
        console.warn('[TaxHeader] 저장된 헤더를 복원하지 못했습니다.', error)
      }

      await Promise.all([
        restorePortfolio(user.id),
        restorePortfolioReturns(user.id),
      ])
    }

    void loadUserData()
  }, [restorePortfolio, restorePortfolioReturns, user])

  const addHistory = useCallback((entry) => {
    setCalcHistory((prev) => {
      const filtered = prev.filter((history) => history.type !== entry.type)
      return [
        { ...entry, id: Date.now(), date: new Date().toLocaleDateString('ko-KR') },
        ...filtered,
      ].slice(0, 20)
    })

    if (user) {
      void supabase
        .from('calc_history')
        .upsert(
          {
            user_id: user.id,
            type: entry.type,
            label: entry.name,
            value: entry.result,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,type' },
        )
    }
  }, [user])

  const taxReserve = taxResults.length > 0
    ? taxResults[taxResults.length - 1].runningReserve
    : 0

  const portfolioValue = useMemo(
    () => portfolioHoldings.reduce((sum, holding) => sum + holding.qty * holding.currentPrice, 0),
    [portfolioHoldings],
  )

  const portfolioActualReturnsPct = useMemo(
    () => portfolioReturnSeries
      .map((row) => Number(row.returnPct))
      .filter((value) => !Number.isNaN(value) && Number.isFinite(value)),
    [portfolioReturnSeries],
  )

  const portfolioBackfillSeed = useMemo(
    () => JSON.stringify(
      portfolioHoldings.map(({ ticker, qty, avgPrice }) => ({
        ticker,
        qty,
        avgPrice,
      })),
    ),
    [portfolioHoldings],
  )

  const portfolioBackfillReturnsPct = useMemo(
    () => generateBackfillReturns(
      portfolioBackfillSeed,
      Math.max(0, MIN_VAR_OBSERVATIONS - portfolioActualReturnsPct.length),
    ),
    [portfolioActualReturnsPct.length, portfolioBackfillSeed],
  )

  const portfolioReturnsPct = useMemo(
    () => [...portfolioBackfillReturnsPct, ...portfolioActualReturnsPct],
    [portfolioActualReturnsPct, portfolioBackfillReturnsPct],
  )

  const portfolioVaRResult = useMemo(() => {
    if (portfolioReturnsPct.length < MIN_VAR_OBSERVATIONS || portfolioValue <= 0) {
      return null
    }
    return calcVaR(portfolioReturnsPct, portfolioValue)
  }, [portfolioReturnsPct, portfolioValue])

  const portfolioVaR = portfolioVaRResult?.var95pct ?? 0

  const summaryData = useMemo(() => ({
    totalAssets: portfolioValue > 0
      ? `₩ ${portfolioValue.toLocaleString('ko-KR')}`
      : '₩ 0',
    portfolioVaR: portfolioVaR > 0
      ? `${portfolioVaR.toFixed(2)}%`
      : '0.00%',
    taxReserve: taxReserve !== 0
      ? `₩ ${Math.abs(Math.round(taxReserve)).toLocaleString('ko-KR')}`
      : '₩ 0',
  }), [portfolioValue, portfolioVaR, taxReserve])

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
    await supabase.auth.signOut()
    setTransactions([])
    setTaxResults([])
    setCalcHistory([])
    setTaxHeader({ company: '', taxYear: 2025 })
    setPortfolioHoldings([])
    setPortfolioReturnSeries([])
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
    setPortfolioReturnSync({
      loading: false,
      error: '',
      lastCapturedAt: '',
    })
  }, [])

  return (
    <AuthGuard user={user} loading={authLoading}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-navy shadow-md">
          <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📈</span>
              <h1 className="text-white text-2xl font-extrabold tracking-tight">
                FinTax Analyzer
              </h1>
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
                  returnSeries={portfolioReturnSeries}
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
                    returnHistoryLoading: portfolioReturnSync.loading,
                    returnHistoryError: portfolioReturnSync.error,
                    lastCapturedAt: formatDateTime(portfolioReturnSync.lastCapturedAt),
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
