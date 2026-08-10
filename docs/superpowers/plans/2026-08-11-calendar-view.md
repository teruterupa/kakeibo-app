# カレンダー表示・ボタン大型化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 月ごとにお金の動きを一目で見られるカレンダーページ（`/calendar`）を追加し、トップページの一覧・集計への導線を押しやすいボタンに変更する。

**Architecture:** 既存の`lib/transactions.ts`のデータ取得・月計算ロジックを再利用し、新たに「日付ごとの集計」「カレンダーグリッド生成」の純粋関数を追加する。カレンダーページ（Server Component）はその関数を使って月の全取引を日ごとにグルーピングして描画し、各日をタップすると既存の`/transactions`ページへ`date`クエリパラメータ付きで遷移する。`/transactions`ページ側はその`date`パラメータを見て一覧を絞り込む（集計は月全体のまま）。

**Tech Stack:** Next.js 16 (App Router, `--webpack`), React 19, TypeScript, Tailwind CSS v4, Supabase（既存の`lib/transactions.ts`経由）

## Global Constraints

- Next.js 16では`searchParams`は`Promise`であり、必ず`await`すること。
- 月の状態はReactの状態ではなく`month`クエリパラメータ（`YYYY-MM`形式）で管理する（`/transactions`と同じパターン）。
- 自動テストは追加しない。各タスックの完了確認は`npm run lint`と`npm run build`、および最終タスクでの手動ブラウザ確認で行う。
- `npm run dev` / `npm run build`は`--webpack`フラグ必須（`package.json`に設定済み、変更しないこと）。
- 日付・月の計算は`.toISOString()`（UTC基準）を使わず、既存の`lib/transactions.ts`のローカル時刻基準ヘルパー（`pad`、`shiftMonth`、`formatMonthLabel`と同じ方式）に合わせること。
- 色分けは既存の`TransactionList`と同じ配色を使う：収入＝青字（`text-blue-600`）、支出＝赤字（`text-red-600`）。
- RLSは現状すべて許可のまま（認証未導入のため、所有者チェックは不要）。
- 新規のSupabaseクエリ関数は追加しない。既存の`getTransactionsForMonth(month)`の取得結果を使い回す。

---

### Task 1: 日ごとの集計・カレンダーグリッド生成ロジックを追加

**Files:**
- Modify: `lib/transactions.ts`（`summarizeTransactions`関数の直後、`getTransactionsForMonth`関数の直前に追加）

**Interfaces:**
- Consumes: 既存の`Transaction`型、既存の非公開`pad(n: number): string`関数（同一ファイル内）
- Produces:
  - `export type DailyTotal = { totalIncome: number; totalExpense: number }`
  - `export function groupTransactionsByDay(transactions: Transaction[]): Record<string, DailyTotal>`
  - `export function buildCalendarGrid(month: string): (string | null)[][]`（週ごとの配列。各要素は`YYYY-MM-DD`の日付文字列、または月の範囲外を埋める`null`）

- [ ] **Step 1: `lib/transactions.ts`の`summarizeTransactions`関数の直後（75行目の閉じ`}`の後）、`getTransactionsForMonth`関数の直前に以下を追加する**

```typescript
export type DailyTotal = {
  totalIncome: number;
  totalExpense: number;
};

export function groupTransactionsByDay(
  transactions: Transaction[]
): Record<string, DailyTotal> {
  const result: Record<string, DailyTotal> = {};

  for (const t of transactions) {
    if (!result[t.date]) {
      result[t.date] = { totalIncome: 0, totalExpense: 0 };
    }
    if (t.type === "income") {
      result[t.date].totalIncome += t.amount;
    } else {
      result[t.date].totalExpense += t.amount;
    }
  }

  return result;
}

export function buildCalendarGrid(month: string): (string | null)[][] {
  const [year, monthNum] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNum - 1, 1);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const startWeekday = firstDay.getDay();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${pad(monthNum)}-${pad(day)}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
```

`buildCalendarGrid`の週の並びは日曜始まり（`Date.getDay()`は`0`が日曜）。`groupTransactionsByDay`は取引がない日はキー自体を作らない（呼び出し側で`result[date]`が`undefined`になることを前提にする）。

- [ ] **Step 2: 型チェックを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 3: ビルドが通ることを確認する**

Run: `npm run build`
Expected: ビルド成功（型エラーなし）

- [ ] **Step 4: コミット**

```bash
git add lib/transactions.ts
git commit -m "feat: 日ごとの集計とカレンダーグリッド生成ロジックを追加"
```

---

### Task 2: カレンダーページを新設

