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
