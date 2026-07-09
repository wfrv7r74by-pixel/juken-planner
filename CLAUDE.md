@AGENTS.md

# juken-planner — 受験合格 逆算スケジュール計画アプリ

本命試験日から逆算し、教材を日次タスクへ自動配分する学習計画アプリ。
機能: 逆算プラン生成 / 年間フェーズ / 進捗トラッキング(自動リスケ) /
カレンダー / 学習記録・統計。

## 技術スタック

- **フレームワーク**: Next.js 16(App Router / TypeScript)
  - `middleware` は廃止。`src/proxy.ts`(proxy 規約)を使用
- **スタイリング**: Tailwind CSS v4(`tailwind.config.js` 不使用。テーマは
  `src/app/globals.css` の `@theme` / CSS 変数で定義)
- **UI**: shadcn/ui(base: radix、preset: nova、アイコン: lucide)
- **バックエンド/DB/認証**: Supabase(`@supabase/ssr`)

## 配色

`src/app/globals.css` で定義。primary はインディゴ `#4f46e5`。

| 用途 | トークン | 色 |
| --- | --- | --- |
| 基礎固めフェーズ | `bg-phase-basic` | 青 `#2563eb` |
| 発展フェーズ | `bg-phase-advance` | 紫 `#7c3aed` |
| 直前対策フェーズ | `bg-phase-final` | オレンジ `#ea580c` |
| 完了・成功 | `bg-success` | 緑 `#16a34a` |
| マイルストーン | `bg-milestone` | 琥珀 `#d97706` |

## コーディング規約(厳守)

1. **`any` 禁止**: 型が不明な場合は `unknown` + 絞り込み、またはジェネリクス。
   Supabase の型は `src/types/database.ts` を参照。
   **注意: Row 型は `interface` ではなく `type` で定義すること**
   (interface は index signature を持たず supabase-js の型制約を満たさない)。
2. **関数コンポーネントのみ**。
3. **Supabase 操作はサーバー側で**: Server Components / Server Actions
   (`src/lib/actions/`)で行う。クライアントから直接 DB を叩かない。
4. **エラーハンドリング必須**: Supabase 呼び出しは必ず `error` を確認し、
   toast などでユーザーに伝えるか適切にフォールバックする。
5. **プラン生成ロジックは純関数**: `src/lib/plan/engine.ts` に DB アクセスを
   持ち込まない(actions 側で入出力する)。

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/        # login / signup(未ログイン向け)
│   ├── (dashboard)/   # ホーム, calendar, materials, stats, settings
│   └── layout.tsx
├── components/
│   ├── ui/            # shadcn/ui
│   ├── layout/        # Sidebar / Header / BottomNav
│   └── features/      # 機能別(auth, dashboard, materials, settings, stats, plan)
├── lib/
│   ├── supabase/      # client.ts(ブラウザ) / server.ts / proxy.ts(セッション更新)
│   ├── actions/       # Server Actions(auth, plan, masters)
│   └── plan/engine.ts # 逆算プラン生成エンジン(純関数)
├── proxy.ts           # 認証ガード(Next16 の proxy 規約)
└── types/database.ts  # Supabase スキーマ型

supabase/migrations/   # マイグレーション SQL
```

## ドメインモデル

- `milestones`: 試験・模試・出願。`is_target=true` の1件が逆算基準の本命試験日
- `materials`: 教材。`total_units`(総量)× `minutes_per_unit` で時間見積もり。
  `phase`(basic/advance/final)の期間内に完了するよう配分される
- `study_tasks`: エンジンが生成する日次タスク。`unit_start`〜`unit_end` が範囲
- `plan_settings.weekday_minutes`: 曜日(0=日〜6=土)別の学習可能分数
- リスケ = pending タスク全削除 → 完了済み量を差し引いた残りを今日以降に再配分
  (`regeneratePlan` アクション)
- タスク完了時は `study_logs` に学習時間を自動記録(`task_id` で紐付け、
  完了取り消しで削除)

## 環境変数

`.env.example` を参照。`.env.local` に Supabase URL / anon キーを設定。

## 開発コマンド

```bash
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
npm run lint    # ESLint
```

※ Node は nvm 管理(v24)。新しいシェルでは `nvm use` で有効化すること。
