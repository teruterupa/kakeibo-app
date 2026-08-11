import type { EmailParser } from "./types";

export const parseRakutenEmail: EmailParser = (_subject, bodyText) => {
  const normalized = bodyText
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  const pattern =
    /■利用日:\s*(\d{4})\/(\d{2})\/(\d{2})\n■利用先:\s*(.+?)\n■利用者:[^\n]*\n■支払方法:[^\n]*\n■利用金額:\s*([\d,]+)\s*円/g;
  const results = [];

  for (const match of normalized.matchAll(pattern)) {
    const [, year, month, day, merchantRaw, amountRaw] = match;
    const amount = Number(amountRaw.replace(/,/g, ""));
    const merchant = merchantRaw.trim();

    if (!Number.isFinite(amount) || amount <= 0 || merchant === "") {
      continue;
    }

    results.push({
      date: `${year}-${month}-${day}`,
      merchant,
      amount,
      type: "expense" as const,
    });
  }

  return results;
};
