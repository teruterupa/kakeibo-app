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
            <TransactionList
              transactions={displayedTransactions}
              month={month}
              emptyMessage={
                filterDate
                  ? "この日の取引はありません。"
                  : "この月の取引はまだありません。"
              }
            />
          </section>
        </>
      )}

      <Link href="/" className="text-center text-sm text-gray-500 underline">
        登録画面に戻る
      </Link>
    </main>
  );
}
