# カード利用通知メール自動解析 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gmailに届く4社（三井住友カード・楽天カード・JCBカード・三菱UFJ-VISAデビット）の利用通知メールを自動解析し、`transactions`テーブルに取引として自動登録できるようにする。

**Architecture:** GitHub Actions（15分おきcron）→ Next.jsのAPI Route Handler（`/api/email-import`、秘密トークンで保護）→ Gmail APIで対象4社・直近2日以内のメールを検索 → 送信元ごとの専用パーサーで本文を解析 → `source_message_id`のunique制約で重複を防ぎながらSupabaseの`transactions`にinsertする。

**Tech Stack:** Next.js 16 (App Router / Route Handler), TypeScript, googleapis（Gmail API SDK）, Supabase (`@supabase/supabase-js`), GitHub Actions

## Global Constraints

- 対象送信元アドレスは以下4つ（設計書より）：
  - 三井住友カード（Oliveデビット）: `smbc-debit@smbc-card.com`
  - 楽天カード: `info@mail.rakuten-card.co.jp`
  - JCBカード: `mail@qa.jcb.co.jp`
  - 三菱UFJ-VISAデビット: `mail@debit.bk.mufg.jp`
- パーサー共通インターフェース: `(subject: string, bodyText: string, receivedAt: Date) => ParsedCardTransaction[]`（空配列＝解析不可としてスキップ）
- 自動登録時のカテゴリは固定：支出は`"クレジットカード"`、収入（三菱UFJのマイナス金額＝返金ケースのみ）は`"その他"`
- `transactions`テーブルに`source text not null default 'manual'`（`'manual'`または`'email'`）と`source_message_id text unique`を追加する
- デプロイ先はVercel Hobby（無料）プランのため、Vercel純正Cronではなく無料のGitHub Actions（`*/15 * * * *`）でポーリングする
- PayPayは対象外（引き続き手動入力）。本計画のタスクにPayPay対応は含まれない
- このプロジェクトは自動テストフレームワークを導入しておらず、既存のすべての機能が手動確認のみで運用されている（`docs/superpowers/specs/2026-08-10-transaction-list-and-summary-design.md`等を参照）。本計画もこの慣習に従い、自動テストコードは追加しない。各タスクでは一時的な確認スクリプト（`npx tsx`で実行し、確認後に削除する）による手動確認を行う
- 各タスクの完了時に`npm run lint`を実行し、エラーがないことを確認する

---

### Task 1: DBスキーマとカテゴリ定義の更新

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `lib/categories.ts`

**Interfaces:**
- Produces: `transactions`テーブルに`source`（text, not null, default `'manual'`, check `in ('manual', 'email')`）と`source_message_id`（text, unique, nullable）カラムが存在する。`EXPENSE_CATEGORIES`配列に`"クレジットカード"`が含まれる。後続タスクはこれらのカラム名・カテゴリ名をそのまま使う。

- [ ] **Step 1: `supabase/schema.sql`を更新する**

現在の内容全体を以下に置き換える。

```sql
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  amount integer not null check (amount > 0),
  memo text,
  source text not null default 'manual' check (source in ('manual', 'email')),
  source_message_id text unique,
  created_at timestamptz not null default now()
);

alter table transactions enable row level security;

-- 認証未導入のため、今は全アクセスを許可する。
-- NextAuth.js導入時にこのポリシーを見直すこと。
create policy "Allow all access (no auth yet)"
  on transactions
  for all
  using (true)
  with check (true);

-- 以下は、カード利用通知メール自動取込機能の追加にともなうカラム追加。
-- 新規セットアップでは上のcreate table定義に含まれているため実質的に何もしない。
-- 既にテーブルが存在する環境（今回のような既存デプロイへの機能追加）向けの追記。
alter table transactions add column if not exists source text not null default 'manual' check (source in ('manual', 'email'));
alter table transactions add column if not exists source_message_id text unique;
```

- [ ] **Step 2: `lib/categories.ts`の`EXPENSE_CATEGORIES`に「クレジットカード」を追加する**

現在:
```typescript
export const EXPENSE_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "娯楽",
  "光熱費",
  "住居",
  "その他",
] as const;
```

