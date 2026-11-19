-- ZapFlow 3.18. Atualização de instalações existentes pelo SQL Editor do Supabase.
-- Ajusta as permissões de arquivos e instala a restauração transacional.
BEGIN;

  -- Políticas permissivas de versões anteriores se somam às atuais.
  DROP POLICY IF EXISTS "Allow public storage access" ON storage.objects;
  DROP POLICY IF EXISTS "Public read campaign files" ON storage.objects;
  DROP POLICY IF EXISTS "Users manage own campaign files" ON storage.objects;
  DROP POLICY IF EXISTS "Users upload own files" ON storage.objects;
  DROP POLICY IF EXISTS "Users read own files" ON storage.objects;
  DROP POLICY IF EXISTS "Users delete own files" ON storage.objects;
  DROP POLICY IF EXISTS "zf_upload_own" ON storage.objects;
  DROP POLICY IF EXISTS "zf_read_own" ON storage.objects;
  DROP POLICY IF EXISTS "zf_update_own" ON storage.objects;
  DROP POLICY IF EXISTS "zf_delete_own" ON storage.objects;

  CREATE POLICY "zf_upload_own" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'campaign_files' AND auth.uid()::text = (storage.foldername(name))[1]);
  CREATE POLICY "zf_read_own" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'campaign_files' AND auth.uid()::text = (storage.foldername(name))[1]);
  CREATE POLICY "zf_update_own" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'campaign_files' AND auth.uid()::text = (storage.foldername(name))[1]);
  CREATE POLICY "zf_delete_own" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'campaign_files' AND auth.uid()::text = (storage.foldername(name))[1]);

  -- Substituição de backup. Os arquivos já foram preparados pelo painel. Todas as
  -- inclusões, vínculos e exclusões abaixo pertencem a uma só transação do Postgres.
  CREATE OR REPLACE FUNCTION public.zf_replace_backup(p_rows jsonb, p_snapshot jsonb, p_keep jsonb)
  RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  DECLARE
    uid uuid := auth.uid();
    deletion_order text[] := ARRAY['tasks','triggers','funnel_items','funnels','card_items','kanban_cards',
      'lead_tags','leads','owners','tags','kanban_columns','kanban_boards','campaign_items','campaigns',
      'catalog_items','appointments','media_library','messages'];
    ref_tables jsonb := '{"lead_id":"leads","board_id":"kanban_boards","column_id":"kanban_columns",
      "tag_id":"tags","owner_id":"owners","campaign_id":"campaigns","card_id":"kanban_cards",
      "message_id":"messages","media_id":"media_library","funnel_id":"funnels","item_id":"catalog_items"}';
    ids bigint[] := '{}'; sources text[] := '{}';
    t text; current_ids jsonb; entry jsonb; row_data jsonb; section text; obj jsonb; field text;
    dest text; ref bigint; inserted_id bigint; cols text; found_ref boolean;
  BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Sessão expirada.' USING ERRCODE = '42501'; END IF;
    IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_keep) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Backup inválido.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('zf_backup:' || uid::text, 0));
    FOR t IN SELECT jsonb_object_keys(p_snapshot) LOOP
      IF NOT (t = ANY(deletion_order)) THEN RAISE EXCEPTION 'Tabela de backup inválida.'; END IF;
      IF p_snapshot->t = '[]'::jsonb AND t = ANY(ARRAY['owners','catalog_items','campaigns','campaign_items','card_items'])
         AND to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;
      EXECUTE format('SELECT coalesce(jsonb_agg(id ORDER BY id), ''[]'') FROM public.%I WHERE user_id = $1', t)
        INTO current_ids USING uid;
      IF current_ids <> p_snapshot->t THEN
        RAISE EXCEPTION 'Seus dados mudaram durante a preparação. Abra o backup e tente novamente.' USING ERRCODE = '40001';
      END IF;
    END LOOP;
    PERFORM set_config('zapflow.no_triggers', 'on', true);
    FOR entry IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
      t := entry->>'table';
      IF t IS NULL OR NOT (p_snapshot ? t) THEN RAISE EXCEPTION 'Tabela fora do backup.'; END IF;
      IF entry->'row'->>'user_id' IS DISTINCT FROM uid::text THEN
        RAISE EXCEPTION 'A conta mudou durante a restauração.' USING ERRCODE = '42501';
      END IF;
      row_data := ((entry->'row') - 'id') || jsonb_build_object('user_id', uid);
      -- Números negativos referenciam inclusões anteriores. Ids positivos são registros
      -- reaproveitados da própria conta. As configurações dos gatilhos também guardam vínculos.
      FOREACH section IN ARRAY CASE WHEN t = 'triggers' THEN ARRAY['row','event_config','action_config'] ELSE ARRAY['row'] END LOOP
        obj := CASE WHEN section = 'row' THEN row_data ELSE row_data->section END;
        IF jsonb_typeof(obj) IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
        FOR field IN SELECT key FROM jsonb_each(obj) WHERE ref_tables ? key AND jsonb_typeof(value) = 'number' LOOP
          dest := ref_tables->>field;
          IF t = 'funnel_items' AND field = 'item_id' THEN
            dest := CASE WHEN row_data->>'type' = 'message' THEN 'messages' ELSE 'media_library' END;
          END IF;
          ref := (obj->>field)::bigint;
          IF ref < 0 THEN
            IF sources[(-ref)::int] IS DISTINCT FROM dest THEN RAISE EXCEPTION 'Vínculo de backup inválido.'; END IF;
            obj := jsonb_set(obj, ARRAY[field], to_jsonb(ids[(-ref)::int]));
          ELSE
            EXECUTE format('SELECT EXISTS(SELECT FROM public.%I WHERE id = $1 AND user_id = $2)', dest)
              INTO found_ref USING ref, uid;
            IF NOT found_ref THEN RAISE EXCEPTION 'O item vinculado mudou. Abra o backup novamente.'; END IF;
          END IF;
        END LOOP;
        IF section = 'row' THEN row_data := obj; ELSE row_data := jsonb_set(row_data, ARRAY[section], obj); END IF;
      END LOOP;
      SELECT string_agg(quote_ident(k), ', ' ORDER BY k) INTO cols FROM jsonb_object_keys(row_data) AS keys(k);
      EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) RETURNING id', t, cols)
        INTO inserted_id USING row_data;
      ids := array_append(ids, inserted_id);
      sources := array_append(sources, t);
    END LOOP;
    FOREACH t IN ARRAY deletion_order LOOP
      IF NOT (p_snapshot ? t) OR p_snapshot->t = '[]'::jsonb THEN CONTINUE; END IF;
      EXECUTE format('DELETE FROM public.%I WHERE user_id = $1
        AND id IN (SELECT value::bigint FROM jsonb_array_elements_text($2))
        AND id NOT IN (SELECT value::bigint FROM jsonb_array_elements_text($3))', t)
        USING uid, p_snapshot->t, coalesce(p_keep->t, '[]'::jsonb);
    END LOOP;
  END $$;
  REVOKE ALL ON FUNCTION public.zf_replace_backup(jsonb,jsonb,jsonb) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.zf_replace_backup(jsonb,jsonb,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
