# HANDOFF — juken-planner 引き継ぎ

作成日時: **2026-07-23 18:29 JST**

> このファイルは新セッションが単独で作業を継続するための引き継ぎメモ。
> 記載はコード確認・実機/テスト実行で検証した内容に限る。未検証は「未確認」と明記。
> スタック/セットアップ手順の詳細は重複を避け [README.md](README.md) / [CLAUDE.md](CLAUDE.md) を参照。

---

## 1. プロジェクト概要

- **目的**: 受験生向け「AIと一緒に作る受験ダッシュボード」。志望校合格から逆算し、
  日々のルーティン・振り返り・教材/模試管理・解答採点を1つに統合する Web アプリ。
- **完成度(体感)**: v3 コア機能は動作。学習相談(5層ヒアリング→計画生成)は Phase 1 の
  基盤+初回ヒアリングUI+**計画生成エンジン(1-3)まで実装完了**。エンジンのコアは tsx で
  26 ケース検証済み(下記)だが、**DB保存を伴う実機検証は migration 0008/0009 未適用のため未実施**。
  残りは Phase 1-4(週次4ステップ)。
- **動作している機能(このセッションで実機/テスト検証したもののみ)**:
  - 認証(メール+パスワード)/ ダークテーマ(高級ホテル調: 黒+シャンパンゴールド+明朝見出し)
  - **教材検索**: 教材名→AI(Haiku 4.5)がWeb検索で正式名称特定・**教科自動分類**・章立て・
    **目標適合度★**。実機で「システム英単語」→英語/★★★★☆/追加まで確認済み。
  - **解答採点(テキスト)**: Opus 4.8、高校範囲基準+大学範囲背景(+α)+注目ポイント。
    実機で極限問題の誤答→0点/弱点/復習単元まで確認済み。
  - **採点→復習リスト連携**: 復習単元をワンタップで復習リスト登録。
  - **復習リスト**: ホームにウィジェット(タップ完了・バッジ)、分析タブに「復習した項目(30日)」。
    実機で完了トグル→バッジ 2→1、分析 1件 表示を確認済み。
  - **模試 検索**: 模試名→AIが種別自動分類/大学/科目反映。実機で「京大即応オープン」→
    冠模試/京都大学/8科目 反映を確認済み。
  - **学習相談 初回ヒアリングUI**: /ai に3タブ(学習相談/相談チャット/計画データ)。
    Q1「志望校」+「わからない」分岐、進捗バー表示を実機確認(**保存は未確認**、下記§4/§6)。
  - **学習相談 コアロジック**: 5層ブロック判定・可処分時間0.8掛け・週次4:2:1テンプレを
    tsx 単体テストで検証済み(scratchpad のテスト、リポジトリ外)。
