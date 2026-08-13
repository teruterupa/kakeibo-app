import Link from "next/link";
import { getTransactionById, type Transaction } from "@/lib/transactions";
import { getCategorizableCategoriesFor } from "@/lib/categories";
import { categorizeTransaction } from "@/app/actions/categorize-transaction";

function BackLink() {
  return (
    <Link
      href="/transactions"
      className="text-center text-sm text-gray-500 underline"
    >
      あとで選ぶ（一覧に戻る）
    </Link>
  );
}

export default async function CategorizeTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let fetched: Transaction | null = null;
  let loadError: string | null = null;
  try {
    fetched = await getTransactionById(id);
  } catch {
    loadError =
      "取引の取得に失敗しました。通信環境を確認してもう一度お試しください。";
  }

  if (loadError) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <h1 className="text-xl font-bold">カテゴリを選択</h1>
        <p className="text-red-600">{loadError}</p>
        <BackLink />
      </main>
    );
  }

  if (!fetched) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <h1 className="text-xl font-bold">カテゴリを選択</h1>
        <p>取引が見つかりません。</p>
        <BackLink />
      </main>
    );
  }

  // constに入れ直すことで、以下のmapコールバック内でも
  // 「取引がnullでない」ことの型の絞り込みを保てるようにする。
  const transaction: Transaction = fetched;
  const categories = getCategorizableCategoriesFor(transaction.type);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">カテゴリを選択</h1>

      <p className="text-gray-600">
        {transaction.date}　¥{transaction.amount.toLocaleString()}
        {transaction.memo ? `　${transaction.memo}` : ""}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {categories.map((category) => (
          <form
            key={category}
            action={categorizeTransaction.bind(null, transaction.id, category)}
          >
            <button
              type="submit"
              className="w-full rounded bg-gray-200 px-4 py-6 text-lg text-black"
            >
              {category}
            </button>
          </form>
        ))}
      </div>

      <BackLink />
    </main>
  );
}
