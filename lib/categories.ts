export type TransactionType = "income" | "expense";

export const CREDIT_CARD_CATEGORY = "クレジットカード";
export const UNCATEGORIZED_CATEGORY = "未分類";

export const EXPENSE_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "娯楽",
  "光熱費",
  "住居",
  CREDIT_CARD_CATEGORY,
  "その他",
  UNCATEGORIZED_CATEGORY,
] as const;

export const INCOME_CATEGORIES = [
  "給与",
  "副業",
  "その他",
  UNCATEGORIZED_CATEGORY,
] as const;

export function getCategoriesFor(type: TransactionType): readonly string[] {
  return type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

export function getCategorizableCategoriesFor(
  type: TransactionType
): readonly string[] {
  return getCategoriesFor(type).filter(
    (category) => category !== UNCATEGORIZED_CATEGORY
  );
}