- **このセッションで実装した内容(学習相談 Phase 1-3 計画生成エンジン, ハイブリッド方式)**:
  - `src/lib/learning/plan.ts` = 純関数エンジン。逆算(残り週数で除算)・科目配分(苦手厚め)・
    4:2:1 週テンプレ・忙しい曜日除外・診断フェーズ 0.6 減量・範囲ベースタスクの決定論生成。
  - `src/lib/ai/plan.ts` = Opus(strategy)が範囲タスクを具体化(forced submit tool)。失敗/未課金時は
    決定論フォールバック。出力を検証し 4要素(教材名+開始+終了+到達度)欠落や時間ベースを除外。
  - `src/lib/actions/plan.ts` = `generateWeeklyPlan`(gate→ブループリント→AI/決定論→保存)/
    `loadCurrentWeeklyPlan`/`toggleWeeklyPlanTask`。全て**テーブル未適用に防御的**。
  - `supabase/migrations/0009_weekly_plans.sql`(新規, jsonb 保存)。
  - UI: `/ai` に「今週の計画」タブ(`weekly-plan.tsx`)。曜日別カード・完了トグル・再生成。
  - `src/types/database.ts` に `weekly_plans` 追加。
  - **検証**: scratchpad の tsx で 26/26 pass(ゲートブロック/範囲ベース厳守/忙しい曜日回避/
    0.8掛け/diagnostic 0.6/配分)。`npm run build`・`lint`(エラー0/既知警告3)通過。
    **実機(ブラウザ+DB)は 0008/0009 未適用のため未検証**。
  - **設計判断(HANDOFF§9-7 の宿題)**: 生成タスクは study_logs/routine_blocks ではなく
    新テーブル `weekly_plans`(週×ユーザーで1行, plan jsonb にタスク配列と完了状態)に保存。
    理由: 出力は「週」が単位で範囲ベースの4要素+曜日+slotKind を持ち、週次で丸ごと再生成する
    ため既存アーキ(学習プロフィールも jsonb)に一致。study_logs 連携は Phase 1-4 で検討。
  - **ロードマップ層(勉強計画の再設計 第1弾, 承認済み計画 `.claude/plans/ai-ai-1-2-delightful-taco.md`)**：
    weekly_plans の上に「区分ロードマップ層」を新設。`/ai` を「相談(ヒアリングのみ, **チャット削除**) →
    勉強計画(**前提入力→区分ロードマップ→今週の計画**)」へ再編。
    - 相談から `ChatPanel` を除去。ヒアリングの **確保時間(hours)質問を廃止**し、可処分時間は
      **前提ステップの固定予定から導出**(既定ウィンドウ 平日16-22/休日9-21 − 固定予定 − 宿題 ×0.8)。
    - 区分=基礎/演習/発展/過去問/共テ を **既存 `phases` テーブルに同期**(`kind` 列追加)。
      目標・概念などのメタは新 `study_roadmaps`(jsonb)。今週は既存 weekly_plans を流用。
    - 新規: `lib/learning/roadmap.ts`(純関数: 区分割り・各区分15%バッファ・概念/月週目標・可処分時間導出) /
      `lib/ai/roadmap.ts`(Opus で文言肉付け, 構造は決定論を正・文言のみ上書き, 失敗時フォールバック) /
      `lib/actions/roadmap.ts`(`generateRoadmap`=ゲート→骨格→AI→study_roadmaps保存＋phases同期→今週の計画生成 /
      `loadRoadmap`) / `lib/actions/plan-prereq.ts`(`savePrerequisites`=固定予定→routine_blocks・宿題・
      可処分時間の書き戻し) / `components/features/plan/prerequisites-form.tsx` / `roadmap-view.tsx` /
      `supabase/migrations/0010_roadmap.sql`(冪等)。
    - 検証: `roadmap.ts` を tsx で **19/19 pass**(区分連続・15%バッファ・過去問共テ末尾・短期間・
      可処分時間導出)。build/lint 通過。**実機は 0010 未適用 & ログイン必須のため未検証**。
  - **教材提案フロー(第2弾)実装済み**: 現区分の抽象概念 → 具体的参考書を AI 提案(節目提案)。
    - `RoadmapData.materialSteps[]`(区分ごと: resolved + suggestions)を追加。生成時は空で、
      区分入場時に「提案してもらう」で埋める(Q3「抽象概念だけ先に」に沿い、書名は区分開始時)。
    - 新規: `lib/ai/material-suggest.ts`(utility/Haiku+web検索, 概念→定番参考書1〜2冊+理由) /
      `components/features/plan/division-materials.tsx`(提案表示・追加・検索追加・完了)。
    - actions: `roadmap.ts` に `suggestDivisionMaterials`/`resolveDivisionMaterials`、
      `material-search.ts` に `quickAddMaterial`(検索→登録を一括)。追加は既存 confirmMaterial、
      検索は既存 searchMaterial を流用。**「計画後もいつでも追加可」を UI に明示**。
    - 注意: ロードマップ再生成で materialSteps は空に戻る(resolved 消失=再提示)。仕様上許容。
    - build/lint 通過。**実機未検証(0010 未適用+ログイン+AI 必須)**。
  - **編集フォーム(第3弾)実装済み**: 勉強計画の生成後に予定・宿題・区分期間を編集可能に。
    - `components/features/plan/plan-editor.tsx`(2タブ: ①予定・宿題 = `PrerequisitesForm` を編集モードで
      再利用[`initialFixedBlocks`/`saveLabel` を追加] ②区分の期間 = 各区分の開始/終了編集・削除)。
    - actions: `roadmap.ts` に `updateRoadmapDivisions`(期間一括更新→月/週目標を決定論再計算→phases同期) /
      `deleteRoadmapDivision`(削除し空き期間を隣区分に吸収→同上)。
    - `/ai` page が routine_blocks(life)を lifeBlocks として読み込み、AiHub→RoadmapView→PlanEditor へ伝播。
      RoadmapView ヘッダに「編集」トグルを追加。
    - 検証: tsx で **6/6 pass**(削除後の区分連続性・先頭/中間削除の吸収・materialSteps 初期化)。
      build/lint 通過。**新規 migration 不要**(既存 study_roadmaps jsonb + phases を更新)。実機未検証。
    - → **勉強計画の再設計 第1〜3弾すべて実装完了**。
  - **イテレーション2(実機フィードバック対応, 承認済み計画)＝実機検証まで完了**:
    1. **共テ時期の修正**: `dividePeriod` を時系列順(基礎→演習→発展→**共テ→過去問**)に。
       共通テストを1月中旬(自動=その年1月第3土曜, `autoCommonTestDate`)or『共通テスト』マイルストーンに
       アンカーし、共テ対策=共テ日で終了/二次過去問=共テ後〜本番。実機で **共テ対策12/31〜01/16・
       過去問01/17〜02/25** を確認。
    2. **1日の時間割化＋ホーム予定連携**: 新 `lib/learning/timetable.ts`(純関数, 空き時間に配分比で
       複数コマ＋冒頭復習＋日曜計画枠＋休憩) / `lib/ai/timetable.ts`(科目別の活動をAIが付与) /
       `lib/actions/timetable.ts` `generateWeeklyTimetable`(**routine_blocks(study)へ書込, effective_from
       非NULLの生成物のみ置換, 手動/生活は保持**)。`generateRoadmap` が weekly を timetable に差し替え。
       ホームの予定タブ(`DashboardTabs`)は無改修で時間割表示。`RoadmapView` は WeeklyPlan→
       `WeekTimetable`(プレビュー＋作り直し)に置換。`/ai` page は study ブロック＋subjects を読込。
       profile に `studyWindow` 追加(jsonb, マイグレ不要)。実機で **各日 複数コマ＋ホーム予定反映** 確認。
    3. **バグ修正**: 受験方式値 `general`(一般選抜) が `goal.subjects` に混入し時間割に "general" コマが
       出た → `computeSubjectAllocation`/generateRoadmap で **有効科目コードのみ**に絞り解消(実機確認)。
    - **旧 weekly_plans 系は使用停止**(dead): `weekly-plan.tsx` / `actions/plan.ts` / `ai/plan.ts`。
      `plan.ts`(computeAvailability は profile.ts, computeSubjectAllocation は plan.ts)は再利用継続。将来削除可。
    - tsx 検証: 共テ 12/12・時間割 11/11・区分削除マージ 6/6・ロードマップ 19/19 pass。build/lint 通過。
    - **実機検証(組込ブラウザがログイン済みだったため実施)**: /ai 再生成→区分・月/週目標・時間割生成→
      ホーム「予定」に反映→完了チェック可、まで確認済み。**新規 migration 不要**。
    - 実機で気づいた別課題(スコープ外): 本命『京都大学 入試』マイルストーンの日付が profile の
      examDate(2027-02-25)と不一致で、ホーム FINAL の残日数が 0日 表示になることがある。要データ修正。
  - **UX統合(ユーザー要望): AI相談まわりを「相談 → 勉強計画」の2ステップ一本道へ**。
    `/ai` の旧4タブ(学習相談/今週の計画/チャット/データ)を廃し、① 相談(ヒアリング＋AIチャットを
    1画面に統合)→ ② 勉強計画(今週の計画)の2ステップに再編。ステップ間はボタンで遷移
    (相談完了→「勉強計画を作る」、計画がブロック時→「相談に戻って埋める」)。
    重複していた「データ」タブ(試験日程・フェーズの手動編集=MilestoneManager/PhaseManager)は
    **設定ページへ移動**。トップナビの「AI相談」を「勉強計画」に改称(icon も CalendarCheck)。
    ホームの「本命試験日を設定」リンクは設定へ向け直し。build/lint 通過。
  - **模試なしユーザー向け代替指標(§5-3①)を追加**(改善): ヒアリングで模試「なし」かつ第2層未取得の
    ときだけ `level.proxy` 質問を出し、次の3方式で現在地を推定値(estimated)として満たせる:
    ① 英検などの資格(certifications) ② 高校の成績＝学力帯＋学年順位(高2・高3, schoolLevelBand+classRank)
    ③ 高校入試の結果＝学力帯＋内申/得点率(**新高1・高1向け**, schoolLevelBand+periodicTestScores)。
    ③はユーザー要望で追加(新高1は校内成績がまだ無いため)。これで模試なしでも計画生成に到達できる
    (診断テストは Phase 2)。
    完了画面も行き止まりにせず、不足時は /mocks 登録・代替指標登録・診断テスト(近日)へ誘導する。
    関連: `questions.ts`(PROXY_QUESTION/pendingQuestions), `actions/learning.ts`(level.proxy),
    `learning/onboarding-form.tsx`(proxy UI・完了カード改善)。tsx で 9/9 検証済み。