変更後:
```typescript
export const EXPENSE_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "娯楽",
  "光熱費",
  "住居",
  "クレジットカード",
  "その他",
] as const;
```

- [ ] **Step 3: lintを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add supabase/schema.sql lib/categories.ts
git commit -m "feat: カード利用通知メール自動取込用にDBスキーマとカテゴリを拡張"
```

**Note for implementer:** このタスクではSupabase側への実際のSQL実行は行わない（ユーザーが後日SQL Editorで手動実行する運用のため）。ファイルの変更のみでよい。

---

### Task 2: パーサー共通型・正規表現ベース3パーサー（三井住友・三菱UFJ・JCB）

**Files:**
- Create: `lib/email-parsers/types.ts`
- Create: `lib/email-parsers/jst-date.ts`
- Create: `lib/email-parsers/smbc.ts`
- Create: `lib/email-parsers/mufg.ts`
- Create: `lib/email-parsers/jcb.ts`

**Interfaces:**
- Consumes: なし（このタスクが最初のパーサー実装）
- Produces:
  - `ParsedCardTransaction`型（`{ date: string; merchant: string; amount: number; type: "income" | "expense" }`）
  - `EmailParser`型（`(subject: string, bodyText: string, receivedAt: Date) => ParsedCardTransaction[]`）
  - `toJstDateString(date: Date): string`関数（`lib/email-parsers/jst-date.ts`からexport。UTC基準のDateをJSTの`YYYY-MM-DD`文字列に変換する。サーバーのタイムゾーン設定に依存しない実装にすること）
  - `parseSmbcEmail: EmailParser`（`lib/email-parsers/smbc.ts`からexport）
  - `parseMufgEmail: EmailParser`（`lib/email-parsers/mufg.ts`からexport）
  - `parseJcbEmail: EmailParser`（`lib/email-parsers/jcb.ts`からexport）
  - 後続タスク（Task 3のレジストリ、Task 5のオーケストレーション処理）はこれらの型・関数名をそのまま使う

- [ ] **Step 1: `lib/email-parsers/types.ts`を作成する**

```typescript
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
```

- [ ] **Step 2: `lib/email-parsers/jst-date.ts`を作成する**

サーバーは実行環境のタイムゾーンに依存せず、UTCのタイムスタンプに9時間を加算してJSTの日付部分だけを取り出す実装にする（`.getFullYear()`等をサーバーのローカルタイムゾーンでそのまま使うと、Vercelのサーバー実行環境がUTCの場合に日本時間の早朝で日付がずれるバグになるため）。

```typescript
export function toJstDateString(date: Date): string {
  const jstMillis = date.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMillis);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 3: `lib/email-parsers/smbc.ts`を作成する**

三井住友カード（Oliveフレキシブルペイ・デビットモード）のメール本文例：

```
◇利用日  ：2026/08/09 21:30:41
◇利用先　：iDデビット
◇利用金額：85円
◇承認番号：361237
```

```typescript
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
```

- [ ] **Step 4: `lib/email-parsers/mufg.ts`を作成する**

三菱UFJ-VISAデビットのメール本文例（**利用日フィールドが本文に存在しない点に注意**。メール受信日時を代わりに使う）：

```
ご利用金額（円）　  : 610
ご利用先　　　　　　: MCDONALDS MOBILE ORDER
```

金額がマイナスの場合は入金（返金等）を意味するため、`type: "income"`、金額は絶対値にする。

```typescript
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
```

- [ ] **Step 5: `lib/email-parsers/jcb.ts`を作成する**

JCBカード（【OS】JCBカードW NL）のメール本文例：

```
【ご利用日時(日本時間)】　2026/07/19 10:45
【ご利用金額】　580円
【ご利用先】　アツプルドツトコム
```

```typescript
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
```

- [ ] **Step 6: 一時的な確認スクリプトで3パーサーの動作を確認する**

リポジトリ直下に`scratch-verify-parsers.ts`という名前で以下の内容を作成する（`@/`エイリアスは使わず相対importにする）。

