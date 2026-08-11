# 現金以外の支払い自動記録（カード利用通知メール解析）設計書

## 目的

現金以外の支払い（クレジットカード・デビットカード）について、Gmailに届く利用通知メールを自動的に解析し、`transactions`テーブルに取引として自動登録できるようにする。手入力の手間を減らし、記録漏れを防ぐことが目的。

## 対象範囲

### 自動化する4社

以下4社の利用通知メールを解析対象とする。送信元アドレスで対象メールを識別する。

| 会社 | カード種別 | 送信元メールアドレス |
|---|---|---|
| 三井住友カード | Oliveフレキシブルペイ（デビットモード） | `smbc-debit@smbc-card.com` |
| 楽天カード | 楽天カード（Visa） | `info@mail.rakuten-card.co.jp` |
| JCBカード | 【OS】JCBカードW NL | `mail@qa.jcb.co.jp` |
| 三菱UFJ銀行 | 三菱UFJ-VISAデビット | `mail@debit.bk.mufg.jp` |

### 対象外（スコープ外）

- **PayPay**：メールでの利用通知が届かないため対象外。引き続き既存の手入力フォームで登録する。
- 上記4社以外のカード・決済サービス
- リアルタイム反映（後述のとおり最短でも15分単位の遅延がある）
- 店舗名からの詳細カテゴリ自動判定（すべて「クレジットカード」カテゴリに固定登録する）
- 返品・取消の追跡（三菱UFJのマイナス金額＝入金扱いという最低限の対応のみ行う）
- 認証（NextAuth.js導入）は本機能でも未対応のまま

## 全体アーキテクチャ

```
GitHub Actions（15分おきcron）
  → POST /api/email-import （秘密トークンで保護）
    → Gmail API で対象4社・直近2日以内のメールを検索
    → 送信元アドレスごとに専用パーサーで本文を解析
    → 解析成功分を重複チェックしてから Supabase の transactions に insert
```

### なぜこの構成か

- **デプロイ先（Vercel Hobby=無料プラン）の制約**：VercelのCron Jobs機能は無料プランだと実質1日1回しか実行されないため、15分おきの実行にはVercel外部のスケジューラが必要。GitHub Actionsは無料で使え、このリポジトリと同じ場所で完結するため採用した。
- **Gmail Pub/Sub（プッシュ通知）は不採用**：即時性は上がるが、Google Cloud PubSubの設定・Webhook検証など構築コストが大きい。15分おきのポーリングで要件を満たせるため見送った。
- **PayPayの通知自動取得（スマホ通知の検知）は不採用**：iPhoneでは他アプリの通知内容を読み取る公式な手段がなく実現不可能。Android＋Tasker等の組み合わせでも本アプリの範囲を超えるため対象外とした。
- **PayPayのログイン情報を使った自動スクレイピングは不採用**：利用規約違反のリスクとログイン情報の保管リスクが大きいため見送った。

## コンポーネント構成

### 新規ファイル

- `lib/email-parsers/smbc.ts`：三井住友カード（Oliveデビット）用パーサー
- `lib/email-parsers/mufg.ts`：三菱UFJ-VISAデビット用パーサー
- `lib/email-parsers/rakuten.ts`：楽天カード用パーサー
- `lib/email-parsers/jcb.ts`：JCBカード用パーサー
- `lib/email-parsers/types.ts`：パーサー共通の型定義（`ParsedCardTransaction`など）
- `lib/email-parsers/index.ts`：送信元メールアドレス→パーサー関数のレジストリ（`EMAIL_PARSERS: Record<string, EmailParser>`）
- `lib/gmail-client.ts`：Gmail APIのOAuth2クライアント初期化、メール検索、本文取得（text/plain優先、HTMLメールはタグ除去）のユーティリティ
- `app/api/email-import/route.ts`：本機能のエントリーポイント（Route Handler、POST）
- `.github/workflows/email-import.yml`：15分おきに`/api/email-import`を呼び出すGitHub Actionsワークフロー

### 既存ファイルの変更

- `supabase/schema.sql`：`transactions`テーブルに以下2カラムを追加する
  - `source text not null default 'manual'`（値は`'manual'`または`'email'`）
  - `source_message_id text unique`（メール由来の取引のみ設定。GmailのメッセージIDを保持し重複登録を防ぐ）
  - 対応方法は2段構え：(1) 冒頭の`create table if not exists`定義自体にこの2カラムを追加する（新規にこのアプリをセットアップする人はこれだけで済む）、(2) その下に`alter table transactions add column if not exists ...`を追記する（今回のように既にテーブルが存在する環境向け。ユーザーに手動実行してもらう）
- `lib/categories.ts`：`EXPENSE_CATEGORIES`に`"クレジットカード"`を追加
- `.env.example`：Gmail連携用の環境変数キーを追記（`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` / `EMAIL_IMPORT_SECRET`）

## パーサー共通インターフェース

```typescript
// lib/email-parsers/types.ts
export type ParsedCardTransaction = {
  date: string; // YYYY-MM-DD
  merchant: string;
  amount: number; // 正の整数（円）
  type: "income" | "expense";
};

export type EmailParser = (
  subject: string,
  bodyText: string,
  receivedAt: Date // メールのDateヘッダー（JST変換済み）
) => ParsedCardTransaction | null;
```

解析できない・想定外の形式だった場合は`null`を返す。呼び出し側はその場合そのメールをスキップする。

## 各社パーサーの解析ルール

### 三井住友カード（Oliveデビット）

本文中の以下の行をそれぞれ正規表現で抽出する。

```
◇利用日  ：2026/08/09 21:30:41
◇利用先　：iDデビット
◇利用金額：85円
```