- **未実装/未完了**:
  - 学習相談の**週次4ステップフロー**(Phase 1-4)= 未着手。
  - 診断テスト(AI生成)/母集団補正/節目モード = Phase 2 以降(未着手)。
  - 模試の**保存・写真OCR・弱点抽出・偏差値推移表示** = コードはあるが**実機未検証**(§6)。
  - 採点の**答案写真vision採点** = アップロード/プレビューは確認、vision採点結果は**未確認**(§6)。
  - AIの「相談チャット」自体(propose_* 提案・反映)は過去セッションで実装済みだが、
    このセッションでは未再検証。

---

## 2. ディレクトリ構成

Next.js 16 App Router。`src/app/(auth)` と `src/app/(dashboard)` のルートグループ構成。

```
supabase/migrations/       0001〜0008 の SQL(§4 に適用状況)
src/app/(auth)/            login / signup
src/app/(dashboard)/       page.tsx=ホーム, ai, grading, mocks, materials, settings
src/lib/
├ supabase/  client.ts(ブラウザ)/ server.ts / proxy.ts(認証ガード。Next16はmiddleware→proxy)
├ actions/   Server Actions:
│            auth, masters(科目/教材/フェーズ/ルーティン/振り返り), chat(AI相談),
│            material-search(教材検索), grading(採点), review(復習リスト), mock(模試),
│            learning(学習相談プロフィール読み書き)
├ ai/        Claude 呼び出しのコア(サーバー専用):
│            models.ts(★モデルのティア一元管理), gate.ts(★AI課金ゲート),
│            chat.ts, material-search.ts, mock.ts
├ data/      materials.ts(教材登録ロジックの共通化。将来EC連携の集約点)
├ grading/   index.ts(gradeAnswer/vision), types.ts, README.md
└ learning/  types.ts(UserLearningProfile 5層), profile.ts(コア純粋関数),
             questions.ts(初回10問定義+pendingQuestions)
src/components/features/   auth, chat(ai-hub含む), dashboard, materials, grading,
                           mocks, settings, learning(onboarding-form)
src/components/ui/         shadcn/ui + aceternity/(number-ticker のみ現存)
src/types/database.ts      Supabase スキーマ型(Row型は type で定義。interface不可)
```

