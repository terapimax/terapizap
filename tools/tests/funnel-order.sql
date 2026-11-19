-- Executar em um banco local com supabase/setup.sql.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  funnel bigint;
  original bigint[];
  moved bigint[];
  saved bigint[];
BEGIN
  INSERT INTO auth.users(id) VALUES (owner_id);
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner_id)::text, true);
  INSERT INTO public.funnels(title, user_id) VALUES ('Teste de ordem', owner_id) RETURNING id INTO funnel;
  INSERT INTO public.funnel_items(user_id, funnel_id, item_id, type, delay_minutes, position)
    VALUES (owner_id, funnel, 1, 'message', 0, 1), (owner_id, funnel, 2, 'audio', 10, 1),
           (owner_id, funnel, 3, 'message', 1440, 9);
  SELECT array_agg(id ORDER BY position, id) INTO original FROM public.funnel_items WHERE funnel_id = funnel;
  moved := ARRAY[original[3], original[1], original[2]];
  PERFORM public.zf_reorder_funnel_steps(funnel, original, moved);
  PERFORM public.zf_reorder_funnel_steps(funnel, original, moved);
  SELECT array_agg(id ORDER BY position, id) INTO saved FROM public.funnel_items WHERE funnel_id = funnel;
  IF saved <> moved OR (SELECT delay_minutes FROM public.funnel_items WHERE id = moved[1]) <> 1440 THEN
    RAISE EXCEPTION 'A ordem ou a espera do passo mudou incorretamente';
  END IF;
  BEGIN
    PERFORM public.zf_reorder_funnel_steps(funnel, original, ARRAY[original[2],original[1],original[3]]);
    RAISE EXCEPTION 'Uma ordem desatualizada foi aceita';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  BEGIN
    PERFORM public.zf_reorder_funnel_steps(funnel, moved, ARRAY[moved[1],moved[1],moved[2]]);
    RAISE EXCEPTION 'Foi aceita uma lista com um passo duplicado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT array_agg(id ORDER BY position, id) FROM public.funnel_items WHERE funnel_id = funnel) <> moved THEN
    RAISE EXCEPTION 'Uma tentativa inválida alterou a ordem salva';
  END IF;
END $$;
ROLLBACK;
