# 自動取込通知＋カテゴリ選択機能 設計書

## 目的

カード利用通知メールの自動取込（`docs/superpowers/specs/2026-08-11-card-email-auto-import-design.md`で実装済み）で取引が登録された際に、スマートフォンへプッシュ通知を送る。通知をタップすると、その取引専用のカテゴリ選択画面が開き、1タップで「食費」「日用品」などのカテゴリを設定できるようにする。これにより、自動登録された取引が「クレジットカード」カテゴリに固定されたまま埋もれてしまう問題を解消する。

## 対象範囲

### やること

- メール自動取込で登録される取引の初期カテゴリを「未分類」に変更する（`source: 'manual'`の手入力取引は対象外、従来通り）
- 取引登録直後に、登録した本人のスマートフォンへWebプッシュ通知を送る
- 通知をタップすると、その取引のカテゴリ選択専用ページが開く
- 通知を見逃した場合の保険として、取引一覧ページに「未分類の取引」件数バナーと一覧ページを用意する

### やらないこと（スコープ外）

- 店舗名からのカテゴリ自動判定（引き続き手動選択とする）
- 通知の既読管理・プッシュ通知の再送機能
- 複数ユーザー・複数世帯への配信区別（本アプリは認証未導入のため、登録済みの通知宛先全件に一律送信する）
- 通知のアクションボタン（iOSのWebプッシュはアクションボタンに対応していないため、タップで画面を開く方式のみとする）

## 全体アーキテクチャ

```
メール自動取込（GitHub Actions 15分おきcron） → POST /api/email-import
  → Gmail解析・重複チェック（既存機能）
  → transactionsにinsert（category: "未分類" で登録、既存の "クレジットカード" 固定から変更）
  → 登録した取引ごとに、push_subscriptionsに保存された宛先全件へWebプッシュ通知を送信
      → 送信失敗（宛先が無効）の場合はそのpush_subscriptions行を削除
      → 送信自体に失敗しても取引登録の成否には影響させない

スマートフォン側
  → 通知をタップ
  → Service Worker（notificationclickイベント）がアプリを開く/フォーカスし、
    該当取引の /transactions/[id]/categorize を開く
  → カテゴリボタンをタップ → その場でtransactionsのcategoryを更新 → 取引一覧へ戻る
```

### なぜこの構成か

- **Webプッシュ（VAPID）を採用**：LINE Notifyはサービス終了済み、メール通知は即時性・体験の面で「通知をタップしてカテゴリを選ぶ」という要件に合わない。すでにこのPWAはiPhoneのホーム画面に追加（インストール）済みのため、iOS 16.4以降で標準サポートされているWebプッシュ通知がそのまま利用できる。第三者サービスを使わず追加コストもかからない。
- **通知はタップで画面を開く方式のみ**：iOSのSafari／PWAのWebプッシュ通知は、通知内に複数のボタンを表示する「アクション」機能に対応していない。そのため通知本体はタップ操作のみとし、カテゴリ選択はアプリ内の専用画面で行う。
- **専用のカテゴリ選択画面を新設**：既存の編集画面（プルダウン＋保存ボタン）は流用できるが、通知から開いてすぐ選べる体験としては手数が多い。カテゴリ名の大きなボタンを並べ、1タップで確定する専用画面を別途用意する。
- **未分類バナーを保険として用意**：Webプッシュは通知許可が取り消された場合やスマートフォン側の一時的な不調で届かないことがある。取引一覧ページに未分類件数を表示し、通知を見逃してもそこから気づいて分類できるようにする。

## コンポーネント構成

### 新規ファイル

- `lib/push/vapid.ts`：VAPID鍵（Webプッシュを送るための鍵ペア）を環境変数から読み込み、`web-push`ライブラリを初期化するユーティリティ
- `lib/push/send-push-notification.ts`：`push_subscriptions`の全件を取得し、各宛先へ通知を送信する関数。送信失敗（宛先が無効／削除済み）を検知して該当行を自動削除する
- `app/api/push-subscribe/route.ts`：ブラウザから送られてきた通知の宛先情報（購読情報）を`push_subscriptions`にupsert（保存・更新）するAPI
- `components/push-subscribe-button.tsx`：「通知を有効にする」ボタン（Client Component）。タップで通知許可を求め、購読情報を`/api/push-subscribe`へ送信する。すでに購読済みなら「通知は有効です」と表示する
- `worker/index.js`：カスタムService Worker。プッシュ通知の受信（`push`イベント）と、通知タップ時の画面遷移（`notificationclick`イベント）を追加する
- `app/actions/categorize-transaction.ts`：`"use server"`ファイル。指定した取引1件のカテゴリだけを更新するServer Action
- `app/transactions/[id]/categorize/page.tsx`：通知から開く、カテゴリ選択専用ページ。取引の種別（支出/収入）に応じたカテゴリのボタンを並べる
- `app/transactions/uncategorized/page.tsx`：未分類の取引一覧ページ（通知を見逃した場合の保険用）

### 既存ファイルの変更

- `supabase/schema.sql`：`push_subscriptions`テーブルを新規追加する
  ```sql
  create table if not exists push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    created_at timestamptz not null default now()
  );

  alter table push_subscriptions enable row level security;

  create policy "allow all push_subscriptions" on push_subscriptions
    for all using (true) with check (true);
  ```
  （RLSは認証未導入のため全許可。既存2テーブルと同様、NextAuth.js導入時に見直す）
