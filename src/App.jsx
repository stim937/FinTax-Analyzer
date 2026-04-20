import { useState, useMemo, useCallback } from 'react'
import './index.css'

import Dashboard      from './components/Dashboard'
import BondCalculator from './components/BondCalculator'
import StockValuation from './components/StockValuation'
import PortfolioRisk  from './components/PortfolioRisk'
import TaxEntry       from './components/TaxEntry'
import TaxValidator   from './components/TaxValidator'
import TaxReport      from './components/TaxReport'
import { analyzeTax } from './utils/taxCalc'

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
  // 탭 상태
  const [activeTab,        setActiveTab]        = useState('finance')
  const [activeFinanceTab, setActiveFinanceTab] = useState('dashboard')
  const [activeTaxTab,     setActiveTaxTab]     = useState('entry')

  // 도메인 데이터
  const [transactions,   setTransactions]   = useState([])
  const [taxResults,     setTaxResults]     = useState([])
  const [taxHeader,      setTaxHeader]      = useState({ company: '', taxYear: 2025 })
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [portfolioVaR,   setPortfolioVaR]   = useState(0)   // percent (95% VaR)

  // 세무 유보 잔액 (taxResults 마지막 행의 runningReserve)
  const taxReserve = taxResults.length > 0
    ? taxResults[taxResults.length - 1].runningReserve
    : 0

  // 대시보드 요약 데이터 자동 갱신
  const summaryData = useMemo(() => ({
    totalAssets:  portfolioValue > 0
      ? `₩ ${portfolioValue.toLocaleString('ko-KR')}`
      : '₩ 0',
    portfolioVaR: portfolioVaR > 0
      ? `${portfolioVaR.toFixed(2)}%`
      : '0.00%',
    taxReserve:   taxReserve !== 0
      ? `₩ ${Math.abs(Math.round(taxReserve)).toLocaleString('ko-KR')}`
      : '₩ 0',
  }), [portfolioValue, portfolioVaR, taxReserve])

  // ── 콜백 ─────────────────────────────────────────────────

  // PortfolioRisk → App 갱신
  const handlePortfolioUpdate = useCallback(({ totalValue, var95pct }) => {
    setPortfolioValue(totalValue)
    setPortfolioVaR(var95pct)
  }, [])

  // TaxEntry 저장 → transactions + taxResults 갱신 → 세무 검증 탭 이동
  const handleTaxSave = useCallback((data) => {
    setTransactions(data.transactions)
    setTaxResults(analyzeTax(data.transactions))
    setTaxHeader(data.header ?? { company: '', taxYear: 2025 })
    setActiveTaxTab('validator')
  }, [])

  // 대시보드 빠른 계산 버튼
  const handleQuickAction = useCallback((action) => {
    if (action === '채권 계산') { setActiveFinanceTab('bond') }
    if (action === '주식 평가') { setActiveFinanceTab('stock') }
    if (action === '세무 검증') { setActiveTab('tax'); setActiveTaxTab('validator') }
  }, [])

  // ── 렌더링 ───────────────────────────────────────────────
  return (
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
            <span className="text-blue-200 text-sm">{TODAY}</span>
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
              />
            )}

            {activeFinanceTab === 'bond' && <BondCalculator />}

            {activeFinanceTab === 'stock' && <StockValuation />}

            {activeFinanceTab === 'portfolio' && (
              <PortfolioRisk onUpdate={handlePortfolioUpdate} />
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
  )
}
