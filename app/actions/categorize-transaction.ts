"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  UNCATEGORIZED_CATEGORY,
} from "@/lib/categories";

const CATEGORIZABLE_CATEGORIES: string[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
].filter((category) => category !== UNCATEGORIZED_CATEGORY);

export async function categorizeTransaction(
  id: string,
  category: string
): Promise<void> {
  if (!CATEGORIZABLE_CATEGORIES.includes(category)) {
    throw new Error("不正なカテゴリです。");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category })
    .eq("id", id);

  if (error) {
    console.error("カテゴリの更新に失敗しました:", error);
    throw new Error("カテゴリの更新に失敗しました。");
  }

  revalidatePath("/transactions");
  revalidatePath("/calendar");
  redirect("/transactions");
}
