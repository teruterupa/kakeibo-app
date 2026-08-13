import Link from "next/link";
import { getUncategorizedTransactions, type Transaction } from "@/lib/transactions";

export default async function UncategorizedTransactionsPage() {
  let transactions: Transaction[] = [];
  let loadError: string | null = null;
  try {
    transactions = await getUncategorizedTransactions();
  } catch {
    loadError =
      "取引の取得に失敗しました。通信環境を確認してもう一度お試しください。";
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">未分類の取引</h1>

      {loadError && <p className="text-red-600">{loadError}</p>}

      {!loadError && transactions.length === 0 && (
        <p className="text-gray-500">未分類の取引はありません。</p>
      )}

      {!loadError && transactions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {transactions.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded border px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">
                  {t.date}
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
              <Link
                href={`/transactions/${t.id}/categorize`}
                className="rounded bg-black px-3 py-1 text-sm text-white"
              >
                分類する
              </Link>
            </li>
          ))}
        </ul>
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
