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

## 全体のアーキテクチャ

収支登録は「フォーム（app/page.tsx, Client Component） → Server Action（app/actions/create-transaction.ts） → Supabase（transactionsテーブル）」という3層構成。フォームの型・状態管理はlib/create-transaction-types.tsとlib/categories.tsに切り出している。

開発が進んだら、以下を追記してください。

- テストの実行コマンド（単体テストの個別実行方法を含む）
