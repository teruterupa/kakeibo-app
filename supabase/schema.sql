create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  amount integer not null check (amount > 0),
  memo text,
  source text not null default 'manual' check (source in ('manual', 'email')),
  source_message_id text unique,
  created_at timestamptz not null default now()
);

alter table transactions enable row level security;

-- 認証未導入のため、今は全アクセスを許可する。
-- NextAuth.js導入時にこのポリシーを見直すこと。
create policy "Allow all access (no auth yet)"
  on transactions
  for all
  using (true)
  with check (true);

-- 以下は、カード利用通知メール自動取込機能の追加にともなうカラム追加。
-- 新規セットアップでは上のcreate table定義に含まれているため実質的に何もしない。
-- 既にテーブルが存在する環境（今回のような既存デプロイへの機能追加）向けの追記。
alter table transactions add column if not exists source text not null default 'manual' check (source in ('manual', 'email'));
alter table transactions add column if not exists source_message_id text unique;