- `lib/categories.ts`：`UNCATEGORIZED_CATEGORY = "未分類"`を追加し、`EXPENSE_CATEGORIES`・`INCOME_CATEGORIES`の末尾に含める（既存取引の表示・手動での再選択に対応するため）
- `lib/email-import/run-email-import.ts`：登録時のカテゴリを、`type: "expense"`なら固定だった`"クレジットカード"`から`UNCATEGORIZED_CATEGORY`に、`type: "income"`（三菱UFJの返金ケース）なら固定だった`"その他"`から`UNCATEGORIZED_CATEGORY`に変更する。insert成功後、insertされた各取引について`sendPushNotificationToAllSubscriptions`を呼び出す
- `app/transactions/page.tsx`：ヘッダー付近に`PushSubscribeButton`を配置。未分類件数が1件以上あれば「未分類の取引が◯件あります」バナーを表示し、`/transactions/uncategorized`へリンクする
- `lib/transactions.ts`：未分類件数を取得する`getUncategorizedTransactionCount()`と、未分類取引一覧を取得する関数を追加
- `next.config.ts`：next-pwaの設定に`swSrc: "worker/index.js"`を追加し、自動生成のService Workerからカスタムファイルを使う方式（InjectManifestモード）に変更する
- `package.json`：`web-push`（プッシュ送信用）と`workbox-precaching`（カスタムService Worker内でのプリキャッシュ用）を依存関係に追加する
- `.env.example`：`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`を追記する

## 通知ペイロード

```typescript
type PushPayload = {
  title: string; // 例: "楽天カード ¥1,580"
  body: string;  // 例: "ガウディ千代町店"
  url: string;   // 例: "/transactions/3f9e.../categorize"
};
```

## データフロー

1. `runEmailImport`が取引をinsertする際、カテゴリを`UNCATEGORIZED_CATEGORY`（"未分類"）で登録する
2. insertが成功した取引ごとに、`title`にカード会社名と金額、`body`に店舗名、`url`にその取引の`/transactions/[id]/categorize`を設定してプッシュ通知を送信する
3. `push_subscriptions`の全件へ順に送信する。個々の送信が失敗（HTTPステータス404/410＝宛先が無効）した場合はその行を削除する。それ以外のエラーはログに残すのみで処理を継続する
4. スマートフォン側のService Workerが`push`イベントを受信し、通知を表示する
5. ユーザーが通知をタップすると、`notificationclick`イベントでアプリのウィンドウを開き（すでに開いていればフォーカスし）、`url`（カテゴリ選択ページ）へ遷移する
6. カテゴリ選択ページでボタンをタップすると、`categorizeTransaction(id, category)`が呼ばれ、`transactions.category`を更新して`/transactions`へリダイレクトする
7. 通知に気づかなかった場合は、`/transactions`ページのバナーから`/transactions/uncategorized`を経由して同じカテゴリ選択ページにアクセスできる

## 通知の購読（初回のみ・ユーザー操作）

`/transactions`ページの`PushSubscribeButton`をタップすると、ブラウザに通知許可を求めるダイアログが表示される。許可すると、`navigator.serviceWorker.ready`経由でプッシュ購読情報（endpoint・暗号化キー）を取得し、`/api/push-subscribe`へ送信して`push_subscriptions`に保存する。すでに購読済みの場合はボタンの表示を「通知は有効です」に変える。

## エラー処理

- プッシュ通知の送信に失敗しても、取引の登録自体は成功として扱う（通知はあくまで補助機能）
- 送信先が無効（404/410）と判定された購読情報は自動的に`push_subscriptions`から削除する（アプリをアンインストールした、通知を許可解除した等のケースに対応）
- `/api/push-subscribe`に不正な形式のリクエストが来た場合は400を返す
- `categorizeTransaction`で許可されていないカテゴリ文字列が渡された場合はエラーとし、更新しない（想定される選択肢以外の値が保存されるのを防ぐ）
- 通知をタップせずに`/transactions/uncategorized`経由で先にカテゴリを設定した後、同じ取引の通知を後からタップしても、単に同じ更新が再実行されるだけで害はない（特別なガードは設けない）

## テスト方針

- 既存機能と同様、自動テストは追加せず手動確認を中心とする
- `npm run lint`と`npm run build`が通ることを確認する
- 手動確認項目：
  - 「通知を有効にする」ボタンをタップすると`push_subscriptions`に1行追加されること
  - メール自動取込で取引が登録されると、実機（iPhone）に通知が届くこと
  - 通知をタップすると、正しい取引のカテゴリ選択画面が開くこと
  - カテゴリボタンをタップすると即座に反映され、取引一覧のカテゴリ別内訳が正しく更新されること
  - 通知許可を取り消した状態で自動取込が走っても、取引登録自体はエラーにならず成功すること（無効な購読情報が自動で削除されること）
  - 未分類バナーが正しい件数を表示し、一覧ページから各取引のカテゴリ選択画面に遷移できること
  - 三菱UFJの返金（収入扱い）のケースでも「未分類」で登録され、収入用のカテゴリ（給与／副業／その他）が選べること

## 初回セットアップ手順（ユーザー作業・追加分）

既存のカード利用通知メール自動取込のセットアップ（`CLAUDE.md`参照）に加えて、以下を行う。

1. VAPID鍵ペアを発行する（実装時に生成し、値を提示する）
2. `.env.local`とVercelの環境変数に以下を設定する
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`（`mailto:kiai.yu.fire@gmail.com`）
3. Supabaseの「SQL Editor」で、`supabase/schema.sql`に追記した`push_subscriptions`テーブル作成のSQLを実行する
4. アプリの`/transactions`ページで「通知を有効にする」ボタンをタップし、iPhoneの通知許可ダイアログでOKを押す
