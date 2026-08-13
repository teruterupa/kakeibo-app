# 自動取込通知＋カテゴリ選択機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メール自動取込で取引が登録された際にスマートフォンへWebプッシュ通知を送り、通知から取引専用のカテゴリ選択画面を開いて1タップでカテゴリ（食費・日用品など）を設定できるようにする。

**Architecture:** メール自動取込API（`app/api/email-import/route.ts`）が取引を「未分類」で登録した直後に、`web-push`ライブラリでSupabaseに保存済みの購読情報（`push_subscriptions`）全件へ通知を送る。通知はカスタムService Worker（`worker/index.js`、next-pwaの`customWorkerDir`規約により自動的に生成物へ組み込まれる）が受信・表示し、タップ時に取引専用のカテゴリ選択ページ（`/transactions/[id]/categorize`）を開く。通知を見逃した場合の保険として、取引一覧ページに未分類件数バナーと一覧ページを追加する。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / Supabase / next-pwa / web-push（新規導入）

## Global Constraints

- 自動テストは追加しない。既存2つの設計書（`docs/superpowers/specs/2026-08-11-card-email-auto-import-design.md`）と同じ方針で、`npm run lint`・`npm run build`と手動確認で検証する。
- `npm run dev` / `npm run build`は`--webpack`フラグ必須（next-pwaとTurbopackは非互換。`package.json`のスクリプトは変更しない）。
- Server Actionのファイルはファイル冒頭に`"use server"`を書く（インライン`"use server"`は使わない。`CLAUDE.md`の注意点）。
- 新規UIは既存ページ（`app/transactions/page.tsx`、`app/transactions/[id]/edit/`）のTailwindクラスの使い方（黒/グレー基調、`rounded`・`px-4 py-2`程度のシンプルなボタン）に合わせる。
- RLS（Row Level Security）は認証未導入のため全許可とする（既存2テーブルと同じ方針。新規テーブルにも同じポリシーを適用する）。
- Supabaseクライアントは既存の`createServerSupabaseClient()`（`lib/supabase/server.ts`）を再利用する。新規クライアントは作らない。

---

### Task 1: カテゴリ定義に「未分類」を追加する

**Files:**
- Modify: `lib/categories.ts`

**Interfaces:**
- Produces: `UNCATEGORIZED_CATEGORY: string`定数、`getCategorizableCategoriesFor(type: TransactionType): readonly string[]`関数（後続タスクのカテゴリ選択画面で使用）

- [ ] **Step 1: `lib/categories.ts`を以下の内容に書き換える**

```typescript
export type TransactionType = "income" | "expense";

export const CREDIT_CARD_CATEGORY = "クレジットカード";
export const UNCATEGORIZED_CATEGORY = "未分類";

export const EXPENSE_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "娯楽",
  "光熱費",
  "住居",
  CREDIT_CARD_CATEGORY,
  "その他",
  UNCATEGORIZED_CATEGORY,
] as const;

export const INCOME_CATEGORIES = [
  "給与",
  "副業",
  "その他",
  UNCATEGORIZED_CATEGORY,
] as const;

export function getCategoriesFor(type: TransactionType): readonly string[] {
  return type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

export function getCategorizableCategoriesFor(
  type: TransactionType
): readonly string[] {
  return getCategoriesFor(type).filter(
    (category) => category !== UNCATEGORIZED_CATEGORY
  );
}
```

- [ ] **Step 2: 既存の編集フォームが壊れていないことを確認する**

`app/transactions/[id]/edit/edit-transaction-form.tsx`は`getCategoriesFor`をそのまま使っているため、カテゴリの選択肢に「未分類」が増えるだけで動作は変わらない。コードの変更は不要。

- [ ] **Step 3: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功（`--webpack`フラグ付きなので`npm run build`をそのまま実行すればよい）

- [ ] **Step 4: コミット**

```bash
git add lib/categories.ts
git commit -m "feat: カテゴリに「未分類」を追加する"
```

---

### Task 2: Supabaseスキーマと環境変数のひな形を追加する

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `.env.example`