- `date`：`◇利用日` 行の日付部分（時刻は切り捨て）を`YYYY-MM-DD`に変換
- `merchant`：`◇利用先` 行の値
- `amount`：`◇利用金額` 行の数値部分（`円`を除去）
- `type`：常に`"expense"`

### 三菱UFJ-VISAデビット

本文中の以下の行を抽出する。

```
ご利用金額（円）　  : 610
ご利用先　　　　　　: MCDONALDS MOBILE ORDER
```

- **日付フィールドが本文に存在しないため**、`receivedAt`（メール受信日時のJST日付部分）を`date`とする
- `merchant`：`ご利用先` 行の値
- `amount`の絶対値を使用。**符号がマイナスの場合は入金（返金等）を意味する**ため：
  - 金額が正：`type: "expense"`、`amount`はそのまま
  - 金額が負：`type: "income"`、`amount`は絶対値

### 楽天カード

HTML形式のメール。Gmail APIから取得したメッセージにtext/plainパートが存在する場合はそちらを優先して使う。存在しない場合はHTMLのタグを除去してから、以下のような表形式のテキストからご利用日・ご利用先・ご利用金額を抽出する。

```
ご利用日          ご利用先                    ご利用金額
2026/08/02        ガウディ茶屋町店            15,800円
```

- `date`：ご利用日列の値をそのまま`YYYY-MM-DD`として使う（すでにこの形式）
- `merchant`：ご利用先列の値
- `amount`：ご利用金額列の数値部分（`円`とカンマを除去）
- `type`：常に`"expense"`
- 1通のメールに複数明細行が含まれる場合は、各行をそれぞれ1件の取引として扱う

### JCBカード

本文中の以下の行を抽出する。

```
【ご利用日時(日本時間)】　2026/07/19 10:45
【ご利用金額】　580円
【ご利用先】　アツプルドツトコム
```

- `date`：`【ご利用日時(日本時間)】` 行の日付部分（時刻は切り捨て）
- `merchant`：`【ご利用先】` 行の値
- `amount`：`【ご利用金額】` 行の数値部分（`円`を除去）
- `type`：常に`"expense"`

## データフロー

1. GitHub Actionsが15分おきに`EMAIL_IMPORT_SECRET`をAuthorizationヘッダーに付けて`/api/email-import`にPOSTする
2. Route Handlerがシークレットを検証する。不一致なら401を返して終了
3. Gmail APIで、対象4社の送信元アドレス・直近2日以内（`newer_than:2d`）のメールを検索する
4. 検索結果の各メールについて、送信元アドレスからレジストリで対応パーサーを引く。見つからなければスキップ
5. パーサーで本文を解析する。`null`が返ればスキップ（ログに残すのみ）
6. 解析できた各明細について、GmailのメッセージID（複数明細を含むメールは`メッセージID + 明細の連番`）を`source_message_id`として、既存レコードの有無を確認してからinsertする。既に存在すればスキップ
7. 登録時のカテゴリは`type: "expense"`なら`"クレジットカード"`固定、`type: "income"`（三菱UFJの返金ケース）なら`"その他"`固定。`memo`には`merchant`（店舗名）を設定し、`source: "email"`を設定する
8. 処理件数（検索件数・登録件数・スキップ件数）をJSONレスポンスとして返す

## エラー処理

- シークレット不一致 → 401を返して終了（Gmail検索は行わない）
- Gmail API認証エラー（リフレッシュトークン失効等）→ 500エラーを返す。GitHub Actionsの実行ログでユーザーが気づける
- 個別メールの解析失敗（`null`が返る、または想定外の例外） → そのメールだけスキップしてログに残し、処理全体は継続する（他のメールの登録を止めない）
- 重複メール（同じ`source_message_id`）→ insertせずスキップ。エラー扱いにはしない
- 誤って登録された取引 → 既存の編集・削除機能（`/transactions/[id]/edit`、削除ボタン）でそのまま修正・削除できる。本機能側での取り消し機能は作らない

## テスト方針

- 既存機能と同様、自動テストは追加せず手動確認を中心とする
- 各パーサー関数は入出力が明確な純粋関数のため、実装時に本設計書に記載した実際のメール本文サンプルを使って動作確認する
- リリース前にGitHub Actionsのワークフローを手動実行（`workflow_dispatch`）し、実際のGmailアカウントに対して1回通しで動作することを確認する
- 実装完了後、`npm run lint`と`npm run build`が通ることを確認する
- 手動確認項目：
  - 4社それぞれのメールから正しく取引が登録されること
  - 三菱UFJの日付フィールド欠落時、メール受信日時が使われること
  - 三菱UFJのマイナス金額が入金として登録されること
  - 同じメールを2回処理させても重複登録されないこと（`source_message_id`のunique制約）
  - シークレットが不正なリクエストは401で拒否されること
  - 解析できない形式のメールが来てもエラーで処理全体が止まらないこと

## 初回セットアップ手順（ユーザー作業）

1. Google Cloud ConsoleでOAuthクライアント（デスクトップアプリ種別）を作成し、Gmail API（読み取りスコープ`gmail.readonly`）を有効化する
2. OAuth同意画面でリフレッシュトークンを発行する（`kiai.yu.fire@gmail.com`で認可）
3. `.env.local`と、Vercelの環境変数に以下を設定する
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
   - `EMAIL_IMPORT_SECRET`（任意のランダム文字列。GitHub Actions側にも同じ値を設定）
4. GitHubリポジトリのSecretsに`EMAIL_IMPORT_SECRET`と、呼び出し先URL（Vercelの本番URL）を設定する
5. Supabaseの SQL Editor で、`supabase/schema.sql`に追記したALTER文を実行する
