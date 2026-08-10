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
