import { useState, useMemo, useCallback, useEffect } from 'react'
import './index.css'

import { supabase }       from './lib/supabase'
import AuthGuard          from './components/Auth/AuthGuard'
import Dashboard          from './components/Dashboard'
import BondCalculator, { DEFAULT_BOND } from './components/BondCalculator'
import StockValuation, { DEFAULT_STOCK } from './components/StockValuation'
import PortfolioRisk, { generateSampleReturns, DEFAULT_HOLDINGS } from './components/PortfolioRisk'
import TaxEntry           from './components/TaxEntry'
import TaxValidator       from './components/TaxValidator'
import TaxReport          from './components/TaxReport'
import { analyzeTax }     from './utils/taxCalc'

// ── 탭 정의 ───────────────────────────────────────────────
const MAIN_TABS = [
  { id: 'finance', label: '금융상품 평가' },
  { id: 'tax',     label: '세무 자동화' },
]

const FINANCE_TABS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'bond',      label: '채권 계산기' },
  { id: 'stock',     label: '주식 평가' },
  { id: 'portfolio', label: '포트폴리오 VaR' },
]

const TAX_TABS = [
  { id: 'entry',     label: '거래 입력' },
  { id: 'validator', label: '세무 검증' },
  { id: 'report',    label: '세무 리포트' },
]

// ── 오늘 날짜 포맷 ────────────────────────────────────────
const TODAY = new Date().toLocaleDateString('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
})

