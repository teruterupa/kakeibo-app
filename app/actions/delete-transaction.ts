"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function deleteTransaction(
  id: string
): Promise<{ status: "success" | "error"; message: string }> {
  const genericErrorMessage =
    "削除に失敗しました。通信環境を確認してもう一度お試しください。";

  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase
      .from("transactions")
      .delete()
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
  return { status: "success", message: "削除しました。" };
}