**Interfaces:**
- Produces: `push_subscriptions`テーブル（列: `id uuid`, `endpoint text unique`, `p256dh text`, `auth text`, `created_at timestamptz`）。後続タスクの購読保存API・通知送信ユーティリティが利用する。

- [ ] **Step 1: `supabase/schema.sql`の末尾に以下を追記する**

```sql

-- ============================================================
-- 以下は、自動取込通知＋カテゴリ選択機能の追加にともなう変更。
-- 新規セットアップ・既存デプロイのどちらでも、このブロックを
-- SQL Editorに貼り付けて実行すればよい（べき等）。
-- ============================================================
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "Allow all access (no auth yet)" on push_subscriptions;
create policy "Allow all access (no auth yet)"
  on push_subscriptions
  for all
  using (true)
  with check (true);
```

- [ ] **Step 2: `.env.example`の末尾に以下を追記する**

```
# Webプッシュ通知（自動取込の通知配信）用のVAPID鍵
# 実装時に `npx web-push generate-vapid-keys` で生成する
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

- [ ] **Step 3: SQLの構文を目視確認する**

このタスクはSupabase側の実行を伴わない（実際の実行はユーザーが初回セットアップ手順で行う）。追記したSQLが既存ブロックと同じスタイル（`create table if not exists` + `drop policy if exists` + `create policy`）になっていることを確認する。

- [ ] **Step 4: コミット**

```bash
git add supabase/schema.sql .env.example
git commit -m "feat: push_subscriptionsテーブルとVAPID用環境変数のひな形を追加する"
```

---

### Task 3: web-pushライブラリと通知送信ユーティリティを実装する

**Files:**
- Modify: `package.json`
- Create: `lib/push/vapid.ts`
- Create: `lib/push/send-push-notification.ts`

**Interfaces:**
- Consumes: `push_subscriptions`テーブル（Task 2で追加）
- Produces: `sendPushNotificationToAllSubscriptions(supabase: SupabaseClient, payload: PushPayload): Promise<void>`関数と`PushPayload`型（`{ title: string; body: string; url: string }`）。Task 7（メール自動取込との統合）が使用する。

- [ ] **Step 1: web-pushと型定義をインストールする**

Run: `npm install web-push`
Run: `npm install --save-dev @types/web-push`

- [ ] **Step 2: `lib/push/vapid.ts`を新規作成する**

```typescript
import webpush from "web-push";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

export function getWebPush(): typeof webpush {
  webpush.setVapidDetails(
    getEnv("VAPID_SUBJECT"),
    getEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    getEnv("VAPID_PRIVATE_KEY")
  );
  return webpush;
}
```

- [ ] **Step 3: `lib/push/send-push-notification.ts`を新規作成する**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWebPush } from "./vapid";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getStatusCode(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return undefined;
}

export async function sendPushNotificationToAllSubscriptions(
  supabase: SupabaseClient,
  payload: PushPayload
): Promise<void> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("通知の宛先取得に失敗しました:", error);
    return;
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return;
  }

  const webpush = getWebPush();
  const serializedPayload = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          serializedPayload
        );
      } catch (sendError) {
        const statusCode = getStatusCode(sendError);
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
        } else {
          console.error("プッシュ通知の送信に失敗しました:", sendError);
        }
      }
    })
  );
}
```

- [ ] **Step 4: VAPID鍵を生成する**

Run: `npx web-push generate-vapid-keys`

出力される`Public Key`と`Private Key`を控えておく。この時点では`.env.local`は各自の環境で未作成の場合があるため、Task 11（最終手動確認）で実際に設定して動作確認する。

