import type { EmailParser } from "./types";
import { toJstDateString } from "./jst-date";

export const parseMufgEmail: EmailParser = (
  _subject,
  bodyText,
  receivedAt
) => {
  const amountMatch = bodyText.match(
    /ご利用金額（円）\s*[：:]\s*(-?[\d,]+)/
  );
  const merchantMatch = bodyText.match(/ご利用先\s*[：:]\s*([^\n]+)/);

  if (!amountMatch || !merchantMatch) {
    return [];
  }

  const rawAmount = Number(amountMatch[1].replace(/,/g, ""));
  const merchant = merchantMatch[1].trim();

  if (!Number.isFinite(rawAmount) || rawAmount === 0 || merchant === "") {
    return [];
  }

  return [
    {
      date: toJstDateString(receivedAt),
      merchant,
      amount: Math.abs(rawAmount),
      type: rawAmount < 0 ? "income" : "expense",
    },
  ];
};
