-- Teste para um PostgreSQL local que já recebeu supabase/setup.sql.
BEGIN;

CREATE FUNCTION pg_temp.fail_last_backup_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('zapflow.test_fail', true) = 'on' THEN
    RAISE EXCEPTION 'Falha simulada na última exclusão' USING ERRCODE = 'ZF001';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER test_backup_delete BEFORE DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_last_backup_delete();

DO $$
DECLARE
  account uuid := gen_random_uuid();
  old_message bigint;
  old_task bigint;
  snapshot jsonb;
  additions jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES (account);
  PERFORM set_config('request.jwt.claim.sub', account::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', account)::text, true);
  INSERT INTO public.messages(title) VALUES ('Texto original') RETURNING id INTO old_message;
  INSERT INTO public.tasks(title, due_at) VALUES ('Tarefa original', now()) RETURNING id INTO old_task;
  snapshot := jsonb_build_object('messages', jsonb_build_array(old_message), 'tasks', jsonb_build_array(old_task));
  additions := jsonb_build_array(
    jsonb_build_object('table', 'messages', 'row', jsonb_build_object('user_id', account, 'title', 'Texto restaurado')),
    jsonb_build_object('table', 'tasks', 'row', jsonb_build_object('user_id', account, 'title', 'Tarefa restaurada', 'due_at', now()))
  );
  PERFORM set_config('zapflow.test_fail', 'on', true);
  BEGIN
    PERFORM public.zf_replace_backup(additions, snapshot, '{}');
    RAISE EXCEPTION 'O teste esperava uma falha na exclusão.';
  EXCEPTION WHEN SQLSTATE 'ZF001' THEN NULL;
  END;
  ASSERT EXISTS (SELECT FROM public.tasks WHERE id = old_task);
  ASSERT EXISTS (SELECT FROM public.messages WHERE id = old_message);
  ASSERT (SELECT count(*) FROM public.tasks WHERE user_id = account) = 1;
  ASSERT (SELECT count(*) FROM public.messages WHERE user_id = account) = 1;

  PERFORM set_config('zapflow.test_fail', 'off', true);
  PERFORM public.zf_replace_backup(additions, snapshot, '{}');
  ASSERT NOT EXISTS (SELECT FROM public.tasks WHERE id = old_task);
  ASSERT NOT EXISTS (SELECT FROM public.messages WHERE id = old_message);
  ASSERT (SELECT count(*) FROM public.tasks WHERE user_id = account AND title = 'Tarefa restaurada') = 1;
  ASSERT (SELECT count(*) FROM public.messages WHERE user_id = account AND title = 'Texto restaurado') = 1;
END $$;

ROLLBACK;
