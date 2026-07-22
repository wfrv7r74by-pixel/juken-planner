@AGENTS.md

# juken-planner — AI と一緒に作る受験ダッシュボード(v3)

AI と相談しながら受験計画を組み立てるダッシュボードアプリ。
機能: AI相談(フェーズ/ルーティン/教材の提案→ワンタップ反映) /
フェーズ戦略 + NEXT/FINAL カウントダウン / 曜日別ルーティン(時間ブロック) /
振り返り・履歴・分析 / 教材の章立て管理(AI が Web 検索で目次取得)。
v2 の「教材日割りエンジン」は廃止済み(migration 0003 でリセット)。

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

## AI モデルのティア分け

`src/lib/ai/models.ts` で用途別にモデルを一元管理する。差し替えはこのファイルのみ。
- **strategy**(AI相談): `claude-opus-4-8` + adaptive thinking + web検索(dynamic filtering)
- **utility**(教材検索・分類): `claude-haiku-4-5`(Opus の約1/5コスト)+ 基本web検索
- 相談は STABLE_SYSTEM をキャッシュ、変動部(現状データ)は breakpoint の後ろに置く。

## 拡張の継ぎ目(ロードマップ)

後から全体構造を変えずに機能追加できるよう、以下の seam を用意済み。
- **AI課金ゲート**: `src/lib/ai/gate.ts` の `checkAiAccess()` が全AI呼び出しの唯一の関所。
  公開・課金化時はこの関数にサブスク/クォータ判定を足すだけ(各Actionは変更不要)。
- **モデル/プロバイダ差し替え**: `src/lib/ai/models.ts` のティア設定を変更するだけ。
  将来スケール時に一部を他社の格安モデルに寄せる場合もここで吸収。
- **教材ECサイト連携**: 教材登録は `src/lib/data/materials.ts` に集約済み。
  外部マスタ(EC)差し替えを見据えた形。
- **解答採点システム**: `src/lib/grading/`(開発エリア・スタブ)。型と受け皿のみ用意。
  実装時は models.ts のティアと gate.ts を通し、UI は `app/(dashboard)/grading/` に新設。

## 環境変数

`.env.example` を参照。`.env.local` に Supabase URL / anon キーを設定。

## 開発コマンド

```bash
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
npm run lint    # ESLint
```

※ Node は nvm 管理(v24)。新しいシェルでは `nvm use` で有効化すること。