// ── Pill 서브탭 버튼 ──────────────────────────────────────
function SubTabs({ tabs, active, onChange, badge }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {tabs.map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            active === v.id
              ? 'bg-navy text-white shadow-sm'
              : 'bg-white text-gray-500 border border-gray-200 hover:border-navy hover:text-navy'
          }`}
        >
          {v.label}
        </button>
      ))}
      {badge}
    </div>
  )
}

// ── 메인 앱 ───────────────────────────────────────────────
export default function App() {
  // ── 인증 상태 ──────────────────────────────────────────
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

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

  // ── 탭 상태 ────────────────────────────────────────────
  const [activeTab,        setActiveTab]        = useState('finance')
  const [activeFinanceTab, setActiveFinanceTab] = useState('dashboard')
  const [activeTaxTab,     setActiveTaxTab]     = useState('entry')

  // ── 도메인 데이터 ──────────────────────────────────────
  const [transactions,         setTransactions]         = useState([])
  const [taxResults,           setTaxResults]           = useState([])
  const [taxHeader,            setTaxHeader]            = useState({ company: '', taxYear: 2025 })
  const [portfolioValue,       setPortfolioValue]       = useState(0)
  const [portfolioVaR,         setPortfolioVaR]         = useState(0)
  const [portfolioHoldings,    setPortfolioHoldings]    = useState(DEFAULT_HOLDINGS)
  const [portfolioReturnsText, setPortfolioReturnsText] = useState(() => generateSampleReturns())
  const [stock,                setStock]                = useState(DEFAULT_STOCK)
  const [bond,                 setBond]                 = useState(DEFAULT_BOND)
  const [calcHistory,          setCalcHistory]          = useState([])

  // ── Supabase 데이터 로딩 (로그인 시) ──────────────────
  useEffect(() => {
    if (!user) return

    async function loadUserData() {
      // 거래 내역
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true })

      if (txData && txData.length > 0) {
        const txs = txData.map((r) => ({
          id:     r.id,
          date:   r.date   ?? '',
          name:   r.name   ?? '',
          type:   r.type   ?? '매수',
          qty:    Number(r.qty)    || 0,
          price:  Number(r.price)  || 0,
          amount: Number(r.amount) || 0,
          memo:   r.memo   ?? '',
        }))
        setTransactions(txs)
        setTaxResults(analyzeTax(txs))
      }

      // 계산 이력
      const { data: histData } = await supabase
        .from('calc_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (histData && histData.length > 0) {
        // type별 최신 1건만 유지 (DB에 중복 행이 있어도 안전하게 처리)
        const seen = new Set()
        setCalcHistory(
          histData
            .filter((r) => {
              if (seen.has(r.type)) return false
              seen.add(r.type)
              return true
            })
            .map((r) => ({
              id:     r.id,
              name:   r.label ?? '',
              type:   r.type  ?? '',
              result: r.value ?? '',
              date:   new Date(r.created_at).toLocaleDateString('ko-KR'),
            })),
        )
      }

      // 세무 헤더 (localStorage 보조 저장)
      try {
        const saved = localStorage.getItem(`taxHeader_${user.id}`)
        if (saved) setTaxHeader(JSON.parse(saved))
      } catch (_) {}
    }

    loadUserData()
  }, [user])

  // ── 계산 이력 (최대 20건, 같은 type 은 upsert) ────────
  const addHistory = useCallback((entry) => {
    setCalcHistory((prev) => {
      const filtered = prev.filter((h) => h.type !== entry.type)
      return [
        { ...entry, id: Date.now(), date: new Date().toLocaleDateString('ko-KR') },
        ...filtered,
      ].slice(0, 20)
    })

    // Supabase 동기화 (fire-and-forget) — (user_id, type) unique 기준 upsert
    if (user) {
      supabase
        .from('calc_history')
        .upsert(
          { user_id: user.id, type: entry.type, label: entry.name, value: entry.result, created_at: new Date().toISOString() },
          { onConflict: 'user_id,type' },
        )
    }
  }, [user])

  // ── 세무 유보 잔액 ─────────────────────────────────────
  const taxReserve = taxResults.length > 0
    ? taxResults[taxResults.length - 1].runningReserve
    : 0

  // ── 대시보드 요약 데이터 ───────────────────────────────
  const summaryData = useMemo(() => ({
    totalAssets:  portfolioValue > 0
      ? `₩ ${portfolioValue.toLocaleString('ko-KR')}`
      : '₩ 0',
    portfolioVaR: portfolioVaR > 0
      ? `${portfolioVaR.toFixed(2)}%`
      : '0.00%',
    taxReserve: taxReserve !== 0
      ? `₩ ${Math.abs(Math.round(taxReserve)).toLocaleString('ko-KR')}`
      : '₩ 0',
  }), [portfolioValue, portfolioVaR, taxReserve])

  // ── 콜백 ──────────────────────────────────────────────

  const handlePortfolioUpdate = useCallback(({ totalValue, var95pct }) => {
    setPortfolioValue(totalValue)
    setPortfolioVaR(var95pct)
    if (totalValue > 0) {
      addHistory({
        name:   '포트폴리오',
        type:   'VaR분석',
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

    // Supabase 저장
    if (user) {
      await supabase.from('transactions').delete().eq('user_id', user.id)

      if (data.transactions.length > 0) {
        await supabase.from('transactions').insert(
          data.transactions.map((tx) => ({
            user_id: user.id,
            date:    tx.date,
            name:    tx.name,
            type:    tx.type,
            qty:     tx.qty,
            price:   tx.price,
            amount:  tx.qty * tx.price,
            memo:    tx.memo ?? '',
          })),
        )
      }

      try {
        localStorage.setItem(`taxHeader_${user.id}`, JSON.stringify(data.header))
      } catch (_) {}
    }

    const reserve = results.length > 0 ? results[results.length - 1].runningReserve : 0
    addHistory({
      name:   data.header?.company || '세무',
      type:   '세무검증',
      result: `유보 ₩${Math.abs(Math.round(reserve)).toLocaleString('ko-KR')} · ${data.transactions.length}건`,
    })
  }, [addHistory, user])

  const handleQuickAction = useCallback((action) => {
    if (action === '채권 계산') { setActiveFinanceTab('bond') }
    if (action === '주식 평가') { setActiveFinanceTab('stock') }
    if (action === '세무 검증') { setActiveTab('tax'); setActiveTaxTab('validator') }
  }, [])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setTransactions([])
    setTaxResults([])
    setCalcHistory([])
    setTaxHeader({ company: '', taxYear: 2025 })
  }, [])

  // ── 렌더링 ────────────────────────────────────────────
  return (
    <AuthGuard user={user} loading={authLoading}>
      <div className="min-h-screen bg-gray-50">

        {/* ── 헤더 ── */}
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

        {/* ── 메인 탭 내비 ── */}
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
                {tab.id === 'finance' ? '📊 ' : '🧾 '}{tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* ── 메인 콘텐츠 ── */}
        <main className="max-w-screen-xl mx-auto p-6">

          {/* ════ 금융상품 평가 탭 ════ */}
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
                  returnsText={portfolioReturnsText}
                  setReturnsText={setPortfolioReturnsText}
                />
              )}
            </>
          )}

          {/* ════ 세무 자동화 탭 ════ */}
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

        {/* ── 푸터 ── */}
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
