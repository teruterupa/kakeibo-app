export type TransactionType = "income" | "expense";

export const CREDIT_CARD_CATEGORY = "クレジットカード";

export const EXPENSE_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "娯楽",
  "光熱費",
  "住居",
  CREDIT_CARD_CATEGORY,
  "その他",
] as const;

export const INCOME_CATEGORIES = ["給与", "副業", "その他"] as const;

export function getCategoriesFor(type: TransactionType): readonly string[] {
  return type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}
