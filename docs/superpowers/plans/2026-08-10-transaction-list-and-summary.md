# 取引一覧・月別集計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/transactions`ページで、月ごとの取引一覧・集計（合計収入・合計支出・差額・カテゴリ別内訳）を表示し、各取引の編集・削除ができるようにする。

**Architecture:** `/transactions`（一覧・集計）と`/transactions/[id]/edit`（編集）をServer Component（サーバー側でSupabaseからデータ取得してHTMLを組み立てる部品）として実装する。表示中の月はURLのクエリパラメータ`month`（`YYYY-MM`形式）で管理する。削除・更新はServer Actions（既存の`createTransaction`と同じ仕組み）として新設する。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / @supabase/supabase-js

## Global Constraints

- 既存の`transactions`テーブル（`lib/supabase/server.ts`の`createServerSupabaseClient()`経由）のみを使う。新しいテーブルは作らない
- カテゴリは`lib/categories.ts`の既存の固定リストをそのまま使う（変更しない）
- **`"use server"`ファイルはファイル先頭にディレクティブを書き、async関数のみexportする**（関数内インラインの`"use server"`は使わない）。型や定数を共有したい場合は別ファイルに分離し、`"use server"`ファイルからは再exportしない（`app/actions/create-transaction.ts`と同じ方針。詳細はCLAUDE.md参照）
- Next.js App RouterのServer Componentでは、`params`・`searchParams`はPromise型（Next.js 15以降の仕様）。必ず`await`してから使うこと
- 表示中の月はURLのクエリパラメータ`month`（`YYYY-MM`形式）で管理し、クライアント側のReact stateでは持たない
- 自動テスト（Jest等）は今回も導入しない。各タスクの検証は`npm run lint`と`npm run build`（型チェック含む）、最終タスクでの手動動作確認で行う
- next-pwaはTurbopack非対応のため、`npm run dev` / `npm run build`は既存の`package.json`設定どおり`--webpack`付きで実行する
- RLS（Row Level Security）は変更しない（引き続き全許可のまま）
- 対象ファイルはすべて`c:\Users\kiaiy\OneDrive\Desktop\家計簿`配下（リポジトリルート）

---

### Task 1: 月ユーティリティ・集計・データ取得ヘルパー

**Files:**
- Create: `lib/transactions.ts`

**Interfaces:**
- Consumes:
  - `createServerSupabaseClient()` from `@/lib/supabase/server`
  - `type TransactionType` from `@/lib/categories`
- Produces（Task 4, 5, 6, 7で使用）:
  - `type Transaction = { id: string; date: string; type: TransactionType; category: string; amount: number; memo: string | null }`
  - `type MonthlySummary = { totalIncome: number; totalExpense: number; balance: number; incomeByCategory: Record<string, number>; expenseByCategory: Record<string, number> }`
  - `currentMonthString(): string`（`YYYY-MM`、ローカル時刻基準）
  - `shiftMonth(month: string, delta: number): string`
  - `formatMonthLabel(month: string): string`（例: `"2026年8月"`）
  - `summarizeTransactions(transactions: Transaction[]): MonthlySummary`
  - `getTransactionsForMonth(month: string): Promise<Transaction[]>`
  - `getTransactionById(id: string): Promise<Transaction | null>`

- [ ] **Step 1: `lib/transactions.ts`を作成**

```typescript
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/lib/categories";

export type Transaction = {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  memo: string | null;
};

export type MonthlySummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ローカル時刻基準（UTC基準の.toISOString()は日本時間の早朝に日付がずれるため使わない）
export function currentMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const d = new Date(year, monthNum - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return `${year}年${monthNum}月`;
}

function getMonthRange(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split("-").map(Number);
  const start = `${year}-${pad(monthNum)}-01`;
  const endDate = new Date(year, monthNum, 1);
  const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-01`;
  return { start, end };
}