主要ファイルの役割(特に重要なもの):
- `src/lib/ai/models.ts` — 用途別モデル: strategy=`claude-opus-4-8`(相談/弱点),
  utility=`claude-haiku-4-5`(教材/模試の検索・分類・OCR), grading=Opus+effort high。
  モデル/プロバイダ差し替えはこのファイルのみ。
- `src/lib/ai/gate.ts` — `checkAiAccess()`。全AI呼び出しが通す唯一の関所。公開/課金化時は
  ここにサブスク判定を足すだけ(各Actionは変更不要)。現状は API キー有無のみ判定。
- `src/lib/learning/profile.ts` — `canGeneratePlan()`(5層ブロック), `computeAvailability()`
  (0.8掛け §6-2), `assignWeeklyTemplate()`(4:2:1、忙しい曜日除外), `computeCompleteness()`。

---

## 3. アーキテクチャ

- **Next.js 16 App Router + Server Actions**。DB読み書き・AI呼び出しは全てサーバー側。
  クライアントからDB直叩き/AIキー露出はしない。
- **Supabase**: Postgres + Auth(email/pw) + Storage(`answers`バケット) + RLS(全テーブル本人のみ)。
- **AIモデルのティア分け**(採用理由): 用途でコスト最適化。検索/分類/OCRは安価な Haiku 4.5、
  相談/採点/弱点は Opus 4.8。models.ts に集約し将来の差し替え/他社混在を1箇所で吸収。
