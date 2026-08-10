"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCategoriesFor, type TransactionType } from "@/lib/categories";
import type { CreateTransactionState } from "@/lib/create-transaction-types";

export async function updateTransaction(
  id: string,
  _prevState: CreateTransactionState,
  formData: FormData
): Promise<CreateTransactionState> {
  const typeValue = formData.get("type");
  let type: TransactionType;
  if (typeValue === "income" || typeValue === "expense") {
    type = typeValue;
  } else {
    return { status: "error", message: "種別を選択してください。" };
  }

  const dateValue = formData.get("date");
  if (typeof dateValue !== "string" || dateValue === "") {
    return { status: "error", message: "日付を入力してください。" };
  }

  const categoryValue = formData.get("category");
  const allowedCategories = getCategoriesFor(type);
  if (
    typeof categoryValue !== "string" ||
    !allowedCategories.includes(categoryValue)
  ) {
    return { status: "error", message: "カテゴリを選択してください。" };
  }

  const amountValue = formData.get("amount");
  const amount = typeof amountValue === "string" ? Number(amountValue) : NaN;
  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      status: "error",
      message: "金額は1円以上の整数で入力してください。",
    };
  }

  const memoValue = formData.get("memo");
  const memo =
    typeof memoValue === "string" && memoValue !== "" ? memoValue : null;

  const monthValue = formData.get("month");
  const returnMonth =
    typeof monthValue === "string" && monthValue !== "" ? monthValue : "";

  const genericErrorMessage =
    "保存に失敗しました。通信環境を確認してもう一度お試しください。";

  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase
      .from("transactions")
      .update({
        type,
        date: dateValue,
        category: categoryValue,
        amount,
        memo,
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      return { status: "error", message: genericErrorMessage };
    }
  } catch (error) {
    console.error(error);
    return { status: "error", message: genericErrorMessage };
  }

  revalidatePath("/transactions");
  revalidatePath("/calendar");
  redirect(returnMonth ? `/transactions?month=${returnMonth}` : "/transactions");
}
