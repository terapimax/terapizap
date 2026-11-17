  -- ZAPFLOW — só o Gerente (atalho). Cria apenas as tabelas agent_suggestions e agent_reports.
  -- Use se o setup.sql completo parar com erro antes de chegar aqui.

  -- Gerente (Fase 4) ---------------------------------------------------
  -- O registro também guarda o que o gerente gerou (resumo do dia, mensagens de retomada, funil).
  ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_source_check;
  ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_source_check
    CHECK (source IN ('simulator', 'copilot', 'auto', 'library', 'manager'));

  -- Sugestões de itens novos para a biblioteca: quando o agente percebe uma pergunta que a biblioteca
  -- não cobre, ele sugere (ferramenta sugerir_item_biblioteca). A sugestão cai aqui sozinha, a partir do
  -- registro (agent_runs). A mesma sugestão repetida não duplica: soma em "times".
  CREATE TABLE IF NOT EXISTS public.agent_suggestions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'texto',      -- texto | audio | imagem | video | documento
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    content TEXT,                            -- texto pronto ou roteiro do que gravar
    reason TEXT,
    lead_id BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
    times INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_suggestions_pending ON public.agent_suggestions(user_id, lower(btrim(title))) WHERE status = 'pending';

  CREATE OR REPLACE FUNCTION public.zf_collect_suggestions() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE a JSONB;
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.actions IS NOT DISTINCT FROM OLD.actions THEN RETURN NULL; END IF;
    IF NEW.source = 'library' OR jsonb_typeof(NEW.actions) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
    FOR a IN SELECT * FROM jsonb_array_elements(NEW.actions) LOOP
      CONTINUE WHEN a->>'type' IS DISTINCT FROM 'suggest_item' OR nullif(btrim(coalesce(a->>'title', '')), '') IS NULL;
      INSERT INTO agent_suggestions (user_id, kind, title, content, reason, lead_id)
      VALUES (NEW.user_id, coalesce(nullif(a->>'kind', ''), 'texto'), left(btrim(a->>'title'), 100),
              left(nullif(a->>'content', ''), 1200), left(nullif(a->>'reason', ''), 240), NEW.lead_id)
      ON CONFLICT (user_id, lower(btrim(title))) WHERE status = 'pending'
      DO UPDATE SET times = agent_suggestions.times + 1, updated_at = now(),
        content = coalesce(EXCLUDED.content, agent_suggestions.content),
        lead_id = coalesce(EXCLUDED.lead_id, agent_suggestions.lead_id);
    END LOOP;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_collect_suggestions ON public.agent_runs;
  CREATE TRIGGER zf_collect_suggestions AFTER INSERT OR UPDATE OF actions ON public.agent_runs
    FOR EACH ROW EXECUTE FUNCTION public.zf_collect_suggestions();

  -- Resumos do dia gerados pelo gerente (os 30 mais recentes por conta).
  CREATE TABLE IF NOT EXISTS public.agent_reports (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'briefing' CHECK (kind IN ('briefing')),
    content JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE OR REPLACE FUNCTION public.zf_prune_agent_reports() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  BEGIN
    DELETE FROM agent_reports
    WHERE user_id = NEW.user_id
      AND id <= (SELECT id FROM agent_reports WHERE user_id = NEW.user_id ORDER BY id DESC OFFSET 30 LIMIT 1);
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_prune_agent_reports ON public.agent_reports;
  CREATE TRIGGER zf_prune_agent_reports AFTER INSERT ON public.agent_reports
    FOR EACH ROW EXECUTE FUNCTION public.zf_prune_agent_reports();

  DO $$
  DECLARE t TEXT;
  BEGIN
    FOREACH t IN ARRAY ARRAY['agent_suggestions','agent_reports']
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "own_rows" ON public.%I', t);
      EXECUTE format('CREATE POLICY "own_rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    END LOOP;
  END $$;

  CREATE INDEX IF NOT EXISTS idx_agent_suggestions_user ON public.agent_suggestions(user_id, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_reports_user ON public.agent_reports(user_id, id DESC);

  NOTIFY pgrst, 'reload schema';