- [ ] **Step 5: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功（VAPID環境変数は関数呼び出し時にしか参照されないため、未設定でもビルド自体は通る）

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json lib/push/vapid.ts lib/push/send-push-notification.ts
git commit -m "feat: web-pushによるプッシュ通知送信ユーティリティを追加する"
```

---

### Task 4: 通知の購読情報を保存するAPIを実装する

**Files:**
- Create: `app/api/push-subscribe/route.ts`

**Interfaces:**
- Consumes: `push_subscriptions`テーブル（Task 2）
- Produces: `POST /api/push-subscribe`（リクエストボディ: `{ endpoint: string; keys: { p256dh: string; auth: string } }`、成功時は`{ status: "ok" }`をHTTP 200で返す）。Task 5（購読ボタン）が呼び出す。

- [ ] **Step 1: `app/api/push-subscribe/route.ts`を新規作成する**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function isValidSubscriptionPayload(
  value: unknown
): value is SubscriptionPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.endpoint !== "string" || v.endpoint === "") {
    return false;
  }
  if (typeof v.keys !== "object" || v.keys === null) {
    return false;
  }
  const keys = v.keys as Record<string, unknown>;
  return typeof keys.p256dh === "string" && typeof keys.auth === "string";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  if (!isValidSubscriptionPayload(body)) {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("通知の購読情報の保存に失敗しました:", error);
    return NextResponse.json({ error: "保存に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 2: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 3: 手動でAPIの入力チェックを確認する（開発サーバー使用）**

Run: `npm run dev`（別ターミナルで起動したままにする）

不正なボディでのリクエストが400になることを確認する：

Run: `curl -X POST http://localhost:3000/api/push-subscribe -H "Content-Type: application/json" -d "{}"`
Expected: HTTPステータス400、`{"error":"不正なリクエストです。"}`

正常なボディでのリクエストを試す（Supabaseの環境変数が`.env.local`に設定済みで、Task 2のSQLを実行済みの場合のみ成功する。未設定の場合は500が返るが、それはこの時点では想定内なので次のステップに進んでよい）：

Run: `curl -X POST http://localhost:3000/api/push-subscribe -H "Content-Type: application/json" -d "{\"endpoint\":\"https://example.com/test\",\"keys\":{\"p256dh\":\"dummy\",\"auth\":\"dummy\"}}"`
Expected: `.env.local`とSupabaseのテーブルが揃っていればHTTP 200 `{"status":"ok"}`。揃っていなければ500でも構わない（Task 11でまとめて実機確認する）

開発サーバーを停止する。

- [ ] **Step 4: コミット**

```bash
git add app/api/push-subscribe/route.ts
git commit -m "feat: 通知の購読情報を保存するAPIを追加する"
```

---

### Task 5: 通知を有効にするボタンを実装する

**Files:**
- Create: `app/transactions/push-subscribe-button.tsx`

**Interfaces:**
- Consumes: `POST /api/push-subscribe`（Task 4）、環境変数`NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Produces: `PushSubscribeButton`（Client Component、props無し）。Task 10（取引一覧ページへの統合）が使用する。

- [ ] **Step 1: `app/transactions/push-subscribe-button.tsx`を新規作成する**

```typescript
"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type SubscribeStatus =
  | "checking"
  | "unsupported"
  | "subscribed"
  | "unsubscribed"
  | "subscribing"
  | "error";