```typescript
// scratch-verify-parsers.ts (一時ファイル。確認後に削除すること)
import { parseSmbcEmail } from "./lib/email-parsers/smbc";
import { parseMufgEmail } from "./lib/email-parsers/mufg";
import { parseJcbEmail } from "./lib/email-parsers/jcb";

const smbcBody = `
◇利用日  ：2026/08/09 21:30:41
◇利用先　：iDデビット
◇利用金額：85円
◇承認番号：361237
`;
console.log("SMBC:", parseSmbcEmail("", smbcBody, new Date()));

const mufgBody = `
ご利用金額（円）　  : 610
ご利用先　　　　　　: MCDONALDS MOBILE ORDER
`;
console.log("MUFG:", parseMufgEmail("", mufgBody, new Date("2026-07-20T10:00:00Z")));

const mufgRefundBody = `
ご利用金額（円）　  : -500
ご利用先　　　　　　: RETURN STORE
`;
console.log("MUFG(返金):", parseMufgEmail("", mufgRefundBody, new Date("2026-07-20T10:00:00Z")));

const jcbBody = `
【ご利用日時(日本時間)】　2026/07/19 10:45
【ご利用金額】　580円
【ご利用先】　アツプルドツトコム
`;
console.log("JCB:", parseJcbEmail("", jcbBody, new Date()));
```

Run: `npx tsx scratch-verify-parsers.ts`

Expected（それぞれ配列に1件ずつ入っていること）:
- SMBC: `[ { date: '2026-08-09', merchant: 'iDデビット', amount: 85, type: 'expense' } ]`
- MUFG: `[ { date: '2026-07-20', merchant: 'MCDONALDS MOBILE ORDER', amount: 610, type: 'expense' } ]`
- MUFG(返金): `[ { date: '2026-07-20', merchant: 'RETURN STORE', amount: 500, type: 'income' } ]`
- JCB: `[ { date: '2026-07-19', merchant: 'アツプルドツトコム', amount: 580, type: 'expense' } ]`

確認できたら`scratch-verify-parsers.ts`を削除する（コミットに含めない）。

- [ ] **Step 7: lintを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add lib/email-parsers/types.ts lib/email-parsers/jst-date.ts lib/email-parsers/smbc.ts lib/email-parsers/mufg.ts lib/email-parsers/jcb.ts
git commit -m "feat: 三井住友・三菱UFJ・JCBカードの利用通知メールパーサーを追加"
```

---

### Task 3: 楽天カードパーサー・パーサーレジストリ

**Files:**
- Create: `lib/email-parsers/rakuten.ts`
- Create: `lib/email-parsers/index.ts`

**Interfaces:**
- Consumes: `EmailParser`, `ParsedCardTransaction`型（Task 2の`lib/email-parsers/types.ts`）、`parseSmbcEmail` / `parseMufgEmail` / `parseJcbEmail`（Task 2）
- Produces:
  - `parseRakutenEmail: EmailParser`（`lib/email-parsers/rakuten.ts`からexport）
  - `EMAIL_PARSERS: Record<string, EmailParser>`（`lib/email-parsers/index.ts`からexport。キーは送信元メールアドレス小文字）。後続タスク（Task 5, 6）はこの`EMAIL_PARSERS`をそのまま使う

- [ ] **Step 1: `lib/email-parsers/rakuten.ts`を作成する**

楽天カードのメールはHTML形式（Task 4で本文取得時にtext/plain優先・HTMLはタグ除去して渡す設計のため、このパーサーは既にプレーンテキスト化された本文を受け取る前提）。本文には以下のような表形式のテキストが含まれる（1通に複数明細が入ることがある）。

```
ご利用日          ご利用先                    ご利用金額
2026/08/02        ガウディ茶屋町店            15,800円
```

```typescript
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
```

- [ ] **Step 2: `lib/email-parsers/index.ts`を作成する**

```typescript
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
```

- [ ] **Step 3: 一時的な確認スクリプトで楽天パーサーの動作を確認する**

```typescript
// scratch-verify-rakuten.ts (一時ファイル。確認後に削除すること)
import { parseRakutenEmail } from "./lib/email-parsers/rakuten";

const singleItemBody = `
ご利用日          ご利用先                    ご利用金額
2026/08/02        ガウディ茶屋町店            15,800円

合計   15,800円
`;
console.log("楽天(1件):", parseRakutenEmail("", singleItemBody, new Date()));

