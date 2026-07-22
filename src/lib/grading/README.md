# 解答採点システム

数学・英語・理科などの解答を AI が採点する機能。**v1 実装済み**(テキスト入力)。

## 採点方針(重要)

- **採点基準は高校の履修範囲**(学習指導要領)。高校範囲を超える解法を要求して減点しない。
- 背景に大学範囲の理論がある場合は `universityContext` に **+αの補足**として分離(採点には影響させない)。
- 高校では習わないが難関大で頻出・有利な技能は `advancedSkills`(**注目ポイント**)にまとめる。

## 構成

- `types.ts` — 型(GradingRequest / GradingResult / 科目)
- `index.ts` — `gradeAnswer()`。Opus 4.8(grading ティア)+ submit_grading ツールで構造化
- `src/lib/actions/grading.ts` — Server Action(採点 + `grading_results` 保存)
- `src/app/(dashboard)/grading/` — UI(入力フォーム・結果カード・履歴)
- `supabase/migrations/0005_grading.sql` — 採点履歴テーブル

## 接続点(既存構造を変えずに拡張)

- モデル: `src/lib/ai/models.ts` の `grading` ティア(正確性優先で Opus + effort high)
- 利用可否: `src/lib/ai/gate.ts` の `checkAiAccess`(課金ゲートを継承)

## 今後(未着手)

- [ ] 画像入力(答案の写真)対応 — Claude の vision で答案画像を読む
- [ ] 採点結果を復習リスト・学習記録と連携
- [ ] 科目別のより詳細な採点ルーブリック