export function summarizeTransactions(
  transactions: Transaction[]
): MonthlySummary {
  const summary: MonthlySummary = {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    incomeByCategory: {},
    expenseByCategory: {},
  };

  for (const t of transactions) {
    if (t.type === "income") {
      summary.totalIncome += t.amount;
      summary.incomeByCategory[t.category] =
        (summary.incomeByCategory[t.category] ?? 0) + t.amount;
    } else {
      summary.totalExpense += t.amount;
      summary.expenseByCategory[t.category] =
        (summary.expenseByCategory[t.category] ?? 0) + t.amount;
    }
  }

  summary.balance = summary.totalIncome - summary.totalExpense;
  return summary;
}

export async function getTransactionsForMonth(
  month: string
): Promise<Transaction[]> {
  const { start, end } = getMonthRange(month);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, type, category, amount, memo")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false });

  if (error) {
    throw new Error(`取引の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []) as Transaction[];
}

export async function getTransactionById(
  id: string
): Promise<Transaction | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, type, category, amount, memo")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`取引の取得に失敗しました: ${error.message}`);
  }

  return data as Transaction | null;
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run build`
Expected: エラーなくビルドが成功する

- [ ] **Step 3: コミット**

```bash
git add lib/transactions.ts
git commit -m "月ユーティリティ・集計・データ取得ヘルパーを追加"
```

---

### Task 2: 削除のServer Action

**Files:**
- Create: `app/actions/delete-transaction.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` from `@/lib/supabase/server`
- Produces（Task 4で使用）: `deleteTransaction(id: string): Promise<{ status: "success" | "error"; message: string }>`

- [ ] **Step 1: `app/actions/delete-transaction.ts`を作成**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function deleteTransaction(
  id: string
): Promise<{ status: "success" | "error"; message: string }> {
  const genericErrorMessage =
    "削除に失敗しました。通信環境を確認してもう一度お試しください。";

  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      return { status: "error", message: genericErrorMessage };
    }
  } catch (error) {
    console.error(error);
    return { status: "error", message: genericErrorMessage };
  }

  revalidatePath("/transactions");
  return { status: "success", message: "削除しました。" };
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run build`
Expected: エラーなくビルドが成功する

- [ ] **Step 3: コミット**

```bash
git add app/actions/delete-transaction.ts
git commit -m "取引削除のServer Actionを追加"
```

---

### Task 3: 更新のServer Action

**Files:**
- Create: `app/actions/update-transaction.ts`

**Interfaces:**
- Consumes:
  - `createServerSupabaseClient()` from `@/lib/supabase/server`
  - `getCategoriesFor(type)`, `type TransactionType` from `@/lib/categories`
  - `type CreateTransactionState` from `@/lib/create-transaction-types`
- Produces（Task 6で使用）: `updateTransaction(id: string, prevState: CreateTransactionState, formData: FormData): Promise<CreateTransactionState>`

- [ ] **Step 1: `app/actions/update-transaction.ts`を作成**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCategoriesFor, type TransactionType } from "@/lib/categories";
import type { CreateTransactionState } from "@/lib/create-transaction-types";

export async function updateTransaction(
  id: string,
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

  const monthValue = formData.get("month");
  const returnMonth =
    typeof monthValue === "string" && monthValue !== "" ? monthValue : "";

  const genericErrorMessage =
    "保存に失敗しました。通信環境を確認してもう一度お試しください。";

  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase
      .from("transactions")
      .update({
        type,
        date: dateValue,
        category: categoryValue,
        amount,
        memo,
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      return { status: "error", message: genericErrorMessage };
    }
  } catch (error) {
    console.error(error);
    return { status: "error", message: genericErrorMessage };
  }

  revalidatePath("/transactions");
  redirect(returnMonth ? `/transactions?month=${returnMonth}` : "/transactions");
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run build`
Expected: エラーなくビルドが成功する

- [ ] **Step 3: コミット**

```bash
git add app/actions/update-transaction.ts
git commit -m "取引更新のServer Actionを追加"
```

---

### Task 4: 取引一覧のクライアントコンポーネント

**Files:**
- Create: `app/transactions/transaction-list.tsx`

**Interfaces:**
- Consumes:
  - `deleteTransaction(id)` from `@/app/actions/delete-transaction`（Task 2）
  - `type Transaction` from `@/lib/transactions`（Task 1、型のみ使用）
- Produces（Task 5で使用）: `TransactionList({ transactions, month }: { transactions: Transaction[]; month: string })` コンポーネント

- [ ] **Step 1: `app/transactions/transaction-list.tsx`を作成**

```tsx
"use client";

import Link from "next/link";
import { deleteTransaction } from "@/app/actions/delete-transaction";
import type { Transaction } from "@/lib/transactions";

export function TransactionList({
  transactions,
  month,
}: {
  transactions: Transaction[];
  month: string;
}) {
  async function handleDelete(id: string) {
    if (!confirm("この取引を削除しますか？")) return;
    const result = await deleteTransaction(id);
    if (result.status === "error") {
      alert(result.message);
    }
  }

  if (transactions.length === 0) {
    return <p className="text-gray-500">この月の取引はまだありません。</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {transactions.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between gap-2 rounded border px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="text-sm text-gray-500">
              {t.date}　{t.category}
              {t.memo ? `　${t.memo}` : ""}
            </span>
            <span
              className={
                t.type === "income" ? "text-blue-600" : "text-red-600"
              }
            >
              {t.type === "income" ? "+" : "-"}¥{t.amount.toLocaleString()}
            </span>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/transactions/${t.id}/edit?month=${month}`}
              className="rounded bg-gray-200 px-3 py-1 text-sm text-black"
            >
              編集
            </Link>
            <button
              type="button"
              onClick={() => handleDelete(t.id)}
              className="rounded bg-red-100 px-3 py-1 text-sm text-red-700"
            >
              削除
            </button>
          </div>
        </li>
      ))}
    </ul>
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
git add app/transactions/transaction-list.tsx
git commit -m "取引一覧のクライアントコンポーネントを追加"
```

---

### Task 5: 一覧・集計ページ

**Files:**
- Create: `app/transactions/page.tsx`

**Interfaces:**
- Consumes:
  - `currentMonthString`, `formatMonthLabel`, `getTransactionsForMonth`, `shiftMonth`, `summarizeTransactions`, `type Transaction` from `@/lib/transactions`（Task 1）
  - `TransactionList` from `./transaction-list`（Task 4）
- Produces: `/transactions?month=YYYY-MM` ページ（他タスクからは参照されない。Task 7・8からURL文字列として参照）

- [ ] **Step 1: `app/transactions/page.tsx`を作成**

```tsx
import Link from "next/link";
import {
  currentMonthString,
  formatMonthLabel,
  getTransactionsForMonth,
  shiftMonth,
  summarizeTransactions,
  type Transaction,
} from "@/lib/transactions";
import { TransactionList } from "./transaction-list";

function isValidMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;
  const month =
    monthParam && isValidMonth(monthParam) ? monthParam : currentMonthString();

  let transactions: Transaction[] = [];
  let loadError: string | null = null;
  try {
    transactions = await getTransactionsForMonth(month);
  } catch {
    loadError =
      "取引の取得に失敗しました。通信環境を確認してもう一度お試しください。";
  }

  const summary = summarizeTransactions(transactions);
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/transactions?month=${prevMonth}`}
          className="rounded bg-gray-200 px-3 py-1 text-black"
        >
          ◀ 前月
        </Link>
        <h1 className="text-lg font-bold">{formatMonthLabel(month)}</h1>
        <Link
          href={`/transactions?month=${nextMonth}`}
          className="rounded bg-gray-200 px-3 py-1 text-black"
        >
          翌月 ▶
        </Link>
      </div>

      {loadError && <p className="text-red-600">{loadError}</p>}

      <section className="flex flex-col gap-2 rounded border p-4">
        <h2 className="font-bold">集計</h2>
        <p>収入合計：¥{summary.totalIncome.toLocaleString()}</p>
        <p>支出合計：¥{summary.totalExpense.toLocaleString()}</p>
        <p>差額：¥{summary.balance.toLocaleString()}</p>

        {Object.keys(summary.expenseByCategory).length > 0 && (
          <div>
            <h3 className="text-sm font-bold">支出の内訳</h3>
            <ul className="text-sm text-gray-700">
              {Object.entries(summary.expenseByCategory).map(
                ([category, amount]) => (
                  <li key={category}>
                    {category}：¥{amount.toLocaleString()}
                  </li>
                )
              )}
            </ul>
          </div>
        )}

        {Object.keys(summary.incomeByCategory).length > 0 && (
          <div>
            <h3 className="text-sm font-bold">収入の内訳</h3>
            <ul className="text-sm text-gray-700">
              {Object.entries(summary.incomeByCategory).map(
                ([category, amount]) => (
                  <li key={category}>
                    {category}：¥{amount.toLocaleString()}
                  </li>
                )
              )}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">取引一覧</h2>
        <TransactionList transactions={transactions} month={month} />
      </section>

      <Link href="/" className="text-center text-sm text-gray-500 underline">
        登録画面に戻る
      </Link>
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
git add app/transactions/page.tsx
git commit -m "取引一覧・月別集計ページを追加"
```