const multiItemBody = `
ご利用日          ご利用先                    ご利用金額
2026/08/02        ガウディ茶屋町店            15,800円
2026/08/03        セブンイレブン              580円

合計   16,380円
`;
console.log("楽天(複数件):", parseRakutenEmail("", multiItemBody, new Date()));

const noMatchBody = "利用明細はまだありません。";
console.log("楽天(該当なし):", parseRakutenEmail("", noMatchBody, new Date()));
```

Run: `npx tsx scratch-verify-rakuten.ts`

Expected:
- 楽天(1件): `[ { date: '2026-08-02', merchant: 'ガウディ茶屋町店', amount: 15800, type: 'expense' } ]`（「合計」行は日付を伴わないためマッチしないこと）
- 楽天(複数件): 2件の配列（2026-08-02分と2026-08-03分）
- 楽天(該当なし): `[]`

確認できたら`scratch-verify-rakuten.ts`を削除する（コミットに含めない）。

- [ ] **Step 4: lintを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add lib/email-parsers/rakuten.ts lib/email-parsers/index.ts
git commit -m "feat: 楽天カードパーサーとパーサーレジストリを追加"
```

---

### Task 4: Gmail APIクライアント

**Files:**
- Create: `lib/gmail-client.ts`
- Modify: `package.json`（`googleapis`を追加）
- Modify: `.env.example`

**Interfaces:**
- Consumes: なし
- Produces:
  - `createGmailClient(): gmail_v1.Gmail`（`lib/gmail-client.ts`からexport。`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN`環境変数を使う）
  - `CardEmail`型（`{ id: string; from: string; subject: string; bodyText: string; receivedAt: Date }`）
  - `searchCardEmails(gmail: gmail_v1.Gmail, senderAddresses: string[]): Promise<CardEmail[]>`
  - `extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string`（内部ロジックだが手動確認のためexportする）
  - 後続タスク（Task 5, 6）はこれらの関数・型をそのまま使う

- [ ] **Step 1: `googleapis`パッケージをインストールする**

Run: `npm install googleapis`
Expected: `package.json`の`dependencies`に`googleapis`が追加される

- [ ] **Step 2: `lib/gmail-client.ts`を作成する**

```typescript
import { google, type gmail_v1 } from "googleapis";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

export function createGmailClient(): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2(
    getEnv("GMAIL_CLIENT_ID"),
    getEnv("GMAIL_CLIENT_SECRET")
  );
  oauth2Client.setCredentials({
    refresh_token: getEnv("GMAIL_REFRESH_TOKEN"),
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export type CardEmail = {
  id: string;
  from: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
};

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|td)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function extractBodyText(
  payload: gmail_v1.Schema$MessagePart | undefined
): string {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    const plainPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plainPart?.body?.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      return stripHtml(decodeBase64Url(htmlPart.body.data));
    }

    for (const part of payload.parts) {
      const nested = extractBodyText(part);
      if (nested) {
        return nested;
      }
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  return "";
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const header = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

export async function searchCardEmails(
  gmail: gmail_v1.Gmail,
  senderAddresses: string[]
): Promise<CardEmail[]> {
  const fromQuery = senderAddresses.map((addr) => `from:${addr}`).join(" OR ");
  const query = `(${fromQuery}) newer_than:2d`;

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messages = listResponse.data.messages ?? [];
  const results: CardEmail[] = [];

  for (const message of messages) {
    if (!message.id) {
      continue;
    }

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    });

    const headers = detail.data.payload?.headers;
    const from = getHeader(headers, "From");
    const subject = getHeader(headers, "Subject");
    const bodyText = extractBodyText(detail.data.payload);
    const receivedAt = detail.data.internalDate
      ? new Date(Number(detail.data.internalDate))
      : new Date();

    results.push({ id: message.id, from, subject, bodyText, receivedAt });
  }

  return results;
}
```

- [ ] **Step 3: `.env.example`にGmail連携用の環境変数キーを追記する**

現在の内容の末尾に追記:

```
# Gmail連携（カード利用通知メールの自動取込）用の設定値
# Google Cloud ConsoleでOAuthクライアントを作成し、リフレッシュトークンを発行して設定する
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

- [ ] **Step 4: 一時的な確認スクリプトで`extractBodyText`の動作を確認する**

`searchCardEmails`は実際のGmail認証情報がないと動作確認できないため、このタスクでは純粋関数である`extractBodyText`のみ手動確認する。

```typescript
// scratch-verify-gmail-client.ts (一時ファイル。確認後に削除すること)
import { extractBodyText } from "./lib/gmail-client";

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64url");
}

