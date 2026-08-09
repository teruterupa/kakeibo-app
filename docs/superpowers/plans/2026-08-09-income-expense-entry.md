# 収支登録フォーム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 収入・支出を1件登録し、Supabaseの`transactions`テーブルに保存できるフォームを作る。

**Architecture:** Next.js App RouterのServer Action（`"use server"`）が、クライアントの入力フォームからのsubmitを直接受け取り、バリデーション後にSupabase（PostgreSQL）へINSERTする。一覧表示・認証は対象外。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / @supabase/supabase-js

## Global Constraints

- DBは`transactions`テーブル1つ。カラム: `id`(uuid) / `date`(date) / `type`(`income`|`expense`) / `category`(text) / `amount`(integer, 1以上) / `memo`(text, nullable) / `created_at`(timestamptz)
- カテゴリは固定リスト。支出: 食費 / 日用品 / 交通費 / 娯楽 / 光熱費 / 住居 / その他。収入: 給与 / 副業 / その他
- RLSは制限なし（全許可）。認証導入時に見直すこと（設計書に記載済み）
- データ保存はServer Actionsを使う。API RouteやクライアントからのSupabase直接呼び出しは行わない
- 自動テスト（Jest等）は今回導入しない。各タスクの検証は`npm run lint`と`npm run build`（型チェック含む）、最終タスクでの手動動作確認で行う（設計書のテスト方針より）
- next-pwaはTurbopack非対応のため、`npm run dev` / `npm run build`は既存の`package.json`設定どおり`--webpack`付きで実行する
- 対象ファイルはすべて`c:\Users\kiaiy\OneDrive\Desktop\家計簿`配下（リポジトリルート）

---

### Task 1: Supabase JS クライアントライブラリの導入

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: なし
- Produces: `@supabase/supabase-js`パッケージ（Task 3で`createClient`を使用）

- [ ] **Step 1: パッケージをインストール**

Run: `npm install @supabase/supabase-js`

- [ ] **Step 2: インストールを確認**

Run: `npm ls @supabase/supabase-js`
Expected: バージョン番号が表示される（エラーなし）

- [ ] **Step 3: コミット**

```bash
git add package.json package-lock.json
git commit -m "@supabase/supabase-jsを追加"
```

---

### Task 2: Supabaseのテーブル定義とセットアップ手順

**Files:**
- Create: `supabase/schema.sql`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: なし
- Produces: `transactions`テーブルのSQL定義（ユーザーがSupabase側で実行する）

- [ ] **Step 1: `supabase/schema.sql`を作成**

```sql
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
```

- [ ] **Step 2: `CLAUDE.md`にSupabaseセットアップ手順を追記**

`CLAUDE.md`の「重要な注意点」セクションの後に、以下のセクションを追加する。

```markdown
## Supabaseセットアップ手順（初回のみ・ユーザー作業）

1. https://supabase.com でアカウント作成し、新規プロジェクトを作成する
2. Supabaseダッシュボードの「SQL Editor」を開き、`supabase/schema.sql`の内容を貼り付けて実行する（`transactions`テーブルが作成される）
3. 「Project Settings」→「API」から、Project URLとanon public keyをコピーする
4. プロジェクトルートに`.env.local`ファイルを作成し（`.env.example`をコピーして作成）、以下を設定する

   ```
   NEXT_PUBLIC_SUPABASE_URL=（コピーしたProject URL）
   NEXT_PUBLIC_SUPABASE_ANON_KEY=（コピーしたanon public key）
   ```

`.env.local`はGit管理対象外（`.gitignore`の`.env*`ルールで除外済み）。
```

- [ ] **Step 3: 変更を確認**

Run: `git diff CLAUDE.md`
Expected: 上記セクションが追加されている

- [ ] **Step 4: コミット**

```bash
git add supabase/schema.sql CLAUDE.md
git commit -m "Supabaseのテーブル定義とセットアップ手順を追加"
```

---

### Task 3: Supabaseサーバークライアントのヘルパー関数

**Files:**
- Create: `lib/supabase/server.ts`

