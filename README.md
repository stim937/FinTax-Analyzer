# FinTax Analyzer

금융 자산 가치평가 및 세무 자동화를 위한 React 기반 웹 애플리케이션입니다.

---

## 주요 기능

### 금융 분석

| 탭 | 설명 |
|---|---|
| **채권 계산기** | 액면가·쿠폰율·만기·YTM을 입력해 채권 현재가격, Macaulay/Modified Duration, Convexity 계산. YTM 변화에 따른 가격 곡선 시각화 |
| **주식 가치평가** | PER법(IV_A)과 DDM(IV_B) 두 가지 모델로 내재가치 산출. 현재가 대비 업사이드/판정(강력매수·매수·중립·주의) 및 게이지 바 표시 |
| **포트폴리오 위험** | 보유 종목 동적 관리, 역사적 시뮬레이션 기반 VaR(95%/99%) 계산, 수익률 분포 히스토그램 차트 |

### 세무 관리

| 탭 | 설명 |
|---|---|
| **거래 입력** | 매수·매도·기말평가·배당 거래 내역 동적 입력 및 관리 |
| **세무 검증** | 법인세법 §42③ 기준 상장주식 기말평가 익금불산입/손금불산입 자동 분석, 유보 추적, 경고 스텝퍼 UI |
| **세무 보고서** | 세목별 요약 도넛 차트, 공식 세금 계산 테이블, 종목별 유보 현황, 인쇄 지원 |

---

## 기술 스택

- **React 19** + **Vite 8**
- **TailwindCSS v4** (CSS-first, `@tailwindcss/vite` 플러그인)
- **Chart.js v4** + **react-chartjs-2** (Line / Bar / Doughnut)
- **chartjs-plugin-annotation** (YTM 마커, VaR 임계선)

---

## 프로젝트 구조

```
src/
├── components/
│   ├── Dashboard.jsx          # 요약 카드 + 빠른 실행
│   ├── BondCalculator.jsx     # 채권 계산기
│   ├── StockValuation.jsx     # 주식 가치평가
│   ├── PortfolioRisk.jsx      # 포트폴리오 위험 분석
│   ├── TaxEntry.jsx           # 거래 내역 입력
│   ├── TaxValidator.jsx       # 세무 검증
│   ├── TaxReport.jsx          # 세무 보고서
│   └── ui/
│       ├── FormattedInput.jsx # 천단위 쉼표 숫자 입력
│       ├── Tooltip.jsx        # 호버 툴팁
│       └── Spinner.jsx        # 로딩 스피너
├── hooks/
│   └── useDebounce.js         # 디바운스 훅 (isPending 포함)
├── utils/
│   └── taxCalc.js             # 세무 계산 순수 함수
└── App.jsx                    # 탭 라우팅 및 전역 상태
```

---

## 시작하기

```bash
# 의존성 설치
npm install

# 프론트엔드만 실행 (Vite)
npm run dev

# App + API 함께 실행 (권장)
npm run dev:full

# API 함수만 실행 (Vercel Functions 전용)
npm run dev:api

# Windows 더블클릭/명령프롬프트용 래퍼
./run-dev-with-api.bat

# 변경사항 커밋 + 푸시 + 드래프트 PR 생성
npm run publish:pr -- "chore: 변경 설명"

# 프로덕션 빌드
npm run build
```

## 로컬 API 개발

- `npm run dev`만 실행하면 Vite 프론트엔드만 뜨고 `/api/*` 함수는 동작하지 않습니다.
- `/api/market/*`를 함께 쓰려면 `Vercel Functions`가 별도로 떠 있어야 합니다.
- `npm run dev:full`이 권장 진입점이며, `.env.local`을 먼저 읽고 `vercel dev`를 띄웁니다.
- `run-dev-with-api.bat`는 Windows에서 더블클릭이나 `cmd` 실행을 쉽게 하기 위한 얇은 래퍼입니다.
- 이 방식에서는 앱과 `/api/*`가 모두 `http://127.0.0.1:3000`에서 함께 동작합니다.

## PR 자동화

- `npm run publish:pr -- "커밋 메시지"`를 실행하면 현재 브랜치 기준으로 `git add -A`, 커밋, `git push`, 드래프트 PR 생성까지 한 번에 진행합니다.
- 기본 대상 브랜치는 `main`입니다.
- 현재 브랜치에 이미 같은 base 대상 PR이 있으면 새로 만들지 않고 기존 PR URL만 출력합니다.
- `gh auth login`으로 GitHub CLI 인증이 먼저 되어 있어야 합니다.
