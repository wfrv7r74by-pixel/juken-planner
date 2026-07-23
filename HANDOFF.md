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
  途中(基盤+初回ヒアリングUIまで完了、計画生成エンジン未着手)。
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
- **未実装/未完了**:
  - 学習相談の**計画生成エンジン**(Phase 1-3)= 未着手。
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

- **ブランチ**: `main`。直近コミット: `8274185`
  「feat(学習相談 Phase1-2): 初回10問ヒアリングUI(選択式・わからない分岐)」(2026-07-23 11:48:53 +0900)。
- **git status**: クリーン(未コミット変更なし)。`origin/main` と同期済み。
- **未コミット変更**: なし。
- **ビルド/lint**: `npm run build` 成功・型チェック通過。`npm run lint` はエラー0/警告3
  (警告は将来スタブの未使用引数 `_supabase`/`_userId`/`_request`。gate.ts・grading/index.ts)。
- **直前に作業していた内容**: 学習相談 Phase 1 を小分けで実装中。1-1(基盤+コアロジック)と
  1-2(初回ヒアリングUI)を完了・push。次は **1-3 計画生成エンジン**に着手する直前だった。
- **マイグレーション適用状況**(Supabaseは単一プロジェクト。両テスト垢が同一DBを共有):
  - 0001/0002/0003/0004: **適用済みと判断**(認証・v3機能・fit_score保存が実機で動作)。
  - 0005(grading)/0006(review_and_storage): ユーザーが適用報告。**review_items は実機動作確認済み**。
    grading_results の保存自体は未確認だが 0006 適用済みなら 0005 も適用済みの可能性大。
  - 0007(mocks): **適用は未確認**(ユーザーの明示確認なし)。模試「検索」はDB不要で動作、
    保存・OCR・推移は未検証。
  - 0008(learning_profile): **未適用**(直近作成)。ヒアリングUIは既定プロフィールで表示のみ確認。
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
1. **学習相談 Phase 1-3 計画生成エンジン**(§9)。仕様書の §6:
   総量算出→逆算→配分→4:2:1テンプレへ流し込み、**範囲ベース**タスク(教材名+開始+終了+到達度)、
   未習単元に演習を割り当てない、5層未達ならブロック(canGeneratePlan は実装済み)。
2. **migration 0007/0008 の適用確認**。未適用なら保存系が動かない。適用後に
   模試保存・学習相談プロフィール保存を実機検証する。

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
8. 直近の AI相談仕様書(会話履歴内。5層モデル/計画生成§6/週次§7/受け入れ基準§10)
   — 本リポジトリにはファイル化されていない。**未ファイル化**なので新セッションでは
   会話に無ければユーザーに再提示を依頼するか、HANDOFFの要約(§5 P0-1)を仕様とする。
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