export function PushSubscribeButton() {
  const [status, setStatus] = useState<SubscribeStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkSubscription() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setStatus(existing ? "subscribed" : "unsubscribed");
    }

    checkSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubscribe() {
    setStatus("subscribing");

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEYが設定されていません。");
      setStatus("error");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("unsubscribed");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const response = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error("購読情報の保存に失敗しました。");
      }

      setStatus("subscribed");
    } catch (subscribeError) {
      console.error("通知の購読に失敗しました:", subscribeError);
      setStatus("error");
    }
  }

  if (status === "unsupported" || status === "checking") {
    return null;
  }

  if (status === "subscribed") {
    return <p className="text-sm text-gray-500">通知は有効です</p>;
  }

  return (
    <button
      type="button"
      onClick={handleSubscribe}
      disabled={status === "subscribing"}
      className="rounded bg-gray-200 px-3 py-1 text-sm text-black disabled:opacity-50"
    >
      {status === "subscribing"
        ? "設定中..."
        : status === "error"
          ? "通知の設定に失敗しました。もう一度タップ"
          : "通知を有効にする"}
    </button>
  );
}
```

- [ ] **Step 2: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功

このタスク単体ではまだどのページからも読み込まれないため（Task 10で組み込む）、ブラウザでの動作確認は行わない。

- [ ] **Step 3: コミット**

```bash
git add app/transactions/push-subscribe-button.tsx
git commit -m "feat: 通知を有効にするボタンを追加する"
```

---

### Task 6: カスタムService Workerでプッシュ通知の受信とタップ時の画面遷移を実装する

**Files:**
- Create: `worker/index.js`
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: Task 3で送信される`PushPayload`（`{ title, body, url }`のJSON文字列）
- Produces: ビルド時にnext-pwaが自動検出し、生成されるService Worker（`public/sw.js`）に組み込む。next.config.tsの変更は不要（next-pwaの`customWorkerDir`のデフォルト値が`"worker"`のため）。

- [ ] **Step 1: `worker/index.js`を新規作成する**

```javascript
self.addEventListener("push", (event) => {
  let payload = { title: "家計簿", body: "", url: "/transactions" };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/transactions";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
```

- [ ] **Step 2: `.gitignore`のnext-pwa関連の除外設定に、カスタムService Workerのビルド成果物を追加する**

`.gitignore`の以下の箇所：

```
# next-pwa (自動生成されるService Worker関連ファイル)
/public/sw.js
/public/workbox-*.js
/public/fallback-*.js
```

を、次のように変更する：

```
# next-pwa (自動生成されるService Worker関連ファイル)
/public/sw.js
/public/workbox-*.js
/public/fallback-*.js
/public/worker-*.js
```

- [ ] **Step 3: `eslint.config.mjs`の`globalIgnores`に、同じビルド成果物を追加する**

`eslint.config.mjs`の以下の箇所：

```javascript
    // next-pwaが本番ビルド時に自動生成するService Worker関連ファイル。
    // .gitignoreで既に除外対象になっているものと合わせる。
    "public/sw.js",
    "public/workbox-*.js",
  ]),
```

を、次のように変更する：

```javascript
    // next-pwaが本番ビルド時に自動生成するService Worker関連ファイル。
    // .gitignoreで既に除外対象になっているものと合わせる。
    "public/sw.js",
    "public/workbox-*.js",
    "public/worker-*.js",
  ]),
```

- [ ] **Step 4: `eslint.config.mjs`に、`worker/index.js`用のグローバル変数設定を追加する**

Service Worker用の`self`はブラウザのグローバルとは別のスコープのため、ESLintの`no-undef`対策として明示的に許可する。`eslintConfig`配列（`defineConfig([...])`の中身）に以下のオブジェクトを追加する：

```javascript
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // カスタムService Worker。ブラウザではなくService Worker専用のグローバルスコープで動く。
    files: ["worker/**/*.js"],
    languageOptions: {
      globals: {
        self: "readonly",
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ...
  ]),
]);
```

（`globalIgnores([...])`の中身はStep 3の変更をそのまま残す）

- [ ] **Step 5: `tsconfig.json`の`include`に`worker/**/*.js`を追加する**

`tsconfig.json`の以下の箇所：

```json
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
```

を、次のように変更する：

```json
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts",
    "worker/**/*.js"
  ],
```

- [ ] **Step 6: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし（`worker/index.js`が`no-undef`等で引っかからないこと）

Run: `npm run build`
Expected: ビルド成功。ビルドログに`> [PWA] Custom worker found: .../worker/index.js`という行が出力されることを確認する（next-pwaがカスタムワーカーを検出した証拠）

Run: `ls public/worker-*.js`（PowerShellの場合は`Get-ChildItem public/worker-*.js`）
Expected: ビルド後に`public/worker-<ハッシュ>.js`が生成されていること

- [ ] **Step 7: コミット**

```bash
git add worker/index.js .gitignore eslint.config.mjs tsconfig.json
git commit -m "feat: プッシュ通知の受信とタップ時の画面遷移を行うカスタムService Workerを追加する"
```

---

### Task 7: メール自動取込のカテゴリ変更とプッシュ通知送信を統合する

**Files:**
- Modify: `lib/email-parsers/index.ts`
- Modify: `lib/email-import/run-email-import.ts`

**Interfaces:**
- Consumes: `UNCATEGORIZED_CATEGORY`（Task 1）、`sendPushNotificationToAllSubscriptions`・`PushPayload`（Task 3）
- Produces: 通知の`url`は`/transactions/{id}/categorize`形式（Task 9で実装するページと一致させる）

- [ ] **Step 1: `lib/email-parsers/index.ts`に送信元ごとの表示名を追加する**

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

export const SENDER_LABELS: Record<string, string> = {
  "smbc-debit@smbc-card.com": "三井住友カード",
  "mail@debit.bk.mufg.jp": "三菱UFJ-VISAデビット",
  "mail@qa.jcb.co.jp": "JCBカード",
  "info@mail.rakuten-card.co.jp": "楽天カード",
};
```

