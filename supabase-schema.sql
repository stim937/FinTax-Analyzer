-- ── FinTax Analyzer — Supabase 스키마 ──────────────────────
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.

-- 거래 내역 테이블
create table if not exists transactions (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users not null,
  date       text,
  name       text,
  type       text,
  qty        numeric,
  price      numeric,
  amount     numeric,
  memo       text,
  created_at timestamptz default now()
);

-- 계산 이력 테이블
create table if not exists calc_history (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users not null,
  type       text,      -- 채권계산 | 주식평가 | VaR분석 | 세무검증
  label      text,      -- 종목명 / 회사명
  value      text,      -- 결과 문자열
  detail     jsonb,     -- 향후 확장용
  created_at timestamptz default now()
);

-- Row Level Security 활성화 (사용자 본인 데이터만 접근)
alter table transactions  enable row level security;
alter table calc_history  enable row level security;

-- RLS 정책
create policy "transactions: 본인 데이터만" on transactions
  using (auth.uid() = user_id);

create policy "calc_history: 본인 데이터만" on calc_history
  using (auth.uid() = user_id);

-- 인덱스 (성능)
create index if not exists idx_transactions_user_id  on transactions  (user_id);
create index if not exists idx_calc_history_user_id  on calc_history  (user_id);
create index if not exists idx_calc_history_type     on calc_history  (user_id, type);
alter table calc_history add constraint if not exists calc_history_user_type_unique unique (user_id, type);
