-- ZapFlow 3.20. Resumo do dia automático: instala a reserva que evita gerar o resumo duas vezes.
BEGIN;

-- Resumo do dia automático: não há servidor, então o painel e a extensão conferem ao abrir. Para duas
-- abas não gerarem o mesmo resumo (e gastarem a chave duas vezes), a conferência reserva a vez aqui.
-- TRUE = pode gerar agora; FALSE = já existe resumo desde p_since (meia-noite local) ou outra aba está gerando.
-- A reserva vence sozinha em p_mins minutos, então uma falha não trava o dia.
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS briefing_claimed_at TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION public.zf_briefing_claim(p_since TIMESTAMPTZ, p_mins INT DEFAULT 15) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_n INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('zf_briefing:' || v_uid::text));
  IF EXISTS (SELECT 1 FROM agent_reports WHERE user_id = v_uid AND kind = 'briefing' AND created_at >= p_since) THEN RETURN FALSE; END IF;
  UPDATE ai_settings SET briefing_claimed_at = now()
  WHERE user_id = v_uid AND (briefing_claimed_at IS NULL OR briefing_claimed_at < now() - make_interval(mins => greatest(p_mins, 1)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END $$;
REVOKE ALL ON FUNCTION public.zf_briefing_claim(TIMESTAMPTZ, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zf_briefing_claim(TIMESTAMPTZ, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
