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

create table if not exists imported_email_ids (
  message_id text primary key,
  created_at timestamptz not null default now()
);

alter table transactions enable row level security;
alter table imported_email_ids enable row level security;

-- 認証未導入のため、今は全アクセスを許可する。
-- NextAuth.js導入時にこのポリシーを見直すこと。
-- drop policy if exists + create policyにすることで、このファイル全体を
-- 既存環境に再実行してもエラーで途中終了しない（べき等）ようにしている。
drop policy if exists "Allow all access (no auth yet)" on transactions;
create policy "Allow all access (no auth yet)"
  on transactions
  for all
  using (true)
  with check (true);

drop policy if exists "Allow all access (no auth yet)" on imported_email_ids;
create policy "Allow all access (no auth yet)"
  on imported_email_ids
  for all
  using (true)
  with check (true);

-- ============================================================
-- 以下は、カード利用通知メール自動取込機能の追加にともなう変更。
-- 新規セットアップでは上の定義に含まれているため実質的に何もしない。
-- 既にテーブルが存在する環境（今回のような既存デプロイへの機能追加）は
-- このブロックだけをSQL Editorに貼り付けて実行すればよい。
-- ============================================================
create table if not exists imported_email_ids (
  message_id text primary key,
  created_at timestamptz not null default now()
);
alter table imported_email_ids enable row level security;
drop policy if exists "Allow all access (no auth yet)" on imported_email_ids;
create policy "Allow all access (no auth yet)"
  on imported_email_ids
  for all
  using (true)
  with check (true);
alter table transactions add column if not exists source text not null default 'manual' check (source in ('manual', 'email'));
alter table transactions add column if not exists source_message_id text unique;
