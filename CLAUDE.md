# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクトについて

スマホで管理できる家計簿アプリ。収支登録フォーム機能を実装済み（`transactions`テーブルへの保存が可能）。

## 技術スタック

- Next.js 16 (App Router) ※当初の想定は14だったが、`create-next-app@latest`実行時点の最新版がインストールされている
- React 19 + TypeScript ※当初の想定は18
- Tailwind CSS v4
- DB: Supabase（クラウド保存。接続コード・テーブル定義・収支登録フォームを実装済み）
- PWA: next-pwa（`next.config.ts`で有効化。開発中は無効、本番ビルド時のみ有効）
- 認証: 未導入（後日NextAuth.js導入予定）
- カード利用通知メール自動取込: Gmail API（`googleapis`）+ GitHub Actions（15分おきcron）。詳細は`docs/superpowers/specs/2026-08-11-card-email-auto-import-design.md`参照

## コマンド

- `npm run dev` — 開発サーバー起動（webpackモード）
- `npm run build` — 本番ビルド（webpackモード）
- `npm run start` — ビルド後のアプリ起動
- `npm run lint` — ESLint実行

## 重要な注意点

- **next-pwaはTurbopackと非互換**。Next.js 16はデフォルトでTurbopackを使うため、`package.json`の`dev`/`build`スクリプトには明示的に`--webpack`を付けている。このフラグを外すとPWA設定（webpackプラグイン）が効かなくなる。
- Supabase接続用の環境変数は`.env.example`にキーのみ定義済み（値は未設定）。実際に使う際は`.env.local`を作成し、Supabaseプロジェクトの値を設定する。
- PWAアイコン（`public/icons/`）は単色のプレースホルダー。本番前に実際のロゴへ差し替えが必要。
- **`"use server"`を付けたファイルはasync関数以外をexportできない**。Client Component（`"use client"`のファイル）から直接importされるServer Actionsのファイルでは、関数内インラインの`"use server"`は使えない（`app/actions/create-transaction.ts`は必ずファイル先頭に`"use server"`を書く方式にすること）。型や定数など、async関数以外でClient Componentと共有したいものは、`lib/create-transaction-types.ts`のように別ファイルに分離し、`"use server"`ファイルからはre-exportしないこと。
- **`/api/push-subscribe`のSSRF対策**: `endpoint`が既知のWebプッシュサービス（`fcm.googleapis.com`・`updates.push.services.mozilla.com`・`web.push.apple.com`）のいずれかのhttps URLであることを検証している。将来他のブラウザ／プラットフォームに対応する際は、`app/api/push-subscribe/route.ts`の許可リストを見直すこと。

## Supabaseセットアップ手順（初回のみ・ユーザー作業）

1. https://supabase.com でアカウント作成し、新規プロジェクトを作成する
2. Supabaseダッシュボードの「SQL Editor」を開き、`supabase/schema.sql`の内容を貼り付けて実行する（`transactions`テーブルが作成される）
3. 「Project Settings」→「API」から、Project URLとanon public keyをコピーする
4. プロジェクトルートに`.env.local`ファイルを作成し（`.env.example`をコピーして作成）、以下を設定する

   ```
   NEXT_PUBLIC_SUPABASE_URL=（コピーしたProject URL）
   NEXT_PUBLIC_SUPABASE_ANON_KEY=（コピーしたanon public key）
   ```

`.env.local`はGit管理対象外（`.gitignore`の`.env*`ルールで除外済み）。

- RLS（Row Level Security）は現在、認証が無いため全許可にしている（`supabase/schema.sql`参照）。認証（NextAuth.js）を導入する際は、必ずこのRLSポリシーを見直すこと。

## カード利用通知メール自動取込セットアップ手順（初回のみ・ユーザー作業）

現金以外の支払い（三井住友カード・楽天カード・JCBカード・三菱UFJ-VISAデビット）の利用通知メールを自動解析し、`transactions`テーブルに自動登録する機能。詳細設計は`docs/superpowers/specs/2026-08-11-card-email-auto-import-design.md`を参照。

1. Supabaseの「SQL Editor」で、`supabase/schema.sql`の「カード利用通知メール自動取込機能の追加にともなう変更」ブロック（既存デプロイ向けの追記部分）をまとめて実行する（`imported_email_ids`テーブルと、`transactions`テーブルへの`source`・`source_message_id`カラムが追加される）
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

## 全体のアーキテクチャ

収支登録は「フォーム（app/page.tsx, Client Component） → Server Action（app/actions/create-transaction.ts） → Supabase（transactionsテーブル）」という3層構成。フォームの型・状態管理はlib/create-transaction-types.tsとlib/categories.tsに切り出している。

開発が進んだら、以下を追記してください。

- テストの実行コマンド（単体テストの個別実行方法を含む）
