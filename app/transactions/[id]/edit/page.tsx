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