---

### Task 6: 編集フォームのクライアントコンポーネント

**Files:**
- Create: `app/transactions/[id]/edit/edit-transaction-form.tsx`

**Interfaces:**
- Consumes:
  - `updateTransaction(id, prevState, formData)` from `@/app/actions/update-transaction`（Task 3）
  - `initialCreateTransactionState`, `type CreateTransactionState` from `@/lib/create-transaction-types`
  - `getCategoriesFor(type)`, `type TransactionType` from `@/lib/categories`
  - `type Transaction` from `@/lib/transactions`（Task 1、型のみ使用）
- Produces（Task 7で使用）: `EditTransactionForm({ transaction, month }: { transaction: Transaction; month: string })` コンポーネント

- [ ] **Step 1: `app/transactions/[id]/edit/edit-transaction-form.tsx`を作成**

```tsx
"use client";

import { useActionState, useState } from "react";
import { updateTransaction } from "@/app/actions/update-transaction";
import { initialCreateTransactionState } from "@/lib/create-transaction-types";
import { getCategoriesFor, type TransactionType } from "@/lib/categories";
import type { Transaction } from "@/lib/transactions";

export function EditTransactionForm({
  transaction,
  month,
}: {
  transaction: Transaction;
  month: string;
}) {
  const [type, setType] = useState<TransactionType>(transaction.type);
  const boundUpdateTransaction = updateTransaction.bind(null, transaction.id);
  const [state, formAction, isPending] = useActionState(
    boundUpdateTransaction,
    initialCreateTransactionState
  );
  const categories = getCategoriesFor(type);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType("expense")}
          className={`flex-1 rounded px-4 py-2 ${
            type === "expense" ? "bg-black text-white" : "bg-gray-200 text-black"
          }`}
        >
          支出
        </button>
        <button
          type="button"
          onClick={() => setType("income")}
          className={`flex-1 rounded px-4 py-2 ${
            type === "income" ? "bg-black text-white" : "bg-gray-200 text-black"
          }`}
        >
          収入
        </button>
      </div>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="month" value={month} />

      <label className="flex flex-col gap-1">
        日付
        <input
          type="date"
          name="date"
          defaultValue={transaction.date}
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
          defaultValue={transaction.amount}
          className="rounded border px-3 py-2"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        カテゴリ
        <select
          name="category"
          defaultValue={transaction.category}
          className="rounded border px-3 py-2"
          required
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        メモ（任意）
        <input
          type="text"
          name="memo"
          defaultValue={transaction.memo ?? ""}
          className="rounded border px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "保存中..." : "保存する"}
      </button>

      {state.status === "error" && (
        <p className="text-red-600">{state.message}</p>
      )}
    </form>
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
git add "app/transactions/[id]/edit/edit-transaction-form.tsx"
git commit -m "取引編集フォームのクライアントコンポーネントを追加"
```

---

### Task 7: 編集ページ

**Files:**
- Create: `app/transactions/[id]/edit/page.tsx`

**Interfaces:**
- Consumes:
  - `getTransactionById(id)`, `type Transaction` from `@/lib/transactions`（Task 1）
  - `EditTransactionForm` from `./edit-transaction-form`（Task 6）
