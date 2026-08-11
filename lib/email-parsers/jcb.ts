import type { EmailParser } from "./types";

function toDateOnly(dateTimeStr: string): string {
  const datePart = dateTimeStr.trim().split(/\s+/)[0];
  return datePart.replace(/\//g, "-");
}

export const parseJcbEmail: EmailParser = (_subject, bodyText) => {
  const dateMatch = bodyText.match(
    /【ご利用日時\(日本時間\)】\s*(\d{4}\/\d{2}\/\d{2}[^\n]*)/
  );
  const amountMatch = bodyText.match(/【ご利用金額】\s*([\d,]+)\s*円/);
  const merchantMatch = bodyText.match(/【ご利用先】\s*([^\n]+)/);

  if (!dateMatch || !amountMatch || !merchantMatch) {
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
