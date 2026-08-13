import type { EmailParser } from "./types";
import { parseSmbcEmail } from "./smbc";
import { parseMufgEmail } from "./mufg";
import { parseJcbEmail } from "./jcb";
import { parseRakutenEmail } from "./rakuten";

export const EMAIL_PARSERS: Record<string, EmailParser> = {
  "smbc-debit@smbc-card.com": parseSmbcEmail,
  "mail@debit.bk.mufg.jp": parseMufgEmail,
  "mail@qa.jcb.co.jp": parseJcbEmail,
  "info@mail.rakuten-card.co.jp": parseRakutenEmail,
};

export const SENDER_LABELS: Record<string, string> = {
  "smbc-debit@smbc-card.com": "三井住友カード",
  "mail@debit.bk.mufg.jp": "三菱UFJ-VISAデビット",
  "mail@qa.jcb.co.jp": "JCBカード",
  "info@mail.rakuten-card.co.jp": "楽天カード",
};
