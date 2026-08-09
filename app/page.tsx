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
      // サーバーアクションの結果（送信成功）に応じたリセットのため、意図的にeffect内でsetStateしている
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