- [ ] **Step 2: `lib/email-import/run-email-import.ts`を以下の内容に書き換える**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_PARSERS, SENDER_LABELS } from "@/lib/email-parsers";
import type { CardEmail } from "@/lib/gmail-client";
import { UNCATEGORIZED_CATEGORY } from "@/lib/categories";
import { sendPushNotificationToAllSubscriptions } from "@/lib/push/send-push-notification";

export type EmailImportSummary = {
  emailsFound: number;
  transactionsInserted: number;
  transactionsSkipped: number;
};

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

      const { data: inserted, error } = await supabase
        .from("transactions")
        .insert({
          type: item.type,
          date: item.date,
          category: UNCATEGORIZED_CATEGORY,
          amount: item.amount,
          memo: item.merchant,
          source: "email",
          source_message_id: sourceMessageId,
        })
        .select("id")
        .single();

      if (error || !inserted) {
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

      const senderLabel = senderAddress ? SENDER_LABELS[senderAddress] : undefined;
      await sendPushNotificationToAllSubscriptions(supabase, {
        title: `${senderLabel ?? "カード利用"} ¥${item.amount.toLocaleString()}`,
        body: item.merchant,
        url: `/transactions/${inserted.id}/categorize`,
      });
    }
  }

  return summary;
}
```

- [ ] **Step 3: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし（`CREATE_CATEGORY_EXPENSE`等の未使用importが残っていないこと）

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 4: コミット**

```bash
git add lib/email-parsers/index.ts lib/email-import/run-email-import.ts
git commit -m "feat: 自動取込の初期カテゴリを「未分類」に変更し、登録時にプッシュ通知を送る"
```

---

### Task 8: 取引1件のカテゴリを更新するServer Actionを実装する

**Files:**
- Create: `app/actions/categorize-transaction.ts`

**Interfaces:**
- Consumes: `EXPENSE_CATEGORIES`・`INCOME_CATEGORIES`・`UNCATEGORIZED_CATEGORY`（Task 1）
- Produces: `categorizeTransaction(id: string, category: string): Promise<void>`（Server Action。成功時は`/transactions`へリダイレクトする）。Task 9が使用する。

- [ ] **Step 1: `app/actions/categorize-transaction.ts`を新規作成する**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  UNCATEGORIZED_CATEGORY,
} from "@/lib/categories";

const CATEGORIZABLE_CATEGORIES: string[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
].filter((category) => category !== UNCATEGORIZED_CATEGORY);

export async function categorizeTransaction(
  id: string,
  category: string
): Promise<void> {
  if (!CATEGORIZABLE_CATEGORIES.includes(category)) {
    throw new Error("不正なカテゴリです。");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category })
    .eq("id", id);

  if (error) {
    console.error("カテゴリの更新に失敗しました:", error);
    throw new Error("カテゴリの更新に失敗しました。");
  }

  revalidatePath("/transactions");
  revalidatePath("/calendar");
  redirect("/transactions");
}
```

- [ ] **Step 2: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 3: コミット**

```bash
git add app/actions/categorize-transaction.ts
git commit -m "feat: 取引1件のカテゴリだけを更新するServer Actionを追加する"
```

---

### Task 9: カテゴリ選択専用ページを実装する

**Files:**
- Create: `app/transactions/[id]/categorize/page.tsx`

