# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクトについて

スマホで管理できる家計簿アプリ。プロジェクトの雛形（骨組み）のみ作成済みで、DB接続や画面の中身はこれから実装する。

## 技術スタック

- Next.js 16 (App Router) ※当初の想定は14だったが、`create-next-app@latest`実行時点の最新版がインストールされている
- React 19 + TypeScript ※当初の想定は18
- Tailwind CSS v4
- DB: Supabase（クラウド保存。環境変数の雛形のみ用意済み、接続コードやテーブルは未実装）
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

開発が進んだら、以下を追記してください。

- テストの実行コマンド（単体テストの個別実行方法を含む）
- 全体のアーキテクチャ（複数ファイルにまたがる設計上の要点）