- **AI課金ゲートの継ぎ目**(採用理由): 公開・Stripe課金を見据え、AI利用可否判定を
  gate.ts の1関数に集約。機能追加時に構造を作り替えずに課金制へ移行できる。
- **学習相談プロフィールは jsonb で保持**(採用理由): 5層モデルは深いネスト+項目ごとの
  confidence を持つため、正規化より jsonb が TS 型と1:1で扱いやすい。単元マスタリーのみ
  クエリ用に別テーブル `unit_mastery` に切り出し(Q3のユーザー確定方針)。
- **採用しなかった案**:
  - 教材の「日割り自動エンジン」(v2)→ v3 で廃止(migration 0003)。ユーザーが
    「フェーズ戦略+曜日ルーティン+AI相談」型を選好したため。
  - 診断テストのキュレーション問題バンク → **AI生成**を採用(ユーザー確定。問題バンク不要)。
  - 学習相談を別ページ新設 → 既存AI相談へ**発展統合**を採用(ユーザー確定)。
- **UI方針**(ユーザー確定): 「派手」=スポットライト/ネオンではなく**高級ホテル調の落ち着き**。
  スポットライト/ビーム/マウス追従グローは撤去済み。number-ticker のみ残す。設定ページは
  一般的構成(アカウント/AI利用状況/データ管理)にとどめ、計画編集は置かない。
  AIは「共に作る」より一歩前に出て提案主導。

---

## 4. 現在の状態

- **ブランチ**: `main`。直近コミット: `7780793`
  「docs: AI学習相談の実装指示書を docs/ に保存 + HANDOFF参照更新」。
- **git status**: **未コミット変更あり**(Phase 1-3 の実装。まだコミットしていない)。
- **未コミット変更(このセッション)**:
  - 新規: `src/lib/learning/plan.ts` / `src/lib/ai/plan.ts` / `src/lib/actions/plan.ts` /
    `src/components/features/learning/weekly-plan.tsx` / `supabase/migrations/0009_weekly_plans.sql`
  - 変更: `src/app/(dashboard)/ai/page.tsx` / `src/app/(dashboard)/settings/page.tsx` /
    `src/app/(dashboard)/page.tsx` / `src/components/features/chat/ai-hub.tsx` /
    `src/components/features/learning/onboarding-form.tsx` /
    `src/components/features/learning/weekly-plan.tsx` / `src/components/layout/nav-items.ts` /
    `src/types/database.ts` / `src/lib/learning/questions.ts` / `src/lib/actions/learning.ts` /
    本 `HANDOFF.md`(0007/0008/0009 マイグレーションも冪等化のため変更)
- **ビルド/lint**: `npm run build` 成功・型チェック通過。`npm run lint` はエラー0/警告3
  (警告は将来スタブの未使用引数 `_supabase`/`_userId`/`_request`。gate.ts・grading/index.ts)。
- **直前に作業していた内容**: 学習相談 Phase 1 を小分けで実装中。1-1(基盤+コアロジック)と
  1-2(初回ヒアリングUI)を完了・push。次は **1-3 計画生成エンジン**に着手する直前だった。
