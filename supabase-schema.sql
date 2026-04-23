-- FinTax Analyzer — Supabase 스키마
-- Supabase Dashboard -> SQL Editor 에서 실행하세요.

create extension if not exists "pgcrypto";

-- 거래 내역 테이블
create table if not exists transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
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
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text,
  label      text,
  value      text,
  detail     jsonb,
  created_at timestamptz default now()
);

-- 포트폴리오 구성 테이블
-- holdings 예시:
-- [
--   {
--     "id": 1,
--     "name": "삼성전자",
--     "ticker": "005930",
--     "qty": 10,
--     "avgPrice": 72000,
--     "currentPrice": 74500
--   }
-- ]
create table if not exists portfolio (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  holdings   jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 포트폴리오 수익률/시계열 테이블
-- 필요 시 일별 수익률, 수익률 산출 기준일, 메타데이터를 별도로 관리합니다.
create table if not exists portfolio_returns (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  portfolio_id  uuid,
  trade_date    date,
  return_pct    numeric(12, 6),
  benchmark_pct numeric(12, 6),
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz default now()
);

alter table transactions enable row level security;
alter table calc_history enable row level security;
alter table portfolio enable row level security;
alter table portfolio_returns enable row level security;

drop policy if exists "transactions: 본인 데이터만" on transactions;
create policy "transactions: 본인 데이터만" on transactions
  using (auth.uid() = user_id);

drop policy if exists "calc_history: 본인 데이터만" on calc_history;
create policy "calc_history: 본인 데이터만" on calc_history
  using (auth.uid() = user_id);

drop policy if exists "portfolio: 본인 데이터만 조회" on portfolio;
create policy "portfolio: 본인 데이터만 조회" on portfolio
  for select
  using (auth.uid() = user_id);

drop policy if exists "portfolio: 본인 데이터만 입력" on portfolio;
create policy "portfolio: 본인 데이터만 입력" on portfolio
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "portfolio: 본인 데이터만 수정" on portfolio;
create policy "portfolio: 본인 데이터만 수정" on portfolio
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "portfolio_returns: 본인 데이터만 조회" on portfolio_returns;
create policy "portfolio_returns: 본인 데이터만 조회" on portfolio_returns
  for select
  using (auth.uid() = user_id);

drop policy if exists "portfolio_returns: 본인 데이터만 입력" on portfolio_returns;
create policy "portfolio_returns: 본인 데이터만 입력" on portfolio_returns
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "portfolio_returns: 본인 데이터만 수정" on portfolio_returns;
create policy "portfolio_returns: 본인 데이터만 수정" on portfolio_returns
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "portfolio_returns: 본인 데이터만 삭제" on portfolio_returns;
create policy "portfolio_returns: 본인 데이터만 삭제" on portfolio_returns
  for delete
  using (auth.uid() = user_id);

create index if not exists idx_transactions_user_id on transactions (user_id);
create index if not exists idx_calc_history_user_id on calc_history (user_id);
create index if not exists idx_calc_history_type on calc_history (user_id, type);
create index if not exists idx_portfolio_returns_user_id on portfolio_returns (user_id);
create index if not exists idx_portfolio_returns_trade_date on portfolio_returns (user_id, trade_date desc);

alter table calc_history
  drop constraint if exists calc_history_user_type_unique;

alter table calc_history
  add constraint calc_history_user_type_unique unique (user_id, type);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_portfolio_updated_at on portfolio;

create trigger trg_portfolio_updated_at
before update on portfolio
for each row
execute function set_updated_at();
