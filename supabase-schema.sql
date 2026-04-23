-- ── FinTax Analyzer — Supabase 스키마 ──────────────────────
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.

create extension if not exists "pgcrypto";

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
  type       text,
  label      text,
  value      text,
  detail     jsonb,
  created_at timestamptz default now()
);

-- 포트폴리오 저장 스냅샷
create table if not exists portfolio_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  holdings jsonb not null default '[]'::jsonb,
  returns_text text not null default '',
  total_value numeric(18, 2) not null default 0,
  var95_pct numeric(10, 4) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security 활성화
alter table transactions enable row level security;
alter table calc_history enable row level security;
alter table portfolio_snapshots enable row level security;

-- RLS 정책
drop policy if exists "transactions: 본인 데이터만" on transactions;
create policy "transactions: 본인 데이터만" on transactions
  using (auth.uid() = user_id);

drop policy if exists "calc_history: 본인 데이터만" on calc_history;
create policy "calc_history: 본인 데이터만" on calc_history
  using (auth.uid() = user_id);

drop policy if exists "portfolio_snapshots: 본인 데이터만 조회" on portfolio_snapshots;
create policy "portfolio_snapshots: 본인 데이터만 조회" on portfolio_snapshots
  for select
  using (auth.uid() = user_id);

drop policy if exists "portfolio_snapshots: 본인 데이터만 입력" on portfolio_snapshots;
create policy "portfolio_snapshots: 본인 데이터만 입력" on portfolio_snapshots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "portfolio_snapshots: 본인 데이터만 수정" on portfolio_snapshots;
create policy "portfolio_snapshots: 본인 데이터만 수정" on portfolio_snapshots
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 인덱스
create index if not exists idx_transactions_user_id on transactions (user_id);
create index if not exists idx_calc_history_user_id on calc_history (user_id);
create index if not exists idx_calc_history_type on calc_history (user_id, type);
alter table calc_history add constraint if not exists calc_history_user_type_unique unique (user_id, type);

create or replace function set_portfolio_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_portfolio_snapshots_updated_at on portfolio_snapshots;

create trigger trg_portfolio_snapshots_updated_at
before update on portfolio_snapshots
for each row
execute function set_portfolio_snapshots_updated_at();
