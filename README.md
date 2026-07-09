# 合格プランナー(juken-planner)

受験合格から逆算して学習スケジュールを自動生成する Web アプリ。

本命の試験日と教材(総量・1単位あたりの時間)を登録すると、残り期間を
**基礎固め → 発展 → 直前対策** の3フェーズに分割し、曜日ごとの学習可能時間に
応じて日次タスクを自動で割り振ります。遅れが出てもワンクリックで残り期間に
再配分(リスケジュール)できます。

## 主な機能

- **逆算プラン自動生成**: 試験日・教材・学習可能時間から日次タスクを自動配分
- **年間フェーズ表示**: 基礎固め/発展/直前対策のタイムラインを可視化
- **進捗トラッキング**: 今日のタスクをチェックして消化。遅れは自動リスケ
- **カレンダー**: 月間カレンダーにタスク量・模試/出願/試験日・フェーズ帯を表示
- **学習記録・統計**: タスク完了で学習時間を自動記録。日別・科目別グラフ、教材別進捗

## セットアップ

### 1. Supabase プロジェクトの作成

1. [Supabase](https://supabase.com/dashboard) で新規プロジェクトを作成
2. SQL Editor で `supabase/migrations/0001_init.sql` の内容を実行
3. Authentication → Providers で Email を有効化
   (確認メールを省略する場合は「Confirm email」をオフ)

### 2. 環境変数

```bash
cp .env.example .env.local
```

`.env.local` に Project Settings → API の URL / anon キーを設定します。

### 3. 起動

```bash
nvm use          # Node v24
npm install
npm run dev      # http://localhost:3000
```

## 技術スタック

- Next.js 16(App Router / TypeScript / Turbopack)
- Tailwind CSS v4 + shadcn/ui
- Supabase(Auth / Postgres / RLS)

## 開発コマンド

```bash
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
npm run lint    # ESLint
```
