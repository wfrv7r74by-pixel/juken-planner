-- handle_new_user() は auth.users のトリガー専用。
-- PostgREST 経由の直接実行(/rest/v1/rpc/handle_new_user)を許可しない。
-- トリガーは関数所有者の権限で動くため、revoke してもサインアップ時の
-- profiles / plan_settings 自動作成には影響しない。
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
