import Link from "next/link";
import {
  buildCalendarGrid,
  currentDateString,
  currentMonthString,
  formatMonthLabel,
  getTransactionsForMonth,
  groupTransactionsByDay,
  shiftMonth,
  type Transaction,
} from "@/lib/transactions";
import { TransactionList } from "@/app/transactions/transaction-list";

export const dynamic = "force-dynamic";

function isValidMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(date: string): string {
  const [, monthNum, dayNum] = date.split("-").map(Number);
  const weekday = WEEKDAY_LABELS[new Date(date).getDay()];
  return `${monthNum}月${dayNum}日（${weekday}）`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
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

  const dateParam = resolvedSearchParams.date;
  const selectedDate =
    dateParam && dateParam.startsWith(month)
      ? dateParam
      : month === currentMonthString()
        ? currentDateString()
        : null;

  const selectedDayTransactions = selectedDate
    ? transactions.filter((t) => t.date === selectedDate)
    : [];

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
        <>
          <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={
                  "pb-1 font-bold " +
                  (i === 0
                    ? "text-[#B23A3A]"
                    : i === 6
                      ? "text-[#3A4F7A]"
                      : "text-gray-500")
                }
              >
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
                const isSelected = date === selectedDate;
                return (
                  <Link
                    key={date}
                    href={`/calendar?month=${month}&date=${date}`}
                    className={
                      "flex flex-col items-center gap-1 rounded-lg border py-2 no-underline " +
                      (isSelected
                        ? "border-[#2F6B4F] bg-[#EEF3EC]"
                        : "border-transparent") +
                      " " +
                      (dayIndex === 0
                        ? "text-[#B23A3A]"
                        : dayIndex === 6
                          ? "text-[#3A4F7A]"
                          : "text-gray-900")
                    }
                  >
                    <span>{dayNumber}</span>
                    <span className="flex h-1.5 gap-0.5">
                      {totals && totals.totalIncome > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#2F6B4F]" />
                      )}
                      {totals && totals.totalExpense > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#A4432E]" />
                      )}
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-200 pt-4">
            <h2 className="text-sm font-bold text-gray-500">
              {selectedDate
                ? formatDateLabel(selectedDate)
                : "日付を選んでください"}
            </h2>
            <TransactionList
              transactions={selectedDayTransactions}
              month={month}
              emptyMessage="この日の取引はありません。"
            />
          </div>
        </>
      )}

      <Link href="/" className="text-center text-sm text-gray-500 underline">
        登録画面に戻る
      </Link>
    </main>
  );
}
