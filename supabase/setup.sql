  -- ============================================================
  -- ZAPFLOW — Esquema completo do banco (Supabase)
  -- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
  -- Pode ser rodado de novo sem erro (cria só o que falta e recria as regras).
  -- ============================================================

  -- 1. MENSAGENS -------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.messages (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 2. BIBLIOTECA DE MÍDIA (áudios, imagens, vídeos, documentos) --
  CREATE TABLE IF NOT EXISTS public.media_library (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    caption TEXT,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('audio', 'video', 'image', 'document')),
    mime_type TEXT,
    size BIGINT,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    is_view_once BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 3. FUNIS -----------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.funnels (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.funnel_items (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    funnel_id BIGINT NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('message', 'audio', 'midia', 'document')),
    delay_minutes INT NOT NULL DEFAULT 0,
    delay_seconds INT NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 4. LEADS, ETIQUETAS E KANBAN ---------------------------------
  -- Leads = sua base de contatos; existem sozinhos, com ou sem Kanban.
  -- Kanban = quadros -> etapas -> cards. Cada card coloca um lead numa etapa
  -- (no máximo um card por lead em cada quadro). Apagar uma etapa ou um quadro
  -- tira só os cards: os leads continuam salvos.
  CREATE TABLE IF NOT EXISTS public.leads (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    avatar TEXT,
    last_message TEXT,
    origin TEXT,
    campaign TEXT,
    status TEXT NOT NULL DEFAULT 'warm' CHECK (status IN ('hot', 'warm', 'cold')),
    notes TEXT,
    wa_id TEXT,
    last_contact_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes TEXT;
  -- wa_id = conversa do WhatsApp (ex.: 5511987654321@c.us ou 1234567890@lid). Quando o WhatsApp
  -- esconde o número (@lid), é por ele que a extensão reconhece o lead.
  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS wa_id TEXT;
  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_wa ON public.leads(user_id, wa_id) WHERE wa_id IS NOT NULL;
  -- Telefone só com dígitos e com o 55 do Brasil (mesma regra da extensão).
  -- Serve para achar o lead pelo número e impedir o mesmo número duas vezes.
  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN length(ltrim(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '0')) < 10 THEN NULL
      WHEN length(ltrim(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '0')) <= 11 THEN '55' || ltrim(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '0')
      ELSE ltrim(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '0')
    END
  ) STORED;

  CREATE TABLE IF NOT EXISTS public.tags (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6b7280',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_name ON public.tags(user_id, lower(name));
  -- etiqueta do WhatsApp Business ligada a esta (a extensão sincroniza as duas)
  ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS wa_label_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_wa_label ON public.tags(user_id, wa_label_id) WHERE wa_label_id IS NOT NULL;
  -- etiqueta que manda ignorar (ex.: "Fora", "Família"): quem tem não vira lead pelo WhatsApp e não entra no Kanban
  ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS is_blocking BOOLEAN NOT NULL DEFAULT false;

  CREATE TABLE IF NOT EXISTS public.lead_tags (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lead_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS public.kanban_boards (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.kanban_columns (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    board_id BIGINT NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#111113',
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- garante que o card fica numa etapa do mesmo quadro dele
  CREATE UNIQUE INDEX IF NOT EXISTS uq_columns_id_board ON public.kanban_columns(id, board_id);
  -- etapa de entrada: onde caem os leads novos que chegam pelo WhatsApp (uma por usuário;
  -- sem nenhuma marcada, vale a 1ª etapa do 1º quadro)
  ALTER TABLE public.kanban_columns ADD COLUMN IF NOT EXISTS is_inbox BOOLEAN NOT NULL DEFAULT false;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_columns_inbox ON public.kanban_columns(user_id) WHERE is_inbox;

  -- Valor e produto são do negócio (card), não da pessoa: o mesmo lead pode valer diferente em cada quadro.
  CREATE TABLE IF NOT EXISTS public.kanban_cards (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    board_id BIGINT NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
    column_id BIGINT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    value NUMERIC NOT NULL DEFAULT 0,
    product TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lead_id, board_id),
    FOREIGN KEY (column_id, board_id) REFERENCES public.kanban_columns(id, board_id) ON DELETE CASCADE
  );

  -- HISTÓRICO DE CONVERSAS (só se você ligar na extensão). Guarda o texto das mensagens (mídias viram
  -- "Áudio", "Foto"...), no máximo 50 por lead e por 90 dias; o resto é apagado sozinho.
  CREATE TABLE IF NOT EXISTS public.lead_messages (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    wa_msg_id TEXT NOT NULL,
    from_me BOOLEAN NOT NULL DEFAULT false,
    by_zapflow BOOLEAN NOT NULL DEFAULT false,
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT,
    at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, wa_msg_id)
  );

  -- 5. GATILHOS --------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.triggers (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event TEXT NOT NULL,   -- valores permitidos logo abaixo (triggers_event_check)
    action TEXT NOT NULL,  -- valores permitidos logo abaixo (triggers_action_check)
    event_config JSONB NOT NULL DEFAULT '{}',
    action_config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- 'keyword' = o contato escreveu uma palavra-chave (a extensão responde sozinha).
  -- event_config do keyword: { keywords: text[], match: 'contains'|'exact'|'starts', cooldown_hours: 24 (0 = toda vez, -1 = uma vez por conversa) }
  ALTER TABLE public.triggers DROP CONSTRAINT IF EXISTS triggers_event_check;
  ALTER TABLE public.triggers ADD CONSTRAINT triggers_event_check
    CHECK (event IN ('keyword', 'lead_created', 'lead_moved', 'lead_status_changed', 'tag_added', 'lead_stale', 'appointment_due', 'manual'));
  ALTER TABLE public.triggers DROP CONSTRAINT IF EXISTS triggers_action_check;
  ALTER TABLE public.triggers ADD CONSTRAINT triggers_action_check
    CHECK (action IN ('send_message', 'send_audio', 'send_media', 'send_document', 'send_funnel', 'move_lead', 'notify'));

  -- 6. AGENDA ----------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.appointments (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    contact TEXT NOT NULL,
    phone TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#d1236f',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 6b. TAREFAS (envios agendados e lembretes) -------------------
  -- kind: 'send' = a extensão envia no WhatsApp na hora marcada; 'reminder' = só lembra você.
  -- "Atrasada" não é guardada: é uma tarefa 'scheduled' cujo horário já passou.
  CREATE TABLE IF NOT EXISTS public.tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id BIGINT REFERENCES public.leads(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'reminder' CHECK (kind IN ('send', 'reminder')),
    title TEXT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    contact TEXT,
    phone TEXT,
    content_type TEXT CHECK (content_type IN ('text', 'audio', 'media', 'document', 'funnel')),
    text TEXT,
    media_id BIGINT REFERENCES public.media_library(id) ON DELETE SET NULL,
    funnel_id BIGINT REFERENCES public.funnels(id) ON DELETE SET NULL,
    file_url TEXT,
    notes TEXT,
    color TEXT NOT NULL DEFAULT '#d1236f',
    options JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled', 'done')),
    attempts INT NOT NULL DEFAULT 0,
    error TEXT,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 6c. LEADS FORA DO KANBAN (migração; roda só uma vez) -----------
  -- Antes, o lead ficava preso a uma etapa (e sumia junto com ela). Agora cada lead
  -- vira um card na etapa onde estava, com o valor e o produto que tinha.
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'column_id') THEN
      INSERT INTO public.kanban_cards (user_id, lead_id, board_id, column_id, position, value, product, created_at)
      SELECT l.user_id, l.id, c.board_id, l.column_id, l.position, coalesce(l.value, 0), l.product, l.created_at
      FROM public.leads l JOIN public.kanban_columns c ON c.id = l.column_id
      ON CONFLICT (lead_id, board_id) DO NOTHING;
      ALTER TABLE public.leads DROP COLUMN column_id;
      ALTER TABLE public.leads DROP COLUMN IF EXISTS position;
      ALTER TABLE public.leads DROP COLUMN IF EXISTS value;
      ALTER TABLE public.leads DROP COLUMN IF EXISTS product;
    END IF;
  END $$;

  -- Leads com o mesmo telefone viram um só: fica o mais antigo, que recebe os dados que
  -- faltavam, as tarefas, os cards e as etiquetas dos repetidos.
  DO $$
  DECLARE r RECORD;
  BEGIN
    FOR r IN
      SELECT d.id AS dup, k.keep
      FROM public.leads d
      JOIN (SELECT user_id, phone_key, min(id) AS keep FROM public.leads
            WHERE phone_key IS NOT NULL GROUP BY user_id, phone_key HAVING count(*) > 1) k
        ON k.user_id = d.user_id AND k.phone_key = d.phone_key AND d.id <> k.keep
    LOOP
      UPDATE public.leads k SET
        email = coalesce(k.email, d.email),
        avatar = coalesce(k.avatar, d.avatar),
        last_message = coalesce(k.last_message, d.last_message),
        origin = coalesce(k.origin, d.origin),
        campaign = coalesce(k.campaign, d.campaign),
        notes = nullif(concat_ws(E'\n', nullif(k.notes, ''), nullif(d.notes, '')), '')
      FROM public.leads d WHERE k.id = r.keep AND d.id = r.dup;
      UPDATE public.tasks SET lead_id = r.keep WHERE lead_id = r.dup;
      UPDATE public.kanban_cards c SET lead_id = r.keep
        WHERE c.lead_id = r.dup
          AND NOT EXISTS (SELECT 1 FROM public.kanban_cards x WHERE x.lead_id = r.keep AND x.board_id = c.board_id);
      INSERT INTO public.lead_tags (user_id, lead_id, tag_id)
        SELECT user_id, r.keep, tag_id FROM public.lead_tags WHERE lead_id = r.dup
        ON CONFLICT (lead_id, tag_id) DO NOTHING;
      DELETE FROM public.leads WHERE id = r.dup;
    END LOOP;
  END $$;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_phone ON public.leads(user_id, phone_key);

  -- 6d. CAPTURA DE LEADS PELO WHATSAPP ----------------------------
  -- Mesma regra do phone_key, para usar nas funções.
  CREATE OR REPLACE FUNCTION public.zf_phone_key(p TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN length(d) < 10 THEN NULL WHEN length(d) <= 11 THEN '55' || d ELSE d END
    FROM (SELECT ltrim(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '0') AS d) x
  $$;

  -- Acha o lead de uma conversa (pelo telefone ou pela conversa) e, se não existir e p_create,
  -- cria com origem WhatsApp e põe um card na etapa de entrada. Tudo numa ida ao banco: duas abas
  -- do WhatsApp abertas ao mesmo tempo não criam o lead duas vezes.
  -- p_message: prévia da mensagem recebida (vira a "última mensagem" do lead).
  -- (versão anterior tinha um parâmetro a menos; duas versões juntas confundem o Supabase)
  DROP FUNCTION IF EXISTS public.zf_capture_lead(TEXT, TEXT, TEXT, TEXT, BOOLEAN);
  -- p_wa_labels: etiquetas do WhatsApp da conversa; se uma delas for de "ignorar", o contato não vira lead.
  CREATE OR REPLACE FUNCTION public.zf_capture_lead(
    p_name TEXT, p_phone TEXT, p_wa_id TEXT, p_message TEXT DEFAULT NULL, p_create BOOLEAN DEFAULT true, p_wa_labels TEXT[] DEFAULT NULL
  ) RETURNS JSONB
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE
    v_uid UUID := auth.uid();
    v_key TEXT := zf_phone_key(p_phone);
    v_wa TEXT := nullif(trim(coalesce(p_wa_id, '')), '');
    v_msg TEXT := left(nullif(trim(coalesce(p_message, '')), ''), 280);
    v_lead BIGINT;
    v_created BOOLEAN := false;
    v_card BOOLEAN := false;
    v_col BIGINT;
    v_board BIGINT;
    v_stage TEXT;
  BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
    IF v_key IS NULL AND v_wa IS NULL THEN RETURN jsonb_build_object('lead_id', NULL); END IF;

    SELECT id INTO v_lead FROM leads
    WHERE user_id = v_uid AND ((v_key IS NOT NULL AND phone_key = v_key) OR (v_wa IS NOT NULL AND wa_id = v_wa))
    ORDER BY (phone_key IS NOT DISTINCT FROM v_key) DESC, id LIMIT 1;

    -- etiqueta de ignorar: o lead não é atualizado e o contato novo não vira lead
    IF v_lead IS NOT NULL AND EXISTS (SELECT 1 FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = v_lead AND t.is_blocking) THEN
      RETURN jsonb_build_object('lead_id', v_lead, 'blocked', true);
    END IF;
    IF v_lead IS NULL AND p_wa_labels IS NOT NULL
       AND EXISTS (SELECT 1 FROM tags WHERE user_id = v_uid AND is_blocking AND wa_label_id = ANY (p_wa_labels)) THEN
      RETURN jsonb_build_object('lead_id', NULL, 'blocked', true);
    END IF;

    IF v_lead IS NULL THEN
      IF NOT coalesce(p_create, true) THEN RETURN jsonb_build_object('lead_id', NULL); END IF;
      BEGIN
        INSERT INTO leads (user_id, name, phone, wa_id, origin, status, last_message, last_contact_at)
        VALUES (v_uid, coalesce(nullif(trim(p_name), ''), p_phone, 'Contato do WhatsApp'), CASE WHEN v_key IS NOT NULL THEN v_key END,
                v_wa, 'WhatsApp', 'warm', v_msg, CASE WHEN v_msg IS NOT NULL THEN now() END)
        RETURNING id INTO v_lead;
        v_created := true;
      EXCEPTION WHEN unique_violation THEN
        -- outra aba criou no mesmo instante: usa o dela
        SELECT id INTO v_lead FROM leads
        WHERE user_id = v_uid AND ((v_key IS NOT NULL AND phone_key = v_key) OR (v_wa IS NOT NULL AND wa_id = v_wa)) LIMIT 1;
      END;
      IF v_created THEN
        SELECT c.id, c.board_id, b.title || ' › ' || c.title INTO v_col, v_board, v_stage
        FROM kanban_columns c JOIN kanban_boards b ON b.id = c.board_id
        WHERE c.user_id = v_uid
        ORDER BY c.is_inbox DESC, b.created_at, b.id, c.position, c.id LIMIT 1;
        IF v_col IS NOT NULL THEN
          INSERT INTO kanban_cards (user_id, lead_id, board_id, column_id, position)
          VALUES (v_uid, v_lead, v_board, v_col, coalesce((SELECT max(position) + 1 FROM kanban_cards WHERE column_id = v_col), 0))
          ON CONFLICT (lead_id, board_id) DO NOTHING;
          v_card := FOUND;
        END IF;
      END IF;
    ELSE
      -- já é lead: completa a conversa/telefone que faltavam (sem roubar de outro lead) e a última mensagem
      IF v_wa IS NOT NULL THEN
        UPDATE leads SET wa_id = v_wa WHERE id = v_lead AND wa_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM leads o WHERE o.user_id = v_uid AND o.wa_id = v_wa);
      END IF;
      IF v_key IS NOT NULL THEN
        UPDATE leads SET phone = v_key WHERE id = v_lead AND phone_key IS NULL
          AND NOT EXISTS (SELECT 1 FROM leads o WHERE o.user_id = v_uid AND o.phone_key = v_key);
      END IF;
      IF v_msg IS NOT NULL THEN
        UPDATE leads SET last_message = v_msg, last_contact_at = now() WHERE id = v_lead;
      END IF;
    END IF;

    RETURN jsonb_build_object('lead_id', v_lead, 'created', v_created, 'card', v_card, 'stage', CASE WHEN v_card THEN v_stage END);
  END $$;

  -- Importa um lote de conversas do WhatsApp (a extensão manda de 200 em 200).
  -- p_labels: etiquetas do WhatsApp Business [{id, name, color}] -> viram etiquetas daqui (ligadas pelo id;
  --   se já existir uma com o mesmo nome, ela é ligada em vez de criar outra).
  -- p_chats: [{wa_id, phone, name, last_at, labels: [ids das etiquetas]}]. Quem já é lead não é duplicado:
  --   só completa conversa/telefone, último contato e etiquetas.
  -- p_column_id: etapa onde os leads NOVOS entram (null = não coloca no Kanban).
  -- p_fire: dispara os gatilhos de lead (só a sincronia de etiqueta usa; importar em lote nunca dispara)
  DROP FUNCTION IF EXISTS public.zf_import_chats(JSONB, JSONB, BIGINT);
  CREATE OR REPLACE FUNCTION public.zf_import_chats(p_chats JSONB, p_labels JSONB DEFAULT '[]', p_column_id BIGINT DEFAULT NULL, p_fire BOOLEAN DEFAULT false)
  RETURNS JSONB
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE
    v_uid UUID := auth.uid();
    v_item JSONB;
    v_lab TEXT;
    v_name TEXT;
    v_tag BIGINT;
    v_map JSONB := '{}';
    v_key TEXT;
    v_wa TEXT;
    v_at TIMESTAMPTZ;
    v_lead BIGINT;
    v_board BIGINT;
    v_pos INT := 0;
    v_created INT := 0;
    v_existing INT := 0;
    v_tagged INT := 0;
    v_cards INT := 0;
    v_skipped INT := 0;
    v_ignored INT := 0;
    v_n INT;
  BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
    IF NOT coalesce(p_fire, false) THEN PERFORM set_config('zapflow.no_triggers', 'on', true); END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_labels, '[]'::jsonb)) LOOP
      v_lab := nullif(v_item->>'id', '');
      v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
      CONTINUE WHEN v_lab IS NULL OR v_name IS NULL;
      SELECT id INTO v_tag FROM tags WHERE user_id = v_uid AND wa_label_id = v_lab;
      IF v_tag IS NULL THEN
        SELECT id INTO v_tag FROM tags WHERE user_id = v_uid AND lower(name) = lower(v_name) LIMIT 1;
        IF v_tag IS NOT NULL THEN
          UPDATE tags SET wa_label_id = v_lab WHERE id = v_tag AND wa_label_id IS NULL;
        ELSE
          INSERT INTO tags (user_id, name, color, wa_label_id)
          VALUES (v_uid, v_name, coalesce(nullif(v_item->>'color', ''), '#6b7280'), v_lab)
          RETURNING id INTO v_tag;
        END IF;
      END IF;
      v_map := v_map || jsonb_build_object(v_lab, v_tag);
    END LOOP;

    IF p_column_id IS NOT NULL THEN
      SELECT board_id INTO v_board FROM kanban_columns WHERE id = p_column_id AND user_id = v_uid;
      SELECT coalesce(max(position) + 1, 0) INTO v_pos FROM kanban_cards WHERE column_id = p_column_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_chats, '[]'::jsonb)) LOOP
      v_key := zf_phone_key(v_item->>'phone');
      v_wa := nullif(trim(coalesce(v_item->>'wa_id', '')), '');
      v_at := nullif(v_item->>'last_at', '')::timestamptz;
      IF v_key IS NULL AND v_wa IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

      SELECT id INTO v_lead FROM leads
      WHERE user_id = v_uid AND ((v_key IS NOT NULL AND phone_key = v_key) OR (v_wa IS NOT NULL AND wa_id = v_wa))
      ORDER BY (phone_key IS NOT DISTINCT FROM v_key) DESC, id LIMIT 1;

      -- conversa nova com etiqueta de ignorar (ex.: "Fora") não vira lead
      IF v_lead IS NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(v_item->'labels', '[]'::jsonb)) x(lab)
        JOIN tags t ON t.user_id = v_uid AND t.is_blocking AND t.wa_label_id = x.lab) THEN
        v_ignored := v_ignored + 1;
        CONTINUE;
      END IF;

      IF v_lead IS NULL THEN
        BEGIN
          INSERT INTO leads (user_id, name, phone, wa_id, origin, status, last_contact_at)
          VALUES (v_uid, coalesce(nullif(trim(v_item->>'name'), ''), v_key, 'Contato do WhatsApp'), v_key, v_wa, 'WhatsApp', 'warm', v_at)
          RETURNING id INTO v_lead;
        EXCEPTION WHEN unique_violation THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END;
        v_created := v_created + 1;
        IF v_board IS NOT NULL THEN
          INSERT INTO kanban_cards (user_id, lead_id, board_id, column_id, position)
          VALUES (v_uid, v_lead, v_board, p_column_id, v_pos)
          ON CONFLICT (lead_id, board_id) DO NOTHING;
          IF FOUND THEN v_cards := v_cards + 1; v_pos := v_pos + 1; END IF;
        END IF;
      ELSE
        v_existing := v_existing + 1;
        IF v_wa IS NOT NULL THEN
          UPDATE leads SET wa_id = v_wa WHERE id = v_lead AND wa_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM leads o WHERE o.user_id = v_uid AND o.wa_id = v_wa);
        END IF;
        IF v_key IS NOT NULL THEN
          UPDATE leads SET phone = v_key WHERE id = v_lead AND phone_key IS NULL
            AND NOT EXISTS (SELECT 1 FROM leads o WHERE o.user_id = v_uid AND o.phone_key = v_key);
        END IF;
        IF v_at IS NOT NULL THEN
          UPDATE leads SET last_contact_at = v_at WHERE id = v_lead AND (last_contact_at IS NULL OR last_contact_at < v_at);
        END IF;
      END IF;

      FOR v_lab IN SELECT jsonb_array_elements_text(coalesce(v_item->'labels', '[]'::jsonb)) LOOP
        IF v_map ? v_lab THEN
          INSERT INTO lead_tags (user_id, lead_id, tag_id) VALUES (v_uid, v_lead, (v_map->>v_lab)::bigint)
          ON CONFLICT (lead_id, tag_id) DO NOTHING;
          GET DIAGNOSTICS v_n = ROW_COUNT;
          v_tagged := v_tagged + v_n;
        END IF;
      END LOOP;
    END LOOP;

    RETURN jsonb_build_object('created', v_created, 'existing', v_existing, 'tagged', v_tagged, 'cards', v_cards, 'skipped', v_skipped, 'ignored', v_ignored);
  END $$;

  -- Tira a etiqueta (ligada à do WhatsApp) do lead da conversa. Devolve quantas tirou.
  CREATE OR REPLACE FUNCTION public.zf_untag_chat(p_phone TEXT, p_wa_id TEXT, p_wa_label_id TEXT)
  RETURNS INT
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE
    v_uid UUID := auth.uid();
    v_key TEXT := zf_phone_key(p_phone);
    v_n INT;
  BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
    DELETE FROM lead_tags lt USING leads l, tags t
    WHERE lt.lead_id = l.id AND lt.tag_id = t.id
      AND l.user_id = v_uid AND t.user_id = v_uid AND t.wa_label_id = p_wa_label_id
      AND ((v_key IS NOT NULL AND l.phone_key = v_key) OR (nullif(p_wa_id, '') IS NOT NULL AND l.wa_id = p_wa_id));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
  END $$;

  -- 6e. ETIQUETAS DE IGNORAR -----------------------------------------
  -- Lead ganhou uma etiqueta de ignorar: sai do Kanban (o lead continua salvo, para nunca mais ser capturado).
  CREATE OR REPLACE FUNCTION public.zf_blocking_tag_applied() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM tags WHERE id = NEW.tag_id AND is_blocking) THEN
      DELETE FROM kanban_cards WHERE lead_id = NEW.lead_id;
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS zf_blocking_tag_applied ON public.lead_tags;
  CREATE TRIGGER zf_blocking_tag_applied AFTER INSERT ON public.lead_tags
    FOR EACH ROW EXECUTE FUNCTION public.zf_blocking_tag_applied();

  -- Etiqueta virou "de ignorar": quem já tem sai do Kanban.
  CREATE OR REPLACE FUNCTION public.zf_tag_became_blocking() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  BEGIN
    IF NEW.is_blocking AND NOT OLD.is_blocking THEN
      DELETE FROM kanban_cards c USING lead_tags lt WHERE lt.tag_id = NEW.id AND c.lead_id = lt.lead_id;
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS zf_tag_became_blocking ON public.tags;
  CREATE TRIGGER zf_tag_became_blocking AFTER UPDATE OF is_blocking ON public.tags
    FOR EACH ROW EXECUTE FUNCTION public.zf_tag_became_blocking();

  -- Não deixa pôr no Kanban quem tem etiqueta de ignorar.
  CREATE OR REPLACE FUNCTION public.zf_block_cards() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE v_tag TEXT;
  BEGIN
    SELECT t.name INTO v_tag FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id
    WHERE lt.lead_id = NEW.lead_id AND t.is_blocking LIMIT 1;
    IF v_tag IS NOT NULL THEN
      RAISE EXCEPTION 'Este lead tem a etiqueta "%", que manda ignorar: ele não entra no Kanban.', v_tag;
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS zf_block_cards ON public.kanban_cards;
  CREATE TRIGGER zf_block_cards BEFORE INSERT ON public.kanban_cards
    FOR EACH ROW EXECUTE FUNCTION public.zf_block_cards();

  -- 6f. HISTÓRICO DE CONVERSAS ----------------------------------------
  -- A extensão manda as mensagens de uma conversa: [{id, from_me, by_zapflow, kind, body, t (ms)}].
  -- Só grava se a conversa for de um lead (sem etiqueta de ignorar). Não duplica (id da mensagem) e
  -- mantém só as últimas p_keep mensagens do lead, dos últimos p_days dias.
  CREATE OR REPLACE FUNCTION public.zf_log_messages(p_phone TEXT, p_wa_id TEXT, p_msgs JSONB, p_keep INT DEFAULT 50, p_days INT DEFAULT 90)
  RETURNS JSONB
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE
    v_uid UUID := auth.uid();
    v_key TEXT := zf_phone_key(p_phone);
    v_wa TEXT := nullif(trim(coalesce(p_wa_id, '')), '');
    v_lead BIGINT;
    v_n INT;
  BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
    IF v_key IS NULL AND v_wa IS NULL THEN RETURN jsonb_build_object('lead_id', NULL, 'saved', 0); END IF;
    SELECT id INTO v_lead FROM leads
    WHERE user_id = v_uid AND ((v_key IS NOT NULL AND phone_key = v_key) OR (v_wa IS NOT NULL AND wa_id = v_wa))
    ORDER BY (phone_key IS NOT DISTINCT FROM v_key) DESC, id LIMIT 1;
    IF v_lead IS NULL THEN RETURN jsonb_build_object('lead_id', NULL, 'saved', 0); END IF;
    IF EXISTS (SELECT 1 FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = v_lead AND t.is_blocking) THEN
      RETURN jsonb_build_object('lead_id', v_lead, 'saved', 0, 'blocked', true);
    END IF;

    INSERT INTO lead_messages (user_id, lead_id, wa_msg_id, from_me, by_zapflow, kind, body, at)
    SELECT v_uid, v_lead, m->>'id', coalesce((m->>'from_me')::boolean, false), coalesce((m->>'by_zapflow')::boolean, false),
           coalesce(nullif(m->>'kind', ''), 'text'), left(nullif(m->>'body', ''), 1000),
           to_timestamp(coalesce((m->>'t')::double precision, extract(epoch FROM now()) * 1000) / 1000)
    FROM jsonb_array_elements(coalesce(p_msgs, '[]'::jsonb)) m
    WHERE coalesce(m->>'id', '') <> ''
      AND to_timestamp(coalesce((m->>'t')::double precision, extract(epoch FROM now()) * 1000) / 1000) > now() - make_interval(days => p_days)
    ON CONFLICT (user_id, wa_msg_id) DO UPDATE SET by_zapflow = lead_messages.by_zapflow OR EXCLUDED.by_zapflow;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    DELETE FROM lead_messages WHERE lead_id = v_lead AND (
      at < now() - make_interval(days => p_days)
      OR id IN (SELECT id FROM lead_messages WHERE lead_id = v_lead ORDER BY at DESC, id DESC OFFSET greatest(p_keep, 1))
    );
    RETURN jsonb_build_object('lead_id', v_lead, 'saved', v_n);
  END $$;

  -- 6g. GATILHOS DE LEAD ---------------------------------------------
  -- Quando um lead é criado, entra numa etapa, muda de temperatura ou ganha uma etiqueta, os gatilhos
  -- ativos que combinam fazem a ação:
  --   envios (mensagem, áudio, mídia, documento, funil) -> viram tarefas de envio; a extensão envia
  --     com o WhatsApp Web aberto (com "digitando…", cancela se o contato responder antes);
  --   mover de etapa -> aqui mesmo; me avisar -> lembrete em Tarefas (o painel avisa na hora).
  -- Proteções: só ações com UM lead disparam (importar, restaurar backup e ações em massa não);
  -- cada gatilho dispara uma vez por lead (a não ser que diga "toda vez"); no máximo 30 envios por
  -- gatilho a cada 10 min; leads com etiqueta de ignorar nunca disparam; correntes de "mover" param
  -- depois de 3 níveis.
  CREATE TABLE IF NOT EXISTS public.trigger_fires (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    trigger_id BIGINT NOT NULL REFERENCES public.triggers(id) ON DELETE CASCADE,
    lead_id BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    result TEXT NOT NULL,
    task_id BIGINT REFERENCES public.tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE OR REPLACE FUNCTION public.zf_fire_lead_event(p_event TEXT, p_lead BIGINT, p_ctx JSONB DEFAULT '{}')
  RETURNS INT
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE
    v_lead leads%ROWTYPE;
    t RECORD;
    v_cfg JSONB;
    v_act JSONB;
    v_result TEXT;
    v_task BIGINT;
    v_type TEXT;
    v_text TEXT;
    v_media BIGINT;
    v_funnel BIGINT;
    v_col BIGINT;
    v_board BIGINT;
    v_card BIGINT;
    v_recent INT;
    v_n INT := 0;
  BEGIN
    IF current_setting('zapflow.no_triggers', true) = 'on' OR pg_trigger_depth() > 3 THEN RETURN 0; END IF;
    SELECT * INTO v_lead FROM leads WHERE id = p_lead;
    IF NOT FOUND THEN RETURN 0; END IF;
    IF EXISTS (SELECT 1 FROM lead_tags lt JOIN tags g ON g.id = lt.tag_id WHERE lt.lead_id = p_lead AND g.is_blocking) THEN RETURN 0; END IF;

    FOR t IN SELECT * FROM triggers WHERE user_id = v_lead.user_id AND is_active AND event = p_event ORDER BY id LOOP
      v_cfg := coalesce(t.event_config, '{}'::jsonb);
      v_act := coalesce(t.action_config, '{}'::jsonb);
      -- 'lead_stale' vem sempre de zf_check_stale, que já escolheu o gatilho e conferiu o prazo
      CONTINUE WHEN p_ctx ? 'trigger_id' AND t.id::text <> p_ctx->>'trigger_id';
      CONTINUE WHEN p_event = 'lead_stale' AND NOT (p_ctx ? 'trigger_id');
      -- condições do gatilho (vazio = qualquer)
      CONTINUE WHEN p_event = 'lead_moved' AND nullif(v_cfg->>'column_id', '') IS NOT NULL AND v_cfg->>'column_id' <> coalesce(p_ctx->>'column_id', '');
      CONTINUE WHEN p_event = 'lead_status_changed' AND nullif(v_cfg->>'status', '') IS NOT NULL AND v_cfg->>'status' <> coalesce(p_ctx->>'status', '');
      CONTINUE WHEN p_event = 'tag_added' AND nullif(v_cfg->>'tag_id', '') IS NOT NULL AND v_cfg->>'tag_id' <> coalesce(p_ctx->>'tag_id', '');
      CONTINUE WHEN p_event = 'lead_created' AND nullif(v_cfg->>'origin', '') IS NOT NULL AND v_cfg->>'origin' <> coalesce(v_lead.origin, '');
      -- uma vez por lead, a não ser que o gatilho diga "toda vez"
      CONTINUE WHEN p_event <> 'lead_stale' AND coalesce((v_cfg->>'repeat')::boolean, false) = false
        AND EXISTS (SELECT 1 FROM trigger_fires f WHERE f.trigger_id = t.id AND f.lead_id = p_lead);

      v_result := NULL; v_task := NULL; v_text := NULL; v_media := NULL; v_funnel := NULL;
      IF t.action IN ('send_message', 'send_audio', 'send_media', 'send_document', 'send_funnel') THEN
        SELECT count(*) INTO v_recent FROM trigger_fires f
        WHERE f.trigger_id = t.id AND f.task_id IS NOT NULL AND f.created_at > now() - interval '10 minutes';
        IF v_lead.phone_key IS NULL AND v_lead.wa_id IS NULL THEN
          v_result := 'lead sem WhatsApp';
        ELSIF v_recent >= 30 THEN
          v_result := 'limite de segurança: 30 envios em 10 minutos';
        ELSE
          IF t.action = 'send_message' THEN
            v_type := 'text';
            SELECT content INTO v_text FROM messages WHERE id = nullif(v_act->>'message_id', '')::bigint AND user_id = v_lead.user_id;
            IF coalesce(v_text, '') = '' THEN v_result := 'mensagem apagada'; END IF;
          ELSIF t.action = 'send_funnel' THEN
            v_type := 'funnel';
            SELECT id INTO v_funnel FROM funnels WHERE id = nullif(v_act->>'funnel_id', '')::bigint AND user_id = v_lead.user_id;
            IF v_funnel IS NULL THEN v_result := 'funil apagado'; END IF;
          ELSE
            v_type := CASE t.action WHEN 'send_audio' THEN 'audio' WHEN 'send_document' THEN 'document' ELSE 'media' END;
            SELECT id INTO v_media FROM media_library WHERE id = nullif(v_act->>'media_id', '')::bigint AND user_id = v_lead.user_id;
            IF v_media IS NULL THEN v_result := 'arquivo apagado'; END IF;
          END IF;
          IF v_result IS NULL THEN
            INSERT INTO tasks (user_id, lead_id, kind, title, due_at, contact, phone, content_type, text, media_id, funnel_id, color, options)
            VALUES (v_lead.user_id, p_lead, 'send', 'Gatilho: ' || t.title,
                    now() + make_interval(mins => greatest(coalesce(nullif(v_act->>'delay_minutes', '')::int, 0), 0)),
                    v_lead.name, v_lead.phone, v_type, v_text, v_media, v_funnel, '#d1236f',
                    jsonb_strip_nulls(jsonb_build_object('from_trigger', t.id, 'chat_id', v_lead.wa_id, 'humanize', false, 'cancel_on_reply', true)))
            RETURNING id INTO v_task;
            v_result := 'envio agendado';
          END IF;
        END IF;
      ELSIF t.action = 'move_lead' THEN
        SELECT id, board_id INTO v_col, v_board FROM kanban_columns WHERE id = nullif(v_act->>'column_id', '')::bigint AND user_id = v_lead.user_id;
        IF v_col IS NULL THEN
          v_result := 'etapa apagada';
        ELSE
          SELECT id INTO v_card FROM kanban_cards WHERE lead_id = p_lead AND board_id = v_board;
          IF v_card IS NULL THEN
            INSERT INTO kanban_cards (user_id, lead_id, board_id, column_id, position)
            VALUES (v_lead.user_id, p_lead, v_board, v_col, coalesce((SELECT max(position) + 1 FROM kanban_cards WHERE column_id = v_col), 0));
          ELSE
            UPDATE kanban_cards SET column_id = v_col, position = coalesce((SELECT max(position) + 1 FROM kanban_cards WHERE column_id = v_col), 0)
            WHERE id = v_card AND column_id <> v_col;
          END IF;
          v_result := 'movido';
        END IF;
      ELSIF t.action = 'notify' THEN
        INSERT INTO tasks (user_id, lead_id, kind, title, due_at, contact, phone, color, options)
        VALUES (v_lead.user_id, p_lead, 'reminder', 'Gatilho “' || t.title || '”: ' || v_lead.name, now(), v_lead.name, v_lead.phone, '#d1236f',
                jsonb_build_object('from_trigger', t.id))
        RETURNING id INTO v_task;
        v_result := 'aviso criado';
      ELSE
        v_result := 'ação não suportada';
      END IF;

      INSERT INTO trigger_fires (user_id, trigger_id, lead_id, event, result, task_id)
      VALUES (v_lead.user_id, t.id, p_lead, p_event, v_result, v_task);
      v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
  END $$;

  -- Quem avisa: só quando UMA linha muda no comando (ações em massa e importações não disparam).
  CREATE OR REPLACE FUNCTION public.zf_after_leads_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE v_id BIGINT;
  BEGIN
    IF (SELECT count(*) FROM zf_new) = 1 THEN
      SELECT id INTO v_id FROM zf_new;
      PERFORM zf_fire_lead_event('lead_created', v_id, '{}'::jsonb);
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_after_leads_insert ON public.leads;
  CREATE TRIGGER zf_after_leads_insert AFTER INSERT ON public.leads
    REFERENCING NEW TABLE AS zf_new FOR EACH STATEMENT EXECUTE FUNCTION public.zf_after_leads_insert();

  CREATE OR REPLACE FUNCTION public.zf_after_lead_status() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM zf_fire_lead_event('lead_status_changed', NEW.id, jsonb_build_object('status', NEW.status));
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_after_lead_status ON public.leads;
  CREATE TRIGGER zf_after_lead_status AFTER UPDATE OF status ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.zf_after_lead_status();

  CREATE OR REPLACE FUNCTION public.zf_after_cards_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE r RECORD;
  BEGIN
    IF (SELECT count(*) FROM zf_new) = 1 THEN
      SELECT lead_id, column_id, board_id INTO r FROM zf_new;
      PERFORM zf_fire_lead_event('lead_moved', r.lead_id, jsonb_build_object('column_id', r.column_id, 'board_id', r.board_id));
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_after_cards_insert ON public.kanban_cards;
  CREATE TRIGGER zf_after_cards_insert AFTER INSERT ON public.kanban_cards
    REFERENCING NEW TABLE AS zf_new FOR EACH STATEMENT EXECUTE FUNCTION public.zf_after_cards_insert();

  -- Arrastar no Kanban grava a posição de vários cards, mas só um muda de etapa: é ele que conta.
  CREATE OR REPLACE FUNCTION public.zf_after_cards_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE r RECORD; v_n INT;
  BEGIN
    SELECT count(*) INTO v_n FROM zf_new n JOIN zf_old o ON o.id = n.id WHERE n.column_id IS DISTINCT FROM o.column_id;
    IF v_n = 1 THEN
      SELECT n.lead_id, n.column_id, n.board_id INTO r FROM zf_new n JOIN zf_old o ON o.id = n.id WHERE n.column_id IS DISTINCT FROM o.column_id;
      PERFORM zf_fire_lead_event('lead_moved', r.lead_id, jsonb_build_object('column_id', r.column_id, 'board_id', r.board_id));
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_after_cards_update ON public.kanban_cards;
  CREATE TRIGGER zf_after_cards_update AFTER UPDATE ON public.kanban_cards
    REFERENCING OLD TABLE AS zf_old NEW TABLE AS zf_new FOR EACH STATEMENT EXECUTE FUNCTION public.zf_after_cards_update();

  CREATE OR REPLACE FUNCTION public.zf_after_tags_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE r RECORD;
  BEGIN
    IF (SELECT count(*) FROM zf_new) = 1 THEN
      SELECT lead_id, tag_id INTO r FROM zf_new;
      PERFORM zf_fire_lead_event('tag_added', r.lead_id, jsonb_build_object('tag_id', r.tag_id));
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_after_tags_insert ON public.lead_tags;
  CREATE TRIGGER zf_after_tags_insert AFTER INSERT ON public.lead_tags
    REFERENCING NEW TABLE AS zf_new FOR EACH STATEMENT EXECUTE FUNCTION public.zf_after_tags_insert();

  -- 6h. RELATÓRIOS DO FUNIL ---------------------------------------
  -- Etapa de resultado: "won" = venda fechada, "lost" = perdido (marcado no Kanban).
  ALTER TABLE public.kanban_columns ADD COLUMN IF NOT EXISTS outcome TEXT;
  ALTER TABLE public.kanban_columns DROP CONSTRAINT IF EXISTS kanban_columns_outcome_check;
  ALTER TABLE public.kanban_columns ADD CONSTRAINT kanban_columns_outcome_check CHECK (outcome IN ('won', 'lost'));

  -- Histórico de etapas: uma linha cada vez que um card entra no quadro, muda de etapa ou sai dele.
  -- É o que permite medir conversão por período e tempo em cada etapa. As etapas não têm chave
  -- estrangeira de propósito: apagar uma etapa não apaga o histórico de quem passou por ela.
  -- seeded = linha criada para um card que já existia (ou veio de um backup): não se sabe quando ele
  -- entrou na etapa, então ele não conta no tempo por etapa.
  CREATE TABLE IF NOT EXISTS public.kanban_card_moves (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id BIGINT,
    lead_id BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    board_id BIGINT NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
    from_column_id BIGINT,
    to_column_id BIGINT,
    value NUMERIC NOT NULL DEFAULT 0,
    seeded BOOLEAN NOT NULL DEFAULT false,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE OR REPLACE FUNCTION public.zf_log_card_move() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO kanban_card_moves (user_id, card_id, lead_id, board_id, from_column_id, to_column_id, value, seeded, at)
      VALUES (NEW.user_id, NEW.id, NEW.lead_id, NEW.board_id, NULL, NEW.column_id, NEW.value,
              NEW.created_at < now() - interval '1 minute', least(NEW.created_at, now()));
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
        INSERT INTO kanban_card_moves (user_id, card_id, lead_id, board_id, from_column_id, to_column_id, value)
        VALUES (NEW.user_id, NEW.id, NEW.lead_id, NEW.board_id, OLD.column_id, NEW.column_id, NEW.value);
      END IF;
    ELSE
      -- saiu do quadro; se foi o lead ou o quadro que foi apagado, não há o que guardar
      IF EXISTS (SELECT 1 FROM leads WHERE id = OLD.lead_id) AND EXISTS (SELECT 1 FROM kanban_boards WHERE id = OLD.board_id) THEN
        INSERT INTO kanban_card_moves (user_id, card_id, lead_id, board_id, from_column_id, to_column_id, value)
        VALUES (OLD.user_id, OLD.id, OLD.lead_id, OLD.board_id, OLD.column_id, NULL, OLD.value);
      END IF;
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_card_moves ON public.kanban_cards;
  CREATE TRIGGER zf_card_moves AFTER INSERT OR UPDATE OF column_id OR DELETE ON public.kanban_cards
    FOR EACH ROW EXECUTE FUNCTION public.zf_log_card_move();

  -- cards que já existiam: ponto de partida do histórico (uma vez só)
  INSERT INTO public.kanban_card_moves (user_id, card_id, lead_id, board_id, to_column_id, value, seeded, at)
  SELECT c.user_id, c.id, c.lead_id, c.board_id, c.column_id, c.value, true, c.created_at
  FROM public.kanban_cards c
  WHERE NOT EXISTS (SELECT 1 FROM public.kanban_card_moves m WHERE m.card_id = c.id);

  -- 6i. LEAD PARADO NUMA ETAPA (gatilho 'lead_stale') --------------
  -- event_config: { column_id, days, no_reply }. Quem confere é esta função, chamada de tempos em
  -- tempos pelo painel e pela extensão (não há servidor rodando sozinho). Dispara uma vez por
  -- passagem do lead pela etapa. O prazo conta da entrada na etapa ou da criação do gatilho, o que
  -- for mais recente: criar o gatilho não dispara de uma vez para todo mundo que já estava parado.
  CREATE OR REPLACE FUNCTION public.zf_check_stale() RETURNS INT
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE
    t RECORD;
    r RECORD;
    v_col BIGINT;
    v_wait INTERVAL;
    v_n INT := 0;
  BEGIN
    IF auth.uid() IS NULL THEN RETURN 0; END IF;
    -- painel e extensão podem chamar ao mesmo tempo: um espera o outro
    PERFORM pg_advisory_xact_lock(hashtext('zf_stale:' || auth.uid()::text));
    FOR t IN SELECT * FROM triggers WHERE user_id = auth.uid() AND is_active AND event = 'lead_stale' ORDER BY id LOOP
      v_col := nullif(t.event_config->>'column_id', '')::bigint;
      CONTINUE WHEN v_col IS NULL;
      v_wait := make_interval(secs => greatest(coalesce(nullif(t.event_config->>'days', '')::numeric, 3), 0.001) * 86400);
      FOR r IN
        SELECT c.lead_id, c.board_id
        FROM kanban_cards c
        JOIN leads l ON l.id = c.lead_id
        CROSS JOIN LATERAL (
          SELECT greatest(coalesce((SELECT max(m.at) FROM kanban_card_moves m WHERE m.card_id = c.id AND m.to_column_id = c.column_id), c.created_at), t.created_at) AS entered
        ) e
        WHERE c.user_id = auth.uid() AND c.column_id = v_col
          AND e.entered <= now() - v_wait
          AND (coalesce((t.event_config->>'no_reply')::boolean, false) = false OR l.last_contact_at IS NULL OR l.last_contact_at <= now() - v_wait)
          AND NOT EXISTS (SELECT 1 FROM trigger_fires f WHERE f.trigger_id = t.id AND f.lead_id = c.lead_id AND f.created_at >= e.entered)
        ORDER BY e.entered
        LIMIT 50
      LOOP
        v_n := v_n + zf_fire_lead_event('lead_stale', r.lead_id, jsonb_build_object('column_id', v_col, 'board_id', r.board_id, 'trigger_id', t.id));
      END LOOP;
    END LOOP;
    RETURN v_n;
  END $$;

  -- 6j. RESPONSÁVEIS (quem atende cada lead) -----------------------
  -- Pessoas da equipe dentro da mesma conta. Quem está "no rodízio" recebe os leads novos, um de
  -- cada vez (sempre quem está há mais tempo sem receber; quem entra no rodízio depois recebe primeiro até igualar). Sem ninguém no rodízio, nada é distribuído.
  CREATE TABLE IF NOT EXISTS public.owners (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#1d4ed8',
    in_rotation BOOLEAN NOT NULL DEFAULT true,
    last_assigned_at TIMESTAMPTZ,
    assign_seq BIGINT NOT NULL DEFAULT 0,  -- ordem do rodízio: recebe quem tem o menor
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_owners_name ON public.owners(user_id, lower(name));
  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES public.owners(id) ON DELETE SET NULL;

  CREATE OR REPLACE FUNCTION public.zf_assign_owner() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE v_owner BIGINT;
  BEGIN
    -- lead com data antiga = veio de um backup: fica como estava
    IF NEW.owner_id IS NULL AND NEW.created_at >= now() - interval '1 minute' THEN
      SELECT id INTO v_owner FROM owners WHERE user_id = NEW.user_id AND in_rotation
      ORDER BY assign_seq, id LIMIT 1 FOR UPDATE;
      IF v_owner IS NOT NULL THEN
        NEW.owner_id := v_owner;
        UPDATE owners SET last_assigned_at = now(),
          assign_seq = (SELECT coalesce(max(assign_seq), 0) + 1 FROM owners WHERE user_id = NEW.user_id)
        WHERE id = v_owner;
      END IF;
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS zf_assign_owner ON public.leads;
  CREATE TRIGGER zf_assign_owner BEFORE INSERT ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.zf_assign_owner();

  -- 6k. MARCA PRÓPRIA (white label) ------------------------------
  -- Uma linha por conta: nome, logotipo horizontal, ícone quadrado (menu recolhido, extensão e aba
  -- do navegador) e domínio próprio. O painel e a extensão leem daqui, então a marca é a mesma nos dois.
  CREATE TABLE IF NOT EXISTS public.branding (
    user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    logo_url TEXT,        -- logotipo horizontal (substitui ícone + nome)
    icon_url TEXT,        -- ícone quadrado
    custom_domain TEXT,   -- ex.: painel.suaempresa.com.br (sem https://)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.branding DROP CONSTRAINT IF EXISTS branding_domain_format;
  ALTER TABLE public.branding ADD CONSTRAINT branding_domain_format
    CHECK (custom_domain IS NULL OR custom_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');
  -- um domínio só pode ser de uma conta
  CREATE UNIQUE INDEX IF NOT EXISTS uq_branding_domain ON public.branding(custom_domain) WHERE custom_domain IS NOT NULL;
  -- símbolo vetorial do quadradinho (bolt, heart, star… ou letter = inicial; vazio = raio)
  -- e cor da marca no lugar do rosa (#rrggbb; vazio = rosa padrão)
  ALTER TABLE public.branding ADD COLUMN IF NOT EXISTS mark TEXT;
  ALTER TABLE public.branding ADD COLUMN IF NOT EXISTS accent TEXT;
  ALTER TABLE public.branding DROP CONSTRAINT IF EXISTS branding_mark_format;
  ALTER TABLE public.branding ADD CONSTRAINT branding_mark_format CHECK (mark IS NULL OR mark ~ '^[a-z]{1,20}$');
  ALTER TABLE public.branding DROP CONSTRAINT IF EXISTS branding_accent_format;
  ALTER TABLE public.branding ADD CONSTRAINT branding_accent_format CHECK (accent IS NULL OR accent ~ '^#[0-9a-f]{6}$');

  -- A tela de login (ainda sem ninguém logado) pergunta "de quem é este endereço?" e recebe só
  -- o nome, os logotipos, o símbolo e a cor da conta dona do domínio. Nada mais sai daqui.
  -- (DROP antes: as colunas devolvidas mudaram, e o CREATE OR REPLACE não troca o formato.)
  DROP FUNCTION IF EXISTS public.zf_brand_for_host(TEXT);
  CREATE FUNCTION public.zf_brand_for_host(p_host TEXT)
  RETURNS TABLE (name TEXT, logo_url TEXT, icon_url TEXT, mark TEXT, accent TEXT)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT b.name, b.logo_url, b.icon_url, b.mark, b.accent FROM branding b
    WHERE b.custom_domain = lower(split_part(coalesce(p_host, ''), ':', 1))
    LIMIT 1
  $$;
  REVOKE ALL ON FUNCTION public.zf_brand_for_host(TEXT) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.zf_brand_for_host(TEXT) TO anon, authenticated;

  -- 6l. PRODUTOS, SERVIÇOS E CAMPANHAS ----------------------------
  -- Catálogo: o que você vende (produto) ou faz (serviço). O card do Kanban escolhe itens daqui,
  -- com quantidade e preço negociado (o preço fica guardado no card: mudar o catálogo depois não
  -- muda negócios antigos). Campanha: de onde o lead veio (ex.: "Black Friday", "Anúncio Instagram").
  CREATE TABLE IF NOT EXISTS public.catalog_items (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'service')),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    description TEXT,
    category TEXT,
    price NUMERIC NOT NULL DEFAULT 0 CHECK (price >= 0),
    -- fixed = preço fechado; from = "a partir de"; quote = sob consulta (entra no card com valor 0)
    price_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (price_mode IN ('fixed', 'from', 'quote')),
    duration_min INT CHECK (duration_min IS NULL OR duration_min > 0),  -- serviços: duração do atendimento
    is_active BOOLEAN NOT NULL DEFAULT true,                           -- arquivado = some dos seletores
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_name ON public.catalog_items(user_id, lower(btrim(name)));
  CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_id_user ON public.catalog_items(id, user_id);

  CREATE TABLE IF NOT EXISTS public.campaigns (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    channel TEXT,          -- Instagram, Google, Indicação... (mesma lista da origem do lead)
    starts_on DATE,
    ends_on DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT campaigns_period CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_name ON public.campaigns(user_id, lower(btrim(name)));
  CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_id_user ON public.campaigns(id, user_id);

  -- Itens que a campanha oferece (aparecem primeiro no card de quem veio por ela).
  CREATE TABLE IF NOT EXISTS public.campaign_items (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    campaign_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, item_id),
    FOREIGN KEY (campaign_id, user_id) REFERENCES public.campaigns(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id, user_id) REFERENCES public.catalog_items(id, user_id) ON DELETE CASCADE
  );

  -- Itens de cada card. Nome e preço são copiados na hora: apagar o item do catálogo não apaga o negócio.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_cards_id_user ON public.kanban_cards(id, user_id);
  CREATE TABLE IF NOT EXISTS public.card_items (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id BIGINT NOT NULL,
    item_id BIGINT,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (card_id, user_id) REFERENCES public.kanban_cards(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id, user_id) REFERENCES public.catalog_items(id, user_id) ON DELETE SET NULL (item_id)
  );

  -- Campanha do lead. O texto antigo (leads.campaign) continua e é mantido igual ao nome da campanha,
  -- para a extensão, a importação de planilha e backups antigos continuarem funcionando.
  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS campaign_id BIGINT;
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_campaign_fk') THEN
      ALTER TABLE public.leads ADD CONSTRAINT leads_campaign_fk FOREIGN KEY (campaign_id, user_id)
        REFERENCES public.campaigns(id, user_id) ON DELETE SET NULL (campaign_id);
    END IF;
  END $$;

  -- Escolher a campanha (campaign_id) preenche o texto; escrever o texto (planilha, extensão, backup)
  -- liga à campanha com o mesmo nome, ou cria uma nova. Maiúsculas e espaços não criam repetidas.
  CREATE OR REPLACE FUNCTION public.zf_lead_campaign() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE v_id BIGINT; v_name TEXT; v_txt TEXT;
  BEGIN
    IF (TG_OP = 'INSERT' AND NEW.campaign_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.campaign_id IS DISTINCT FROM OLD.campaign_id) THEN
      IF NEW.campaign_id IS NULL THEN
        NEW.campaign := NULL;
      ELSE
        SELECT name INTO v_name FROM campaigns WHERE id = NEW.campaign_id AND user_id = NEW.user_id;
        NEW.campaign := v_name;
      END IF;
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.campaign IS NOT DISTINCT FROM OLD.campaign THEN RETURN NEW; END IF;
    v_txt := nullif(btrim(regexp_replace(coalesce(NEW.campaign, ''), '\s+', ' ', 'g')), '');
    IF v_txt IS NULL THEN
      NEW.campaign := NULL;
      NEW.campaign_id := NULL;
      RETURN NEW;
    END IF;
    SELECT id, name INTO v_id, v_name FROM campaigns WHERE user_id = NEW.user_id AND lower(btrim(name)) = lower(v_txt);
    IF v_id IS NULL THEN
      INSERT INTO campaigns (user_id, name) VALUES (NEW.user_id, v_txt) ON CONFLICT DO NOTHING RETURNING id, name INTO v_id, v_name;
      IF v_id IS NULL THEN
        SELECT id, name INTO v_id, v_name FROM campaigns WHERE user_id = NEW.user_id AND lower(btrim(name)) = lower(v_txt);
      END IF;
    END IF;
    NEW.campaign_id := v_id;
    NEW.campaign := coalesce(v_name, v_txt);
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS zf_lead_campaign ON public.leads;
  CREATE TRIGGER zf_lead_campaign BEFORE INSERT OR UPDATE OF campaign, campaign_id ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.zf_lead_campaign();

  -- Renomear a campanha atualiza o texto nos leads dela.
  CREATE OR REPLACE FUNCTION public.zf_campaign_renamed() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      UPDATE leads SET campaign = NEW.name WHERE campaign_id = NEW.id AND campaign IS DISTINCT FROM NEW.name;
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_campaign_renamed ON public.campaigns;
  CREATE TRIGGER zf_campaign_renamed AFTER UPDATE OF name ON public.campaigns
    FOR EACH ROW EXECUTE FUNCTION public.zf_campaign_renamed();

  -- O texto "produto" do card (mostrado no Kanban e lido pela extensão) é o resumo dos itens dele.
  CREATE OR REPLACE FUNCTION public.zf_card_items_sync() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE v_card BIGINT; v_txt TEXT;
  BEGIN
    FOR v_card IN
      SELECT DISTINCT x FROM unnest(ARRAY[
        CASE WHEN TG_OP <> 'INSERT' THEN OLD.card_id END,
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.card_id END]) AS x
      WHERE x IS NOT NULL
    LOOP
      SELECT string_agg(CASE WHEN i.quantity <> 1 THEN trim_scale(i.quantity)::text || '× ' ELSE '' END || i.name, ', ' ORDER BY i.position, i.id)
        INTO v_txt FROM card_items i WHERE i.card_id = v_card;
      UPDATE kanban_cards SET product = v_txt WHERE id = v_card AND product IS DISTINCT FROM v_txt;
    END LOOP;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_card_items_sync ON public.card_items;
  CREATE TRIGGER zf_card_items_sync AFTER INSERT OR UPDATE OR DELETE ON public.card_items
    FOR EACH ROW EXECUTE FUNCTION public.zf_card_items_sync();

  -- Migração (pode rodar de novo): o texto livre que já existia vira cadastro.
  -- Produto do card -> item do catálogo + item do card (com o valor que o card tinha).
  INSERT INTO public.catalog_items (user_id, kind, name)
  SELECT DISTINCT ON (c.user_id, lower(btrim(c.product))) c.user_id, 'product', btrim(c.product)
  FROM public.kanban_cards c
  WHERE nullif(btrim(c.product), '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.card_items i WHERE i.card_id = c.id)
  ORDER BY c.user_id, lower(btrim(c.product)), c.id
  ON CONFLICT DO NOTHING;
  INSERT INTO public.card_items (user_id, card_id, item_id, name, quantity, unit_price)
  SELECT c.user_id, c.id, ci.id, ci.name, 1, greatest(coalesce(c.value, 0), 0)
  FROM public.kanban_cards c
  JOIN public.catalog_items ci ON ci.user_id = c.user_id AND lower(btrim(ci.name)) = lower(btrim(c.product))
  WHERE nullif(btrim(c.product), '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.card_items i WHERE i.card_id = c.id);
  -- Campanha do lead (texto) -> campanha cadastrada.
  INSERT INTO public.campaigns (user_id, name)
  SELECT DISTINCT ON (l.user_id, lower(btrim(l.campaign))) l.user_id, btrim(l.campaign)
  FROM public.leads l
  WHERE nullif(btrim(l.campaign), '') IS NOT NULL AND l.campaign_id IS NULL
  ORDER BY l.user_id, lower(btrim(l.campaign)), l.id
  ON CONFLICT DO NOTHING;
  UPDATE public.leads l SET campaign_id = c.id
  FROM public.campaigns c
  WHERE l.campaign_id IS NULL AND nullif(btrim(l.campaign), '') IS NOT NULL
    AND c.user_id = l.user_id AND lower(btrim(c.name)) = lower(btrim(l.campaign));

  -- 6m. AGENTE DE IA -----------------------------------------------
  -- Cada conta usa a PRÓPRIA chave (Claude da Anthropic ou OpenAI). O painel e a extensão falam
  -- direto com o fornecedor, sem passar por servidor nosso. As chaves ficam só nesta linha, que só
  -- o dono da conta enxerga (RLS). Uma linha por conta.
  CREATE TABLE IF NOT EXISTS public.ai_settings (
    user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic', 'openai')),
    model_chat TEXT,        -- modelo que conversa com o lead e decide (vazio = padrão do fornecedor)
    model_fast TEXT,        -- modelo barato para classificar e resumir a biblioteca
    anthropic_key TEXT,
    openai_key TEXT,
    -- Transcrição de áudio (o Claude não ouve áudio). Padrão: OpenAI, reaproveitando a chave dela.
    stt_provider TEXT NOT NULL DEFAULT 'openai' CHECK (stt_provider IN ('openai', 'groq')),
    stt_model TEXT,
    stt_key TEXT,           -- só se a transcrição usar outra chave (ex.: Groq)
    -- off = desligado | copilot = sugere e você aprova | auto = responde sozinho (ainda não liberado)
    mode TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'copilot', 'auto')),
    -- treino do agente: empresa, tom, regras, assuntos proibidos, horário, perguntas de qualificação
    profile JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- O que o agente aprendeu de cada item da biblioteca (transcrição, resumo e "quando usar").
  -- Texto vem da própria mensagem; áudio e vídeo viram transcrição; imagem e PDF viram descrição.
  ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS ai_transcript TEXT;
  ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS ai_summary TEXT;
  ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS ai_when_to_use TEXT;
  ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS ai_tags TEXT[];
  ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS ai_status TEXT;   -- NULL = ainda não lido
  ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS ai_error TEXT;
  ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS ai_at TIMESTAMPTZ;
  ALTER TABLE public.media_library DROP CONSTRAINT IF EXISTS media_ai_status_check;
  ALTER TABLE public.media_library ADD CONSTRAINT media_ai_status_check CHECK (ai_status IS NULL OR ai_status IN ('done', 'error', 'skipped'));
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ai_when_to_use TEXT;
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ai_tags TEXT[];
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ai_at TIMESTAMPTZ;

  -- Registro do que o agente fez (simulador, copiloto e leitura da biblioteca): o que decidiu,
  -- quais ferramentas usou e quantos tokens gastou. Guarda só os 500 mais recentes por conta.
  CREATE TABLE IF NOT EXISTS public.agent_runs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('simulator', 'copilot', 'auto', 'library')),
    provider TEXT,
    model TEXT,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    cache_read_tokens INT NOT NULL DEFAULT 0,
    duration_ms INT,
    summary TEXT,
    actions JSONB NOT NULL DEFAULT '[]',
    error TEXT,
    feedback SMALLINT CHECK (feedback IS NULL OR feedback IN (-1, 1)),   -- 👎 / 👍
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE OR REPLACE FUNCTION public.zf_prune_agent_runs() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  BEGIN
    DELETE FROM agent_runs
    WHERE user_id = NEW.user_id
      AND id <= (SELECT id FROM agent_runs WHERE user_id = NEW.user_id ORDER BY id DESC OFFSET 500 LIMIT 1);
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS zf_prune_agent_runs ON public.agent_runs;
  CREATE TRIGGER zf_prune_agent_runs AFTER INSERT ON public.agent_runs
    FOR EACH ROW EXECUTE FUNCTION public.zf_prune_agent_runs();

  -- Piloto automático -------------------------------------------------
  -- Pausa do agente em UM lead (você assumiu, ou ele chamou você): até esta hora o automático não responde.
  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMPTZ;

  -- Reserva atômica antes de responder sozinho: se duas abas do WhatsApp (ou dois computadores) tentarem
  -- responder o mesmo lead ao mesmo tempo, só uma recebe o número do registro; a outra recebe NULL e desiste.
  -- Devolve o id do registro (source 'auto') que a extensão preenche depois; NULL = já tem resposta em curso.
  CREATE OR REPLACE FUNCTION public.zf_agent_claim(p_lead BIGINT, p_secs INT DEFAULT 90) RETURNS BIGINT
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
  DECLARE
    v_uid UUID := auth.uid();
    v_id BIGINT;
  BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('zf_agent:' || v_uid::text || ':' || p_lead::text));
    IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_lead AND user_id = v_uid) THEN RETURN NULL; END IF;
    IF EXISTS (
      SELECT 1 FROM agent_runs
      WHERE user_id = v_uid AND lead_id = p_lead AND source = 'auto'
        AND created_at > now() - make_interval(secs => greatest(p_secs, 1))
    ) THEN RETURN NULL; END IF;
    INSERT INTO agent_runs (user_id, lead_id, source, summary) VALUES (v_uid, p_lead, 'auto', 'reservado')
    RETURNING id INTO v_id;
    RETURN v_id;
  END $$;

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

  -- 7. SEGURANÇA: cada usuário só vê e altera os próprios dados (RLS)
  DO $$
  DECLARE t TEXT;
  BEGIN
    FOREACH t IN ARRAY ARRAY['messages','media_library','funnels','funnel_items','kanban_boards','kanban_columns','leads','tags','lead_tags','kanban_cards','lead_messages','triggers','trigger_fires','kanban_card_moves','owners','branding','catalog_items','campaigns','campaign_items','card_items','appointments','tasks','ai_settings','agent_runs','agent_suggestions','agent_reports']
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "own_rows" ON public.%I', t);
      EXECUTE format('CREATE POLICY "own_rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    END LOOP;
  END $$;

  -- 7b. TEMPO REAL: o painel atualiza sozinho quando a extensão cria ou muda um lead
  DO $$
  DECLARE t TEXT;
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      FOREACH t IN ARRAY ARRAY['leads','kanban_cards','lead_tags','tasks','lead_messages','trigger_fires']
      LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
          EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
      END LOOP;
    END IF;
  END $$;

  -- 8. ARQUIVOS (bucket campaign_files) ---------------------------
  -- Público para leitura por link: a extensão baixa o arquivo pelo link para enviar no WhatsApp.
  -- Upload, listagem e exclusão: só na pasta do próprio usuário (<id do usuário>/arquivo).
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('campaign_files', 'campaign_files', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

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

  -- 9. ÍNDICES ---------------------------------------------------
  CREATE INDEX IF NOT EXISTS idx_messages_user ON public.messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_media_user_type ON public.media_library(user_id, type);
  CREATE INDEX IF NOT EXISTS idx_funnels_user ON public.funnels(user_id);
  CREATE INDEX IF NOT EXISTS idx_funnel_items_funnel ON public.funnel_items(funnel_id, position);
  CREATE INDEX IF NOT EXISTS idx_boards_user ON public.kanban_boards(user_id);
  CREATE INDEX IF NOT EXISTS idx_columns_board ON public.kanban_columns(board_id, position);
  CREATE INDEX IF NOT EXISTS idx_cards_column ON public.kanban_cards(column_id, position);
  CREATE INDEX IF NOT EXISTS idx_cards_lead ON public.kanban_cards(lead_id);
  CREATE INDEX IF NOT EXISTS idx_tags_user ON public.tags(user_id);
  CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON public.lead_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON public.lead_messages(lead_id, at DESC);
  CREATE INDEX IF NOT EXISTS idx_leads_user ON public.leads(user_id);
  CREATE INDEX IF NOT EXISTS idx_triggers_user ON public.triggers(user_id);
  CREATE INDEX IF NOT EXISTS idx_trigger_fires ON public.trigger_fires(trigger_id, lead_id);
  CREATE INDEX IF NOT EXISTS idx_card_moves_board ON public.kanban_card_moves(board_id, at);
  CREATE INDEX IF NOT EXISTS idx_card_moves_card ON public.kanban_card_moves(card_id);
  CREATE INDEX IF NOT EXISTS idx_leads_owner ON public.leads(owner_id);
  CREATE INDEX IF NOT EXISTS idx_leads_campaign ON public.leads(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_card_items_card ON public.card_items(card_id, position);
  CREATE INDEX IF NOT EXISTS idx_card_items_item ON public.card_items(item_id);
  CREATE INDEX IF NOT EXISTS idx_campaign_items_item ON public.campaign_items(item_id);
  CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON public.appointments(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON public.tasks(user_id, status, due_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.tasks(lead_id);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON public.agent_runs(user_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_lead ON public.agent_runs(lead_id);
  CREATE INDEX IF NOT EXISTS idx_agent_suggestions_user ON public.agent_suggestions(user_id, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_reports_user ON public.agent_reports(user_id, id DESC);

  -- 10. AGENDA -> TAREFAS: copia compromissos antigos como lembretes (uma vez só) --
  INSERT INTO public.tasks (user_id, kind, title, due_at, contact, phone, notes, color, status, finished_at, options)
  SELECT a.user_id, 'reminder', a.title,
        (a.date || ' ' || left(a.time, 5))::timestamp AT TIME ZONE 'America/Sao_Paulo',
        a.contact, a.phone, a.notes, a.color,
        CASE a.status WHEN 'completed' THEN 'done' WHEN 'cancelled' THEN 'cancelled' ELSE 'scheduled' END,
        CASE WHEN a.status = 'pending' THEN NULL ELSE now() END,
        jsonb_build_object('from_appointment', a.id)
  FROM public.appointments a
  WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.options->>'from_appointment' = a.id::text);

  -- Pronto. Confira em Table Editor: devem aparecer 26 tabelas.

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

  -- 11. Pede ao Supabase (PostgREST) para reconhecer as tabelas novas na hora.
  NOTIFY pgrst, 'reload schema';