// text/plainパートが直接ある場合
const plainOnly = extractBodyText({
  mimeType: "text/plain",
  body: { data: toBase64Url("プレーンテキスト本文") },
});
console.log("text/plain直接:", plainOnly);

// multipart/alternative（text/plainとtext/htmlの両方がある）場合はtext/plainを優先
const multipart = extractBodyText({
  mimeType: "multipart/alternative",
  parts: [
    { mimeType: "text/plain", body: { data: toBase64Url("プレーン優先本文") } },
    { mimeType: "text/html", body: { data: toBase64Url("<p>HTML本文</p>") } },
  ],
});
console.log("multipart(plain優先):", multipart);

// text/htmlしかない場合はタグを除去
const htmlOnly = extractBodyText({
  mimeType: "multipart/alternative",
  parts: [
    {
      mimeType: "text/html",
      body: { data: toBase64Url("<table><tr><td>2026/08/02</td><td>15,800円</td></tr></table>") },
    },
  ],
});
console.log("HTMLのみ(タグ除去):", htmlOnly);
```

Run: `npx tsx scratch-verify-gmail-client.ts`

Expected:
- `text/plain直接`: `プレーンテキスト本文`
- `multipart(plain優先)`: `プレーン優先本文`（HTMLパートは無視される）
- `HTMLのみ(タグ除去)`: タグが除去され`2026/08/02`と`15,800円`が含まれるテキストになる

確認できたら`scratch-verify-gmail-client.ts`を削除する（コミットに含めない）。

- [ ] **Step 5: lintを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add lib/gmail-client.ts package.json package-lock.json .env.example
git commit -m "feat: Gmail APIクライアントとメール本文抽出ロジックを追加"
```

---

### Task 5: 取込オーケストレーション処理

**Files:**
- Create: `lib/email-import/run-email-import.ts`

**Interfaces:**
- Consumes: `EMAIL_PARSERS`（Task 3の`lib/email-parsers/index.ts`）、`CardEmail`型（Task 4の`lib/gmail-client.ts`）
- Produces:
  - `EmailImportSummary`型（`{ emailsFound: number; transactionsInserted: number; transactionsSkipped: number }`）
  - `runEmailImport(emails: CardEmail[], supabase: SupabaseClient): Promise<EmailImportSummary>`
  - `extractSenderAddress(fromHeader: string): string | null`（内部ロジックだが手動確認のためexportする）
  - 後続タスク（Task 6のRoute Handler）はこの`runEmailImport`をそのまま使う

- [ ] **Step 1: `lib/email-import/run-email-import.ts`を作成する**

```typescript
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
```

- [ ] **Step 2: 一時的な確認スクリプトで動作を確認する**

```typescript
// scratch-verify-run-email-import.ts (一時ファイル。確認後に削除すること)
import { runEmailImport, extractSenderAddress } from "./lib/email-import/run-email-import";
import type { CardEmail } from "./lib/gmail-client";

console.log(
  "送信元抽出:",
  extractSenderAddress("楽天カード株式会社 <info@mail.rakuten-card.co.jp>")
);
console.log("送信元抽出(素のアドレス):", extractSenderAddress("smbc-debit@smbc-card.com"));

const insertedRecords: unknown[] = [];
let callCount = 0;

const fakeSupabase = {
  from: () => ({
    insert: async (record: Record<string, unknown>) => {
      callCount++;
      // 2回目の呼び出しは重複エラーをシミュレートする
      if (callCount === 2) {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      insertedRecords.push(record);
      return { error: null };
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const emails: CardEmail[] = [
  {
    id: "msg-1",
    from: "smbc-debit@smbc-card.com",
    subject: "ご利用のお知らせ",
    bodyText: "◇利用日  ：2026/08/09 21:30:41\n◇利用先　：iDデビット\n◇利用金額：85円\n",
    receivedAt: new Date(),
  },
  {
    id: "msg-2",
    from: "smbc-debit@smbc-card.com",
    subject: "ご利用のお知らせ（重複想定）",
    bodyText: "◇利用日  ：2026/08/10 10:00:00\n◇利用先　：テスト店舗\n◇利用金額：100円\n",
    receivedAt: new Date(),
  },
  {
    id: "msg-3",
    from: "unknown@example.com",
    subject: "対象外の送信元",
    bodyText: "何か関係ないメール",
    receivedAt: new Date(),
  },
];

runEmailImport(emails, fakeSupabase).then((summary) => {
  console.log("サマリ:", summary);
  console.log("insertされたレコード:", insertedRecords);
});
```

