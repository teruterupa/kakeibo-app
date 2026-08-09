create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  amount integer not null check (amount > 0),
  memo text,
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