**Interfaces:**
- Consumes: 環境変数`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Produces: `createServerSupabaseClient(): SupabaseClient`（Task 5で使用）

- [ ] **Step 1: `lib/supabase/server.ts`を作成**

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabaseの環境変数が設定されていません。.env.localにNEXT_PUBLIC_SUPABASE_URLとNEXT_PUBLIC_SUPABASE_ANON_KEYを設定してください。"
    );
  }

  return createClient(url, anonKey);
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run build`
Expected: エラーなくビルドが成功する（`.env.local`未設定でもビルド自体は通る。実行時にのみ環境変数チェックが働く）

- [ ] **Step 3: コミット**

```bash
git add lib/supabase/server.ts
git commit -m "Supabaseサーバークライアントのヘルパーを追加"
```

---

### Task 4: カテゴリ定義

**Files:**
- Create: `lib/categories.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type TransactionType = "income" | "expense"`
  - `EXPENSE_CATEGORIES: readonly string[]`
  - `INCOME_CATEGORIES: readonly string[]`
  - `getCategoriesFor(type: TransactionType): readonly string[]`
  （Task 5, 6で使用）

- [ ] **Step 1: `lib/categories.ts`を作成**

```typescript
export type TransactionType = "income" | "expense";

export const EXPENSE_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "娯楽",
  "光熱費",
  "住居",
  "その他",
] as const;

export const INCOME_CATEGORIES = ["給与", "副業", "その他"] as const;

export function getCategoriesFor(type: TransactionType): readonly string[] {
  return type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run build`
Expected: エラーなくビルドが成功する

- [ ] **Step 3: コミット**

```bash
git add lib/categories.ts
git commit -m "収支カテゴリの定義を追加"
```

---

### Task 5: 取引登録のServer Action

**Files:**
- Create: `app/actions/create-transaction.ts`

**Interfaces:**
- Consumes:
  - `createServerSupabaseClient()` from `@/lib/supabase/server`（Task 3）
  - `getCategoriesFor(type)` from `@/lib/categories`（Task 4）
- Produces:
  - `type CreateTransactionState = { status: "idle" | "success" | "error"; message: string }`
  - `initialCreateTransactionState: CreateTransactionState`
  - `createTransaction(prevState: CreateTransactionState, formData: FormData): Promise<CreateTransactionState>`
  （Task 6で使用）

- [ ] **Step 1: `app/actions/create-transaction.ts`を作成**

```typescript
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCategoriesFor, type TransactionType } from "@/lib/categories";

export type CreateTransactionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialCreateTransactionState: CreateTransactionState = {
  status: "idle",
  message: "",
};

export async function createTransaction(
  _prevState: CreateTransactionState,
  formData: FormData
): Promise<CreateTransactionState> {
  const typeValue = formData.get("type");
  let type: TransactionType;
  if (typeValue === "income" || typeValue === "expense") {
    type = typeValue;
  } else {
    return { status: "error", message: "種別を選択してください。" };
  }

  const dateValue = formData.get("date");
  if (typeof dateValue !== "string" || dateValue === "") {
    return { status: "error", message: "日付を入力してください。" };
  }

  const categoryValue = formData.get("category");
  const allowedCategories = getCategoriesFor(type);
  if (
    typeof categoryValue !== "string" ||
    !allowedCategories.includes(categoryValue)
  ) {
    return { status: "error", message: "カテゴリを選択してください。" };
  }

  const amountValue = formData.get("amount");
  const amount = typeof amountValue === "string" ? Number(amountValue) : NaN;
  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      status: "error",
      message: "金額は1円以上の整数で入力してください。",
    };
  }

  const memoValue = formData.get("memo");
  const memo =
    typeof memoValue === "string" && memoValue !== "" ? memoValue : null;

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("transactions").insert({
    type,
    date: dateValue,
    category: categoryValue,
    amount,
    memo,
  });

  if (error) {
    return { status: "error", message: `保存に失敗しました: ${error.message}` };
  }

  return { status: "success", message: "登録しました。" };
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run build`
Expected: エラーなくビルドが成功する

- [ ] **Step 3: コミット**

```bash
git add app/actions/create-transaction.ts
git commit -m "取引登録のServer Actionを追加"
```

---

