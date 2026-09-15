"use client";

import Link from "next/link";
import { deleteTransaction } from "@/app/actions/delete-transaction";
import type { Transaction } from "@/lib/transactions";

export function TransactionList({
  transactions,
  month,
  emptyMessage = "この月の取引はまだありません。",
}: {
  transactions: Transaction[];
  month: string;
  emptyMessage?: string;
}) {
  async function handleDelete(id: string) {
    if (!confirm("この取引を削除しますか？")) return;
    try {
      const result = await deleteTransaction(id);
      if (result.status === "error") {
        alert(result.message);
      }
    } catch {
      alert("削除に失敗しました。通信環境を確認してもう一度お試しください。");
    }
  }

  if (transactions.length === 0) {
    return <p className="text-gray-500">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {transactions.map((t) => (
        <li
          key={t.id}
          className="flex items-center gap-3 rounded-md border border-gray-200 py-2 pr-3"
        >
          <span
            aria-hidden
            className={
              "h-10 w-1 shrink-0 rounded-full " +
              (t.type === "income" ? "bg-[#2F6B4F]" : "bg-[#A4432E]")
            }
          />
          <div className="flex flex-1 flex-col">
            <span className="text-sm text-gray-500">
              {t.date}　{t.category}
              {t.memo ? `　${t.memo}` : ""}
            </span>
            <span
              className={
                "font-medium tabular-nums " +
                (t.type === "income" ? "text-[#2F6B4F]" : "text-[#A4432E]")
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