- **マイグレーション適用状況**(Supabaseは単一プロジェクト。両テスト垢が同一DBを共有):
  - 0001/0002/0003/0004: **適用済みと判断**(認証・v3機能・fit_score保存が実機で動作)。
  - 0005(grading)/0006(review_and_storage): ユーザーが適用報告。**review_items は実機動作確認済み**。
    grading_results の保存自体は未確認だが 0006 適用済みなら 0005 も適用済みの可能性大。
  - 0007(mocks): **適用済み**(このセッションで判明。再実行時に `mock_exams already exists`
    42P07 が出たため)。模試「検索」はDB不要で動作、保存・OCR・推移は未検証。
  - 0008(learning_profile): 適用状況**不確実**(ユーザーは「0006まで」と自己申告したが 0007 は
    実際には適用済みだった)。→ 冪等化で対処。
  - 0009(weekly_plans): このセッションで新規作成。計画の保存・完了トグルはこれが前提。
  - 0010(roadmap): **未適用**(このセッションで新規作成)。study_roadmaps＋phases.kind。
    ロードマップ生成・保存はこれが前提。冪等。
  - **重要: 0007〜0009 を冪等(if not exists / drop policy)に書き換え済み**。適用状態に関わらず
    番号順に再実行して安全に揃えられる(既存はスキップ)。0001〜0006 は非冪等のままなので触らない。
- **注意事項**:
  - `git` 認証は gh CLI 不在のため、キーチェーン「GitHub - https://api.github.com」
    (GitHub Desktopのトークン)を `security` で取得して push している。push 時に macOS の
    許可ダイアログが出るので**ユーザーの承認が必要**。
  - Supabase への SQL 適用は**ユーザーが手動**で SQL Editor から実行(Claudeは実行しない)。
  - 過去に一度、誤って human リポジトリへ push→即 force-push で復元済み。commit/push 前に
    cwd と対象リポジトリを必ず確認すること(cwd はコマンド間でリセットされ得る。
    `npm --prefix /Users/adachiyuma/VScode/juken-planner ...` を使うと安全)。

---

## 5. 未完了タスク(優先順位付き)

### P0(必須・次の着手対象)
1. ~~学習相談 Phase 1-3 計画生成エンジン~~ **実装完了**(§1 参照, tsx検証済/実機未検証)。
   次セッションはまず **migration 0008・0009 適用後の実機検証**(下記2)を行う。
2. **migration 0007/0008/0009 の適用 + 実機検証**。ユーザーに SQL Editor で番号順適用を依頼し、
   適用後に (a) ヒアリング回答保存, (b) `/ai`「今週の計画」で生成→曜日別タスク表示→完了トグル,
   (c) 模試保存 を実機検証する。**0008/0009 未適用のうちは保存系が一切動かない**。

### P1(高)
3. 学習相談 Phase 1-4 **週次4ステップフロー**(振り返り→要因分析→確認テスト誤答は復習優先→翌週設計)。
4. 模試機能の実機E2E検証(保存→弱点抽出→偏差値推移グラフ→復習連携)。0007適用が前提。
5. 採点の答案写真**vision採点**の実機検証(§6)。

### P2(低)
6. Phase 2: 診断テスト(AI生成)/母集団補正テーブル(§5-4、数値はハードコード禁止・要ユーザー確認)/節目モード。
7. 公開デプロイ(Vercel)。
8. lint 警告3件の解消(将来スタブ引数)。任意。

---

## 6. 既知のバグ・課題

- **模試の保存/OCR/弱点抽出/推移が未検証**。
  - 再現/確認方法: /mocks 「登録」タブで模試を保存 → 「記録・推移」タブで表示・グラフ確認。
  - 原因/仮説: **migration 0007 が未適用の可能性**(ユーザー未確認)。未適用なら
    `mock_exams`/`mock_subjects` が無く保存失敗。まず 0007 適用状況を確認すること。
- **学習相談のヒアリング回答保存が未検証**。
  - 再現: /ai 「学習相談」タブで質問に回答 → 保存され次の質問に進むか。
  - 原因: **migration 0008 未適用**。`loadProfile` は未適用時も既定を返すので画面は出るが、
    `answerQuestion` の upsert は失敗し「migration 0008 を適用してください」エラーになる想定。
- **採点の答案写真vision採点が未確認**。
  - 再現: /grading 写真アップロード→採点。
  - 状況: 画像アップロード(Storage)とプレビュー表示は実機確認済み。vision採点の結果表示は
    直近の確認がタイムアウトし**未確認**。テキスト採点は完全動作。