### Task 6: 収支登録フォーム画面

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes:
  - `createTransaction`, `initialCreateTransactionState`, `type CreateTransactionState` from `@/app/actions/create-transaction`（Task 5）
  - `getCategoriesFor(type)`, `type TransactionType` from `@/lib/categories`（Task 4）
- Produces: `app/page.tsx`のデフォルトエクスポート（画面。他タスクからは参照されない）

- [ ] **Step 1: `app/page.tsx`の中身を入力フォームに置き換え**

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createTransaction,
  initialCreateTransactionState,
} from "@/app/actions/create-transaction";
import { getCategoriesFor, type TransactionType } from "@/lib/categories";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [type, setType] = useState<TransactionType>("expense");
  const [state, formAction, isPending] = useActionState(
    createTransaction,
    initialCreateTransactionState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const categories = getCategoriesFor(type);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setType("expense");
    }
  }, [state]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">収支登録</h1>

      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`flex-1 rounded px-4 py-2 ${
              type === "expense" ? "bg-black text-white" : "bg-gray-200"
            }`}
          >
            支出
          </button>
          <button
            type="button"
            onClick={() => setType("income")}
            className={`flex-1 rounded px-4 py-2 ${
              type === "income" ? "bg-black text-white" : "bg-gray-200"
            }`}
          >
            収入
          </button>
        </div>
        <input type="hidden" name="type" value={type} />

        <label className="flex flex-col gap-1">
          日付
          <input
            type="date"
            name="date"
            defaultValue={todayString()}
            className="rounded border px-3 py-2"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          金額
          <input
            type="number"
            name="amount"
            min={1}
            step={1}
            className="rounded border px-3 py-2"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          カテゴリ
          <select name="category" className="rounded border px-3 py-2" required>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          メモ（任意）
          <input type="text" name="memo" className="rounded border px-3 py-2" />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {isPending ? "登録中..." : "登録する"}
        </button>

        {state.status === "error" && (
          <p className="text-red-600">{state.message}</p>
        )}
        {state.status === "success" && (
          <p className="text-green-600">{state.message}</p>
        )}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Lintと型チェック**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: エラーなくビルドが成功する

- [ ] **Step 3: コミット**

```bash
git add app/page.tsx
git commit -m "収支登録フォーム画面を実装"
```

---

### Task 7: Supabase接続の設定と手動での動作確認

**Files:**
- Create: `.env.local`（Gitにはコミットしない）

**Interfaces:**
- Consumes: Task 1〜6の全成果物
- Produces: なし（このタスクは動作確認のみ）

- [ ] **Step 1: `.env.local`を作成**

`.env.example`をコピーして`.env.local`を作成し、Task 2で作成したSupabaseプロジェクトのURLとanon keyを設定する（Task 2のセットアップ手順がまだの場合は先に実施する）。

- [ ] **Step 2: 開発サーバーを起動**

Run: `npm run dev`
Expected: `http://localhost:3000` でエラーなく起動する

- [ ] **Step 3: 支出の登録を手動確認**

ブラウザで`http://localhost:3000`を開き、以下を確認する。

1. 「支出」が選択された状態で表示される
2. 日付・金額・カテゴリ（食費など）・メモを入力し、「登録する」を押す
3. 「登録しました」というメッセージが表示され、フォームが空に戻る
4. Supabaseダッシュボードの「Table Editor」→`transactions`テーブルを開き、入力した内容の行が追加されていることを確認する（`type`が`expense`になっていること）

- [ ] **Step 4: 収入の登録を手動確認**

1. 「収入」ボタンを押し、カテゴリの選択肢が「給与 / 副業 / その他」に切り替わることを確認する
2. 日付・金額・カテゴリを入力し、「登録する」を押す
3. Supabaseの`transactions`テーブルに`type`が`income`の行が追加されていることを確認する

- [ ] **Step 5: 入力チェックの動作を確認**

1. 金額を0または空欄のまま「登録する」を押し、エラーメッセージが表示されて保存されないことを確認する

- [ ] **Step 6: 開発サーバーを停止**

起動した`npm run dev`のプロセスを停止する。

（このタスクはコード変更を伴わないため、コミットは不要。`.env.local`はGit管理対象外であることを`git status`で確認しておく）
