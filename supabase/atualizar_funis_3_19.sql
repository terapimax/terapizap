-- ZapFlow 3.19. Instala a função de reordenar passos de um funil.
BEGIN;

CREATE OR REPLACE FUNCTION public.zf_reorder_funnel_steps(
  p_funnel_id bigint, p_expected_ids bigint[], p_order_ids bigint[]
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  account_id uuid := auth.uid();
  current_ids bigint[];
BEGIN
  PERFORM 1 FROM public.funnels WHERE id = p_funnel_id AND user_id = account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funil indisponível para esta conta.' USING ERRCODE = '42501'; END IF;

  -- A trava do funil serializa movimentos e novas inserções. As travas dos passos
  -- protegem a leitura contra exclusões e edições concorrentes.
  SELECT coalesce(array_agg(s.id ORDER BY coalesce(s.position, 0), s.id), '{}'::bigint[]) INTO current_ids
  FROM (
    SELECT id, position FROM public.funnel_items
    WHERE funnel_id = p_funnel_id AND user_id = account_id ORDER BY id FOR UPDATE
  ) AS s;

  IF current_ids = p_order_ids THEN RETURN; END IF;
  IF current_ids IS DISTINCT FROM p_expected_ids THEN
    RAISE EXCEPTION 'Os passos mudaram em outra janela. Confira a lista atualizada e mova o passo novamente.' USING ERRCODE = '40001';
  END IF;
  IF p_order_ids IS NULL OR cardinality(p_order_ids) <> cardinality(current_ids)
     OR NOT (p_order_ids @> current_ids) THEN
    RAISE EXCEPTION 'A nova ordem deve conter cada passo do funil uma vez.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.funnel_items AS step SET position = (o.pos - 1)::integer
  FROM unnest(p_order_ids) WITH ORDINALITY AS o(id, pos)
  WHERE step.funnel_id = p_funnel_id AND step.user_id = account_id AND step.id = o.id
    AND step.position IS DISTINCT FROM (o.pos - 1)::integer;
END $$;
REVOKE ALL ON FUNCTION public.zf_reorder_funnel_steps(bigint, bigint[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zf_reorder_funnel_steps(bigint, bigint[], bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