- 上記はいずれも**コード上の欠陥は未確認**。主因はマイグレーション適用状況の可能性が高い。

---

## 7. セットアップ

詳細は [README.md](README.md) 参照。要点のみ:

- **必要な環境変数**(名前のみ。値は `.env.local` に。`.env*` は gitignore 済み):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ANTHROPIC_API_KEY`(AI機能に必須。従量課金。console.anthropic.com でクレジット購入要)
- **Node**: nvm 管理 v24。新シェルでは `nvm use`。
- **起動**: `npm install && npm run dev`(http://localhost:3000)。
  Claude Code のプレビューは `.claude/launch.json` の `juken-planner-dev` を使用。
- **DB**: Supabase の SQL Editor で `supabase/migrations/` を番号順に適用(ユーザー手動)。
  現状 0007/0008 の適用状況を最初に確認すること(§4)。
- **テスト**: 自動テストフレームワークは**未導入**。コアロジックは scratchpad に置いた
  tsx スクリプトで都度検証してきた(リポジトリ外)。恒久化するなら vitest 等の導入を検討。
- **検証手段**: `npm run build`(型チェック込み)/ `npm run lint` / ブラウザプレビューでの実機確認。

---

## 8. 次のセッションで最初に読むべきファイル(優先順)

1. **HANDOFF.md**(本ファイル)
2. `CLAUDE.md`(コーディング規約・配色・ロードマップ・拡張の継ぎ目)
3. `src/lib/learning/types.ts` と `src/lib/learning/profile.ts`(学習相談の型とコアロジック)
4. `src/lib/learning/questions.ts`(初回10問と pendingQuestions)
5. `src/lib/actions/learning.ts`(プロフィール保存・回答反映)
6. `src/components/features/chat/ai-hub.tsx` と
   `src/components/features/learning/onboarding-form.tsx`(ヒアリングUIの統合先)
7. `src/lib/ai/models.ts` / `src/lib/ai/gate.ts`(モデルティア・課金ゲート)
8. **`docs/ai-learning-consultation-spec.md`**(AI学習相談の実装指示書 全文。5層モデル/
   計画生成§6/週次§7/受け入れ基準§10/禁止事項§11。冒頭に確定済み前提あり)。
   計画生成エンジンを実装する際の一次仕様。
9. `supabase/migrations/0007_mocks.sql` / `0008_learning_profile.sql`(適用状況確認用)

---

## 9. 次にやるべきこと(チェックリスト)

1. [ ] 本 HANDOFF.md と CLAUDE.md を読み、状態を把握する。
2. [ ] `npm run build` と `npm run lint` を実行し、現状が壊れていないことを確認(警告3は既知)。
3. [ ] ユーザーに **migration 0007・0008 の適用状況**を確認する(未適用なら適用を依頼)。
4. [ ] 0008 適用後、/ai 「学習相談」で1問回答→保存され次問へ進むかを実機確認(P0-2)。
5. [ ] 0007 適用後、/mocks で模試保存→弱点抽出→「記録・推移」の偏差値グラフを実機確認。
6. [ ] **学習相談 Phase 1-3 計画生成エンジン**に着手(P0-1)。仕様は §5/§9、
   コア関数 `canGeneratePlan`/`computeAvailability`/`assignWeeklyTemplate` を土台に。
   出力は**必ず範囲ベース**(教材名+開始+終了+到達度)、時間ベース禁止、
   未習単元に演習を割り当てない、5層未達でブロックし不足層を提示。
7. [ ] 生成タスクは既存の `study_logs`/ルーティン(routine_blocks)や新テーブルの
   どちらに載せるか設計判断する(要検討・未決定)。
8. [ ] 実装は小分けにコミット。commit/push 前に cwd/対象リポジトリを確認
   (`npm --prefix` 推奨、push はキーチェーン許可ダイアログ承認が必要)。
9. [ ] 実機検証はブラウザプレビュー(`.claude/launch.json` の juken-planner-dev)で行い、
   スクショ/DOM で結果を確認してからユーザーに報告する。
10. [ ] Phase 1 完了後、Phase 1-4(週次4ステップ)→ Phase 2(診断テスト等)へ。