**Interfaces:**
- Consumes: `getTransactionById`（`lib/transactions.ts`、既存）、`getCategorizableCategoriesFor`（Task 1）、`categorizeTransaction`（Task 8）
- Produces: `/transactions/[id]/categorize`ページ。Task 7の通知`url`とTask 10の未分類一覧ページのリンク先。

- [ ] **Step 1: `app/transactions/[id]/categorize/page.tsx`を新規作成する**

```typescript
import Link from "next/link";
import { getTransactionById, type Transaction } from "@/lib/transactions";
import { getCategorizableCategoriesFor } from "@/lib/categories";
import { categorizeTransaction } from "@/app/actions/categorize-transaction";

function BackLink() {
  return (
    <Link
      href="/transactions"
      className="text-center text-sm text-gray-500 underline"
    >
      あとで選ぶ（一覧に戻る）
    </Link>
  );
}

export default async function CategorizeTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let fetched: Transaction | null = null;
  let loadError: string | null = null;
  try {
    fetched = await getTransactionById(id);
  } catch {
    loadError =
      "取引の取得に失敗しました。通信環境を確認してもう一度お試しください。";
  }

  if (loadError) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <h1 className="text-xl font-bold">カテゴリを選択</h1>
        <p className="text-red-600">{loadError}</p>
        <BackLink />
      </main>
    );
  }

  if (!fetched) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <h1 className="text-xl font-bold">カテゴリを選択</h1>
        <p>取引が見つかりません。</p>
        <BackLink />
      </main>
    );
  }

  // constに入れ直すことで、以下のmapコールバック内でも
  // 「取引がnullでない」ことの型の絞り込みを保てるようにする。
  const transaction: Transaction = fetched;
  const categories = getCategorizableCategoriesFor(transaction.type);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">カテゴリを選択</h1>

      <p className="text-gray-600">
        {transaction.date}　¥{transaction.amount.toLocaleString()}
        {transaction.memo ? `　${transaction.memo}` : ""}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {categories.map((category) => (
          <form
            key={category}
            action={categorizeTransaction.bind(null, transaction.id, category)}
          >
            <button
              type="submit"
              className="w-full rounded bg-gray-200 px-4 py-6 text-lg text-black"
            >
              {category}
            </button>
          </form>
        ))}
      </div>

      <BackLink />
    </main>
  );
}
```

- [ ] **Step 2: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 3: 開発サーバーで表示を確認する**

Run: `npm run dev`

Supabaseに手入力フォーム（`/`）から支出取引を1件登録し、その取引IDを控える（`/transactions`の「編集」リンクのURL、または開発者ツールのネットワークタブから確認できる）。

ブラウザで`http://localhost:3000/transactions/<控えたID>/categorize`を開く。
Expected: 「食費」「日用品」などのボタンが2列で並び、いずれかをタップすると`/transactions`に戻り、該当取引のカテゴリが変わっていること

開発サーバーを停止する。

- [ ] **Step 4: コミット**

```bash
git add "app/transactions/[id]/categorize/page.tsx"
git commit -m "feat: 通知から開くカテゴリ選択専用ページを追加する"
```

---

### Task 10: 未分類バナー・一覧ページ・通知ボタンを取引一覧画面に統合する

**Files:**
- Modify: `lib/transactions.ts`
- Create: `app/transactions/uncategorized/page.tsx`
- Modify: `app/transactions/page.tsx`

**Interfaces:**
- Consumes: `UNCATEGORIZED_CATEGORY`（Task 1）、`PushSubscribeButton`（Task 5）、`/transactions/[id]/categorize`（Task 9）
- Produces: `getUncategorizedTransactionCount(): Promise<number>`、`getUncategorizedTransactions(): Promise<Transaction[]>`（`lib/transactions.ts`に追加）

- [ ] **Step 1: `lib/transactions.ts`の先頭のimportを変更する**

`lib/transactions.ts`の1〜2行目：

```typescript
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/lib/categories";
```

を、次のように変更する：

```typescript
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UNCATEGORIZED_CATEGORY, type TransactionType } from "@/lib/categories";
```

