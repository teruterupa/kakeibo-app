import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // git worktree（実装作業用の隔離ワークスペース）配下も除外する。
    // 除外しないと、各worktree内の.next/dev以下のビルド生成物（node_modules由来の
    // ベンダーコードを含む）までリポジトリルートからのlintで読み込まれ、
    // メモリ不足でクラッシュする。
    ".worktrees/**",
    // next-pwaが本番ビルド時に自動生成するService Worker関連ファイル。
    // .gitignoreで既に除外対象になっているものと合わせる。
    "public/sw.js",
    "public/workbox-*.js",
    "public/worker-*.js",
  ]),
]);

export default eslintConfig;