Run: `npx tsx scratch-verify-run-email-import.ts`

Expected:
- 送信元抽出: `info@mail.rakuten-card.co.jp`
- 送信元抽出(素のアドレス): `smbc-debit@smbc-card.com`
- サマリ: `{ emailsFound: 3, transactionsInserted: 1, transactionsSkipped: 1 }`（3通目は対象外送信元のためカウントに含まれない。1通目は登録成功、2通目は重複エラーでスキップ扱い）
- insertされたレコード: 1件のみ（`msg-1`由来。`category: "クレジットカード"`, `memo: "iDデビット"`, `source: "email"`, `source_message_id: "msg-1"`を含むこと）

確認できたら`scratch-verify-run-email-import.ts`を削除する（コミットに含めない）。

- [ ] **Step 3: lintを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add lib/email-import/run-email-import.ts
git commit -m "feat: メール取込のオーケストレーション処理を追加"
```

---

### Task 6: APIルートハンドラ

**Files:**
- Create: `app/api/email-import/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createGmailClient`, `searchCardEmails`（Task 4の`lib/gmail-client.ts`）、`createServerSupabaseClient`（既存の`lib/supabase/server.ts`）、`EMAIL_PARSERS`（Task 3）、`runEmailImport`（Task 5）
- Produces: `POST /api/email-import`エンドポイント。認証は`Authorization: Bearer <EMAIL_IMPORT_SECRET>`ヘッダー。成功時は`EmailImportSummary`をJSONで返す

- [ ] **Step 1: `app/api/email-import/route.ts`を作成する**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createGmailClient, searchCardEmails } from "@/lib/gmail-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EMAIL_PARSERS } from "@/lib/email-parsers";
import { runEmailImport } from "@/lib/email-import/run-email-import";

export async function POST(request: NextRequest) {
  const secret = process.env.EMAIL_IMPORT_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const gmail = createGmailClient();
    const senderAddresses = Object.keys(EMAIL_PARSERS);
    const emails = await searchCardEmails(gmail, senderAddresses);

    const supabase = createServerSupabaseClient();
    const summary = await runEmailImport(emails, supabase);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("メール自動取込に失敗しました:", error);
    return NextResponse.json(
      { error: "メール自動取込に失敗しました。" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: `.env.example`に`EMAIL_IMPORT_SECRET`を追記する**

Task 4で追記した内容の末尾にさらに追記:

```

# GitHub ActionsからAPIエンドポイントを呼び出す際の認証用シークレット（任意のランダム文字列）
EMAIL_IMPORT_SECRET=
```

- [ ] **Step 3: 開発サーバーで認証チェックの動作を確認する**

Run: `npm run dev`（別ターミナルで実行したままにする）

別ターミナルで以下を実行:

Run: `curl -i -X POST http://localhost:3000/api/email-import`
Expected: `HTTP/1.1 401` と `{"error":"Unauthorized"}`

Run: `curl -i -X POST http://localhost:3000/api/email-import -H "Authorization: Bearer wrong-secret"`
Expected: `HTTP/1.1 401` と `{"error":"Unauthorized"}`（`.env.local`に`EMAIL_IMPORT_SECRET`が未設定の場合も401になることを確認する。設定済みの場合は不一致でも401になることを確認する）

確認できたら`npm run dev`のサーバーを停止する。

**Note for implementer:** `GMAIL_CLIENT_ID`等が未設定の場合、正しいシークレットを渡しても500エラーになるのが正しい動作（Gmail認証情報がまだ発行されていないため）。実際にメールを取得できるところまでの確認は、ユーザーがGoogle Cloud ConsoleでOAuth認証情報を発行した後に行う（設計書の「初回セットアップ手順」を参照）。

