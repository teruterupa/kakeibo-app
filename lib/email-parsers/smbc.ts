import type { EmailParser } from "./types";

function toDateOnly(dateTimeStr: string): string {
  // "2026/08/09 21:30:41" → "2026-08-09"
  const datePart = dateTimeStr.trim().split(/\s+/)[0];
  return datePart.replace(/\//g, "-");
}

export const parseSmbcEmail: EmailParser = (_subject, bodyText) => {
  const dateMatch = bodyText.match(
    /◇利用日\s*[：:]\s*(\d{4}\/\d{2}\/\d{2}[^\n]*)/
  );
  const merchantMatch = bodyText.match(/◇利用先\s*[：:]\s*([^\n]+)/);
  const amountMatch = bodyText.match(/◇利用金額\s*[：:]\s*([\d,]+)\s*円/);

  if (!dateMatch || !merchantMatch || !amountMatch) {
    return [];
  }

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  const merchant = merchantMatch[1].trim();

  if (!Number.isFinite(amount) || amount <= 0 || merchant === "") {
    return [];
  }

  return [
    {
      date: toDateOnly(dateMatch[1]),
      merchant,
      amount,
      type: "expense",
    },
  ];
};
