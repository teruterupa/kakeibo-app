import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_PARSERS } from "@/lib/email-parsers";
import type { CardEmail } from "@/lib/gmail-client";
import { CREDIT_CARD_CATEGORY } from "@/lib/categories";

export type EmailImportSummary = {
  emailsFound: number;
  transactionsInserted: number;
  transactionsSkipped: number;
};

const CATEGORY_EXPENSE = CREDIT_CARD_CATEGORY;
const CATEGORY_INCOME = "その他";

export function extractSenderAddress(fromHeader: string): string | null {
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
      const sourceMessageId = `${email.id}-${index}`;

      // 取引を削除してもメールIDの重複防止レコードは消えないよう、
      // transactionsテーブルとは別のimported_email_idsで重複判定する。
      const { error: dedupeError } = await supabase
        .from("imported_email_ids")
        .insert({ message_id: sourceMessageId });

      if (dedupeError) {
        if (dedupeError.code !== "23505") {
          console.error("重複チェックの記録に失敗しました:", dedupeError);
        }
        summary.transactionsSkipped++;
        continue;
      }

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
        console.error("取引の自動登録に失敗しました:", error);
        // 取引の登録に失敗した場合は重複防止レコードも取り消し、次回のポーリングで再試行できるようにする
        await supabase
          .from("imported_email_ids")
          .delete()
          .eq("message_id", sourceMessageId);
        summary.transactionsSkipped++;
        continue;
      }

      summary.transactionsInserted++;
    }
  }

  return summary;
}
