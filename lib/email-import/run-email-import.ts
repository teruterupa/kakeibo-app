import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_PARSERS } from "@/lib/email-parsers";
import type { CardEmail } from "@/lib/gmail-client";

export type EmailImportSummary = {
  emailsFound: number;
  transactionsInserted: number;
  transactionsSkipped: number;
};

const CATEGORY_EXPENSE = "クレジットカード";
const CATEGORY_INCOME = "その他";

export function extractSenderAddress(fromHeader: string): string | null {
  // "楽天カード株式会社 <info@mail.rakuten-card.co.jp>" のような形式にも対応する
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) {
    return match[1].trim().toLowerCase();
  }
  const trimmed = fromHeader.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

export async function runEmailImport(
  emails: CardEmail[],
  supabase: SupabaseClient
): Promise<EmailImportSummary> {
  const summary: EmailImportSummary = {
    emailsFound: emails.length,
    transactionsInserted: 0,
    transactionsSkipped: 0,
  };

  for (const email of emails) {
    const senderAddress = extractSenderAddress(email.from);
    const parser = senderAddress ? EMAIL_PARSERS[senderAddress] : undefined;

    if (!parser) {
      continue;
    }

    const parsedItems = parser(email.subject, email.bodyText, email.receivedAt);

    if (parsedItems.length === 0) {
      console.warn(
        `メール本文の解析に失敗したためスキップしました: id=${email.id}, from=${senderAddress}`
      );
      continue;
    }

    for (const [index, item] of parsedItems.entries()) {
      const sourceMessageId =
        parsedItems.length > 1 ? `${email.id}-${index}` : email.id;

      const { error } = await supabase.from("transactions").insert({
        type: item.type,
        date: item.date,
        category: item.type === "expense" ? CATEGORY_EXPENSE : CATEGORY_INCOME,
        amount: item.amount,
        memo: item.merchant,
        source: "email",
        source_message_id: sourceMessageId,
      });

      if (error) {
        if (error.code !== "23505") {
          console.error("取引の自動登録に失敗しました:", error);
        }
        summary.transactionsSkipped++;
        continue;
      }

      summary.transactionsInserted++;
    }
  }

  return summary;
}