- [ ] **Step 2: `lib/transactions.ts`の末尾（`getTransactionById`関数の後）に以下を追加する**

```typescript

export async function getUncategorizedTransactionCount(): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("category", UNCATEGORIZED_CATEGORY);

  if (error) {
    throw new Error(`未分類件数の取得に失敗しました: ${error.message}`);
  }

  return count ?? 0;
}

export async function getUncategorizedTransactions(): Promise<Transaction[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, type, category, amount, memo")
    .eq("category", UNCATEGORIZED_CATEGORY)
    .order("date", { ascending: false });

  if (error) {
    throw new Error(`未分類取引の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []) as Transaction[];
}
```

- [ ] **Step 3: `app/transactions/uncategorized/page.tsx`を新規作成する**

```typescript
import Link from "next/link";
import { getUncategorizedTransactions, type Transaction } from "@/lib/transactions";

export default async function UncategorizedTransactionsPage() {
  let transactions: Transaction[] = [];
  let loadError: string | null = null;
  try {
    transactions = await getUncategorizedTransactions();
  } catch {
    loadError =
      "取引の取得に失敗しました。通信環境を確認してもう一度お試しください。";
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">未分類の取引</h1>

      {loadError && <p className="text-red-600">{loadError}</p>}

      {!loadError && transactions.length === 0 && (
        <p className="text-gray-500">未分類の取引はありません。</p>
      )}

      {!loadError && transactions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {transactions.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded border px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">
                  {t.date}
                  {t.memo ? `　${t.memo}` : ""}
                </span>
                <span
                  className={
                    t.type === "income" ? "text-blue-600" : "text-red-600"
                  }
                >
                  {t.type === "income" ? "+" : "-"}¥{t.amount.toLocaleString()}
                </span>
              </div>
              <Link
                href={`/transactions/${t.id}/categorize`}
                className="rounded bg-black px-3 py-1 text-sm text-white"
              >
                分類する
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/transactions"
        className="text-center text-sm text-gray-500 underline"
      >
        一覧に戻る
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: `app/transactions/page.tsx`にバナーと通知ボタンを追加する**

まず先頭のimport部分：

```typescript
import Link from "next/link";
import {
  currentMonthString,
  formatMonthLabel,
  getTransactionsForMonth,
  shiftMonth,
  summarizeTransactions,
  type Transaction,
} from "@/lib/transactions";
import { TransactionList } from "./transaction-list";
```

を、次のように変更する：

```typescript
import Link from "next/link";
import {
  currentMonthString,
  formatMonthLabel,
  getTransactionsForMonth,
  getUncategorizedTransactionCount,
  shiftMonth,
  summarizeTransactions,
  type Transaction,
} from "@/lib/transactions";
import { TransactionList } from "./transaction-list";
import { PushSubscribeButton } from "./push-subscribe-button";
```

次に、`transactions`の取得直後（`let loadError: string | null = null;`の`try`ブロックが終わったあと、`const summary = summarizeTransactions(transactions);`の前）に以下を追加する：

```typescript
  let uncategorizedCount = 0;
  try {
    uncategorizedCount = await getUncategorizedTransactionCount();
  } catch {
    uncategorizedCount = 0;
  }

```

最後に、月送りの見出し`<div className="flex items-center justify-between">...</div>`の直後（`{loadError ? (`の直前）に以下を追加する：

```typescript
      <div className="flex items-center justify-between gap-2">
        <PushSubscribeButton />
        {uncategorizedCount > 0 && (
          <Link
            href="/transactions/uncategorized"
            className="rounded bg-yellow-100 px-3 py-1 text-sm text-yellow-900"
          >
            未分類の取引が{uncategorizedCount}件あります →
          </Link>
        )}
      </div>

```

- [ ] **Step 5: lintとビルドを確認する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 6: 開発サーバーで表示を確認する**

Run: `npm run dev`

`http://localhost:3000/transactions`を開く。
Expected: 「通知を有効にする」ボタンが表示される（ローカルのhttpだとブラウザによってはService Workerが登録されない場合があるので、その場合は表示されなくてもこの時点ではよい）

Task 9で作成した未分類の取引が残っていれば、「未分類の取引が◯件あります」というバナーが表示され、タップすると`/transactions/uncategorized`に遷移し、一覧から「分類する」でカテゴリ選択ページに飛べることを確認する。

開発サーバーを停止する。

- [ ] **Step 7: コミット**

```bash
git add lib/transactions.ts "app/transactions/uncategorized/page.tsx" app/transactions/page.tsx
git commit -m "feat: 未分類バナー・一覧ページ・通知ボタンを取引一覧画面に統合する"
```

---

### Task 11: ドキュメント更新と最終手動確認

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: なし（ドキュメントのみ）

- [ ] **Step 1: `CLAUDE.md`の「カード利用通知メール自動取込セットアップ手順（初回のみ・ユーザー作業）」セクションの直後に、以下のセクションを追加する**

```markdown
## 自動取込通知＋カテゴリ選択機能セットアップ手順（初回のみ・ユーザー作業）

メール自動取込で取引が登録された際にスマートフォンへプッシュ通知を送り、通知から取引専用のカテゴリ選択画面（食費・日用品など）を開ける機能。詳細設計は`docs/superpowers/specs/2026-08-14-push-notification-categorize-design.md`を参照。

1. Supabaseの「SQL Editor」で、`supabase/schema.sql`の「自動取込通知＋カテゴリ選択機能の追加にともなう変更」ブロックを実行する（`push_subscriptions`テーブルが追加される）
2. VAPID鍵ペアを発行する（`npx web-push generate-vapid-keys`）
3. `.env.local`とVercelの環境変数に以下を設定する
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`（例: `mailto:kiai.yu.fire@gmail.com`）
4. アプリをこの状態でデプロイ（またはローカルで`npm run build && npm run start`）する。iOSのWebプッシュ通知は本番相当のビルド（Service Workerが有効な状態）でホーム画面に追加したPWAでのみ動作する
5. iPhoneのホーム画面に追加済みのアプリを開き、`/transactions`ページの「通知を有効にする」ボタンをタップし、通知許可ダイアログでOKを押す
6. カード利用通知メールが届くタイミング（またはGitHub Actionsの「Card Email Auto Import」ワークフローを手動実行）で、実際に通知が届き、タップするとカテゴリ選択画面が開くことを確認する
```

- [ ] **Step 2: `CLAUDE.md`の「開発が進んだら、以下を追記してください」の直前にある技術スタック節の記載を確認する**

現状の`CLAUDE.md`に「PWA: next-pwa」の説明があるが、Webプッシュ通知の追加について明示的な追記は不要（Step 1のセクションで十分カバーされている）。変更しない。

- [ ] **Step 3: 最終確認として、これまでのタスクで積み上げた変更全体に対して改めてlintとビルドを実行する**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功。ビルドログに`> [PWA] Custom worker found:`の行が出ること

- [ ] **Step 4: 手動確認チェックリスト（実機・本番相当環境が必要なため、デプロイ後にユーザー自身が確認する項目として明記する）**

以下は`docs/superpowers/specs/2026-08-14-push-notification-categorize-design.md`の「テスト方針」に定義済みの手動確認項目。コード上の実装はここまでで完了しているため、このステップでは実装済みであることの申し送りのみ行う（実機確認はユーザー作業）。

- 「通知を有効にする」ボタンをタップすると`push_subscriptions`に1行追加されること
- メール自動取込で取引が登録されると、実機（iPhone）に通知が届くこと
- 通知をタップすると、正しい取引のカテゴリ選択画面が開くこと
- カテゴリボタンをタップすると即座に反映され、取引一覧のカテゴリ別内訳が正しく更新されること
- 通知許可を取り消した状態で自動取込が走っても、取引登録自体はエラーにならず成功すること
- 未分類バナーが正しい件数を表示し、一覧ページから各取引のカテゴリ選択画面に遷移できること
- 三菱UFJの返金（収入扱い）のケースでも「未分類」で登録され、収入用のカテゴリが選べること

- [ ] **Step 5: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: 自動取込通知＋カテゴリ選択機能のセットアップ手順を追加する"
```