- Produces: `/transactions/[id]/edit?month=YYYY-MM` ページ（他タスクからは参照されない）

- [ ] **Step 1: `app/transactions/[id]/edit/page.tsx`を作成**

```tsx
import Link from "next/link";
import { getTransactionById, type Transaction } from "@/lib/transactions";
import { EditTransactionForm } from "./edit-transaction-form";

export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;

  let transaction: Transaction | null = null;
  let loadError: string | null = null;
  try {
    transaction = await getTransactionById(id);
  } catch {
    loadError =
      "取引の取得に失敗しました。通信環境を確認してもう一度お試しください。";
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">取引を編集</h1>

      {loadError && <p className="text-red-600">{loadError}</p>}
      {!loadError && !transaction && <p>取引が見つかりません。</p>}
      {!loadError && transaction && (
        <EditTransactionForm transaction={transaction} month={month ?? ""} />
      )}

      <Link
        href="/transactions"
        className="text-center text-sm text-gray-500 underline"
      >
        一覧に戻る
      </Link>
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
git add "app/transactions/[id]/edit/page.tsx"
git commit -m "取引編集ページを追加"
```

---

### Task 8: トップページに一覧へのリンクを追加

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `/transactions`（Task 5のページ。URL文字列としてのみ参照）
- Produces: なし

- [ ] **Step 1: `app/page.tsx`の`<form>`の後（`</main>`の直前）にリンクを追加**

`app/page.tsx`の先頭に`import Link from "next/link";`を追加し、`</form>`の直後・`</main>`の直前に以下を追加する。

```tsx
      <Link
        href="/transactions"
        className="text-center text-sm text-gray-500 underline"
      >
        一覧・集計を見る
      </Link>
```

- [ ] **Step 2: Lintと型チェック**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: エラーなくビルドが成功する

- [ ] **Step 3: コミット**

```bash
git add app/page.tsx
git commit -m "登録画面から一覧・集計ページへのリンクを追加"
```

---

### Task 9: 手動での動作確認

**Files:**
- なし（コード変更を伴わない）

**Interfaces:**
- Consumes: Task 1〜8の全成果物
- Produces: なし（このタスクは動作確認のみ）

- [ ] **Step 1: 開発サーバーを起動**

Run: `npm run dev`
Expected: `http://localhost:3000` でエラーなく起動する

- [ ] **Step 2: 複数月にまたがるデータを登録**

トップページ（`/`）で、今月と先月それぞれに支出・収入を2〜3件ずつ登録する（カテゴリを何種類か変えて登録する）。

- [ ] **Step 3: 一覧・集計ページで月の切り替えを確認**

1. 「一覧・集計を見る」リンクから`/transactions`を開く
2. 今月の取引一覧・集計が表示されることを確認する
3. 「◀ 前月」を押し、先月の取引一覧・集計に切り替わることを確認する
4. 「翌月 ▶」を押し、元の月（今月）に戻ることを確認する

- [ ] **Step 4: 集計内容の正しさを確認**

表示されている「収入合計」「支出合計」「差額」「カテゴリ別内訳」が、Step 2で登録した内容と一致することを確認する。

- [ ] **Step 5: 編集を確認**

1. 一覧のいずれかの取引で「編集」を押す
2. 金額・カテゴリ・メモを変更して「保存する」を押す
3. 一覧ページに戻り、変更内容が反映されていることを確認する
4. Supabaseダッシュボードの「Table Editor」でも該当行が更新されていることを確認する

- [ ] **Step 6: 削除を確認**

1. 一覧のいずれかの取引で「削除」を押す
2. 確認ダイアログが表示されることを確認し、OKを押す
3. 一覧からその行が消えることを確認する
4. Supabaseダッシュボードでも該当行が削除されていることを確認する

- [ ] **Step 7: 存在しないIDでのエラー表示を確認**

ブラウザで`/transactions/00000000-0000-0000-0000-000000000000/edit`を直接開き、「取引が見つかりません」と表示されることを確認する。

- [ ] **Step 8: 開発サーバーを停止**

起動した`npm run dev`のプロセスを停止する。

（このタスクはコード変更を伴わないため、コミットは不要）
