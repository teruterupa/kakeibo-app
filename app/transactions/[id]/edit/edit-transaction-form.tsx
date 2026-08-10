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
