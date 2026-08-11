import type { EmailParser } from "./types";

export const parseRakutenEmail: EmailParser = (_subject, bodyText) => {
  const pattern = /(\d{4})\/(\d{2})\/(\d{2})\s+([^\d\n]+?)\s+([\d,]+)\s*円/g;
  const results = [];

  for (const match of bodyText.matchAll(pattern)) {
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
