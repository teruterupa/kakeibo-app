export type ParsedCardTransaction = {
  date: string; // YYYY-MM-DD
  merchant: string;
  amount: number; // 正の整数（円）
  type: "income" | "expense";
};

export type EmailParser = (
  subject: string,
  bodyText: string,
  receivedAt: Date
) => ParsedCardTransaction[];
