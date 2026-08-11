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