- [ ] **Step 4: lintとビルドを実行する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルドが成功する

- [ ] **Step 5: コミット**

```bash
git add app/api/email-import/route.ts .env.example
git commit -m "feat: メール自動取込のAPIエンドポイントを追加"
```

---

### Task 7: GitHub Actionsワークフローとドキュメント更新

**Files:**
- Create: `.github/workflows/email-import.yml`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `POST /api/email-import`エンドポイント（Task 6）
- Produces: 15分おきに本番環境の`/api/email-import`を呼び出すGitHub Actionsワークフロー。ドキュメント更新のみで新規のコード上のインターフェースは生まれない

- [ ] **Step 1: `.github/workflows/email-import.yml`を作成する**

```yaml
name: Card Email Auto Import

on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch: {}

jobs:
  call-import-endpoint:
    runs-on: ubuntu-latest
    steps:
      - name: Call email import endpoint
        run: |
          curl --fail -X POST "${{ secrets.EMAIL_IMPORT_URL }}" \
            -H "Authorization: Bearer ${{ secrets.EMAIL_IMPORT_SECRET }}"
```

- [ ] **Step 2: `CLAUDE.md`の「技術スタック」セクションに1行追記する**

現在:
```markdown
- 認証: 未導入（後日NextAuth.js導入予定）
```

変更後:
```markdown
- 認証: 未導入（後日NextAuth.js導入予定）
- カード利用通知メール自動取込: Gmail API（`googleapis`）+ GitHub Actions（15分おきcron）。詳細は`docs/superpowers/specs/2026-08-11-card-email-auto-import-design.md`参照
```

- [ ] **Step 3: `CLAUDE.md`に新しいセクションを追記する**

「## Supabaseセットアップ手順（初回のみ・ユーザー作業）」セクションの直後に、以下のセクションを新規追加する。

```markdown
## カード利用通知メール自動取込セットアップ手順（初回のみ・ユーザー作業）

現金以外の支払い（三井住友カード・楽天カード・JCBカード・三菱UFJ-VISAデビット）の利用通知メールを自動解析し、`transactions`テーブルに自動登録する機能。詳細設計は`docs/superpowers/specs/2026-08-11-card-email-auto-import-design.md`を参照。

1. Supabaseの「SQL Editor」で、`supabase/schema.sql`に追記した`alter table transactions add column ...`の2文を実行する（`source`・`source_message_id`カラムが追加される）
2. Google Cloud ConsoleでOAuthクライアント（デスクトップアプリ種別）を作成し、Gmail API（`gmail.readonly`スコープ）を有効化する
3. OAuth同意画面を通じて、通知メールが届くGmailアカウント（`kiai.yu.fire@gmail.com`）でリフレッシュトークンを発行する
4. `.env.local`とVercelの環境変数に以下を設定する
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
   - `EMAIL_IMPORT_SECRET`（任意のランダム文字列）
5. GitHubリポジトリの Settings → Secrets and variables → Actions で、以下を設定する
   - `EMAIL_IMPORT_URL`（例: `https://kakeibo-app-navy-five.vercel.app/api/email-import`）
   - `EMAIL_IMPORT_SECRET`（Vercel側と同じ値）
6. GitHub Actionsの「Card Email Auto Import」ワークフローを手動実行（workflow_dispatch）し、正常にレスポンスが返ることを確認する

PayPayはメール通知が届かないため対象外。引き続き既存の手入力フォームで登録する。
```

- [ ] **Step 4: lintを実行する**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add .github/workflows/email-import.yml CLAUDE.md
git commit -m "feat: メール自動取込のGitHub Actionsワークフローとセットアップ手順を追加"
```

---

## 全タスク完了後の最終確認

- [ ] `npm run build` が通ることを最終確認する
- [ ] `docs/superpowers/specs/2026-08-11-card-email-auto-import-design.md`の「初回セットアップ手順」に沿って、ユーザー自身がGoogle Cloud Console・Vercel・GitHub Secretsの設定を行う（これはコードタスクではなくユーザー作業）
- [ ] セットアップ完了後、実際にカードを利用してメールが届くのを待つか、テスト用のメールを対象アドレスから送信し、15分以内（またはworkflow_dispatchでの手動実行）に`transactions`へ自動登録されることを確認する
