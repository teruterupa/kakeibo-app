import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/lib/categories";

export type Transaction = {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  memo: string | null;
};

export type MonthlySummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ローカル時刻基準（UTC基準の.toISOString()は日本時間の早朝に日付がずれるため使わない）
export function currentMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const d = new Date(year, monthNum - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return `${year}年${monthNum}月`;
}

function getMonthRange(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split("-").map(Number);
  const start = `${year}-${pad(monthNum)}-01`;
  const endDate = new Date(year, monthNum, 1);
  const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-01`;
  return { start, end };
}

export function summarizeTransactions(
  transactions: Transaction[]
): MonthlySummary {
  const summary: MonthlySummary = {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    incomeByCategory: {},
    expenseByCategory: {},
  };

  for (const t of transactions) {
    if (t.type === "income") {
      summary.totalIncome += t.amount;
      summary.incomeByCategory[t.category] =
        (summary.incomeByCategory[t.category] ?? 0) + t.amount;
    } else {
      summary.totalExpense += t.amount;
      summary.expenseByCategory[t.category] =
        (summary.expenseByCategory[t.category] ?? 0) + t.amount;
    }
  }

  summary.balance = summary.totalIncome - summary.totalExpense;
  return summary;
}

export async function getTransactionsForMonth(
  month: string
): Promise<Transaction[]> {
  const { start, end } = getMonthRange(month);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, type, category, amount, memo")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false });

  if (error) {
    throw new Error(`取引の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []) as Transaction[];
}

export async function getTransactionById(
  id: string
): Promise<Transaction | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, type, category, amount, memo")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`取引の取得に失敗しました: ${error.message}`);
  }

  return data as Transaction | null;
}