**Files:**
- Create: `app/calendar/page.tsx`

**Interfaces:**
- Consumes:
  - `Transaction`型、`currentMonthString()`、`formatMonthLabel(month)`、`shiftMonth(month, delta)`、`getTransactionsForMonth(month)`（すべて`lib/transactions.ts`の既存エクスポート）
  - Task 1で追加した`groupTransactionsByDay(transactions)`、`buildCalendarGrid(month)`、`DailyTotal`型
- Produces: `/calendar?month=YYYY-MM`ページ。各日のセルは`/transactions?month=YYYY-MM&date=YYYY-MM-DD`へのリンク（Task 3が読み取るクエリパラメータ名と形式に一致させること）

- [ ] **Step 1: `app/calendar/page.tsx`を作成する**

```tsx
import Link from "next/link";
import {
  buildCalendarGrid,
  currentMonthString,
  formatMonthLabel,
  getTransactionsForMonth,
  groupTransactionsByDay,
  shiftMonth,
  type Transaction,
} from "@/lib/transactions";

function isValidMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default async function CalendarPage({
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

  const dailyTotals = groupTransactionsByDay(transactions);
  const weeks = buildCalendarGrid(month);
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/calendar?month=${prevMonth}`}
          className="rounded bg-gray-200 px-3 py-1 text-black"
        >
          ◀ 前月
        </Link>
        <h1 className="text-lg font-bold">{formatMonthLabel(month)}</h1>
        <Link
          href={`/calendar?month=${nextMonth}`}
          className="rounded bg-gray-200 px-3 py-1 text-black"
        >
          翌月 ▶
        </Link>
      </div>

      {loadError ? (
        <p className="text-red-600">{loadError}</p>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="font-bold text-gray-500">
              {label}
            </div>
          ))}
          {weeks.flatMap((week, weekIndex) =>
            week.map((date, dayIndex) => {
              if (!date) {
                return <div key={`${weekIndex}-${dayIndex}`} />;
              }
              const totals = dailyTotals[date];
              const dayNumber = Number(date.split("-")[2]);
              return (
                <Link
                  key={date}
                  href={`/transactions?month=${month}&date=${date}`}
                  className="flex flex-col items-center gap-0.5 rounded border px-1 py-2"
                >
                  <span>{dayNumber}</span>
                  {totals && totals.totalIncome > 0 && (
                    <span className="text-xs text-blue-600">
                      +¥{totals.totalIncome.toLocaleString()}
                    </span>
                  )}
                  {totals && totals.totalExpense > 0 && (
                    <span className="text-xs text-red-600">
                      -¥{totals.totalExpense.toLocaleString()}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      )}

      <Link href="/" className="text-center text-sm text-gray-500 underline">
        登録画面に戻る
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 3: ビルドが通ることを確認する**

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 4: コミット**

```bash
git add app/calendar/page.tsx
git commit -m "feat: カレンダーページ(/calendar)を追加"
```

---

### Task 3: 一覧ページ（`/transactions`）で日付絞り込みに対応する

**Files:**
- Modify: `app/transactions/page.tsx`（全体を以下の内容に置き換える）

**Interfaces:**
- Consumes: Task 2が生成するリンク形式`/transactions?month=YYYY-MM&date=YYYY-MM-DD`と一致する`date`クエリパラメータを読み取る
- Produces: 変更なし（`TransactionList`コンポーネントのpropsは既存のまま）

- [ ] **Step 1: `app/transactions/page.tsx`を以下の内容で置き換える**

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

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateLabel(date: string): string {
  const [, monthNum, day] = date.split("-").map(Number);
  return `${monthNum}月${day}日`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;
  const month =
    monthParam && isValidMonth(monthParam) ? monthParam : currentMonthString();

  const dateParam = resolvedSearchParams.date;
  const filterDate =
    dateParam && isValidDate(dateParam) && dateParam.startsWith(month)
      ? dateParam
      : null;

  let transactions: Transaction[] = [];
  let loadError: string | null = null;
  try {
    transactions = await getTransactionsForMonth(month);
  } catch {
    loadError =
      "取引の取得に失敗しました。通信環境を確認してもう一度お試しください。";
  }

  const summary = summarizeTransactions(transactions);
  const displayedTransactions = filterDate
    ? transactions.filter((t) => t.date === filterDate)
    : transactions;
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

      {loadError ? (
        <p className="text-red-600">{loadError}</p>
      ) : (
        <>
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
            <div className="flex items-center justify-between">
              <h2 className="font-bold">
                {filterDate ? `${formatDateLabel(filterDate)}の取引` : "取引一覧"}
              </h2>
              {filterDate && (
                <Link
                  href={`/transactions?month=${month}`}
                  className="text-sm text-gray-500 underline"
                >
                  月全体を表示
                </Link>
              )}
            </div>
            <TransactionList transactions={displayedTransactions} month={month} />
          </section>
        </>
      )}

      <Link href="/" className="text-center text-sm text-gray-500 underline">
        登録画面に戻る
      </Link>
    </main>
  );
}
```

`filterDate`は`date`が`YYYY-MM-DD`形式であり、かつ選択中の`month`（`YYYY-MM`）で始まる場合のみ有効とする。それ以外（不正な形式・月をまたぐ日付など）は`null`となり、絞り込みなしの月全体表示にフォールバックする。集計（`summary`）は常に`transactions`（月全体）から計算し、`displayedTransactions`（絞り込み後）からは計算しない。

- [ ] **Step 2: 型チェックを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 3: ビルドが通ることを確認する**

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 4: コミット**

```bash
git add app/transactions/page.tsx
git commit -m "feat: 取引一覧ページで日付絞り込み表示に対応"
```

---

### Task 4: トップページのボタンを大型化し、カレンダーへの導線を追加

**Files:**
- Modify: `app/page.tsx:125-130`

**Interfaces:**
- Consumes: Task 2で作成した`/calendar`ルート
- Produces: 変更なし（他コンポーネントからの参照なし）

- [ ] **Step 1: `app/page.tsx`の以下の部分（125〜130行目、`</form>`の直後にある単一の`Link`）を置き換える**

置き換え前：

```tsx
      <Link
        href="/transactions"
        className="text-center text-sm text-gray-500 underline"
      >
        一覧・集計を見る
      </Link>
```

置き換え後：

```tsx
      <div className="flex flex-col gap-2">
        <Link
          href="/transactions"
          className="rounded bg-gray-800 px-4 py-3 text-center text-white"
        >
          一覧・集計を見る
        </Link>
        <Link
          href="/calendar"
          className="rounded bg-gray-800 px-4 py-3 text-center text-white"
        >
          カレンダーで見る
        </Link>
      </div>
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 3: ビルドが通ることを確認する**

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 4: コミット**

```bash
git add app/page.tsx
git commit -m "feat: トップページのボタンを大型化しカレンダーへの導線を追加"
```

---

### Task 5: 手動動作確認

**Files:**
- なし（コード変更を行わない、確認のみのタスク）

**Interfaces:**
- Consumes: Task 1〜4で実装したすべての機能
- Produces: なし

- [ ] **Step 1: 開発サーバーを起動する**

Run: `npm run dev`

- [ ] **Step 2: トップページ（`/`）で以下を確認する**

  - 「一覧・集計を見る」「カレンダーで見る」の2つのボタンが、押しやすい大きさで表示されている
  - 「一覧・集計を見る」をタップすると`/transactions`（現在月）に遷移する
  - 「カレンダーで見る」をタップすると`/calendar`（現在月）に遷移する

- [ ] **Step 3: カレンダーページ（`/calendar`）で以下を確認する**

  - 現在月のカレンダーが正しい曜日配置で表示される（1日の曜日が実際のカレンダーと一致すること）
  - 収入がある日は青字で`+¥金額`が表示される
  - 支出がある日は赤字で`-¥金額`が表示される
  - 収入・支出どちらもある日は両方表示される
  - どちらもない日は金額が表示されない
  - 「◀ 前月」「翌月 ▶」で月が正しく切り替わる
  - 取引がある日をタップすると、`/transactions?month=...&date=...`に遷移し、その日の取引だけが一覧に表示される

- [ ] **Step 4: 一覧ページ（`/transactions`）の絞り込み表示で以下を確認する**

  - 見出しが「◯月◯日の取引」になっている
  - 集計セクションは月全体の金額のまま変わらない（絞り込み日だけの金額になっていないこと）
  - 「月全体を表示」をタップすると、絞り込みが解除されその月の全取引一覧に戻る
  - 絞り込み表示中でも、取引の編集・削除が問題なく動作する

- [ ] **Step 5: エラー時の表示を確認する**

  - `.env.local`の`NEXT_PUBLIC_SUPABASE_URL`を一時的に不正な値に書き換えて`/calendar`にアクセスし、エラーメッセージが表示されカレンダー本体が描画されないことを確認する
  - 確認後、`.env.local`の値を元に戻す

- [ ] **Step 6: 開発サーバーを停止する**

すべて確認できたら、このタスクは完了（コミットするコード変更はない）。
