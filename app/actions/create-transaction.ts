"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCategoriesFor, type TransactionType } from "@/lib/categories";

export type CreateTransactionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialCreateTransactionState: CreateTransactionState = {
  status: "idle",
  message: "",
};

export async function createTransaction(
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

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("transactions").insert({
    type,
    date: dateValue,
    category: categoryValue,
    amount,
    memo,
  });

  if (error) {
    return { status: "error", message: `保存に失敗しました: ${error.message}` };
  }

  return { status: "success", message: "登録しました。" };
}
