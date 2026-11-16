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
    CHECK (event IN ('keyword', 'lead_created', 'lead_moved', 'lead_status_changed', 'tag_added', 'appointment_due', 'manual'));
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
      -- condições do gatilho (vazio = qualquer)
      CONTINUE WHEN p_event = 'lead_moved' AND nullif(v_cfg->>'column_id', '') IS NOT NULL AND v_cfg->>'column_id' <> coalesce(p_ctx->>'column_id', '');
      CONTINUE WHEN p_event = 'lead_status_changed' AND nullif(v_cfg->>'status', '') IS NOT NULL AND v_cfg->>'status' <> coalesce(p_ctx->>'status', '');
      CONTINUE WHEN p_event = 'tag_added' AND nullif(v_cfg->>'tag_id', '') IS NOT NULL AND v_cfg->>'tag_id' <> coalesce(p_ctx->>'tag_id', '');
      CONTINUE WHEN p_event = 'lead_created' AND nullif(v_cfg->>'origin', '') IS NOT NULL AND v_cfg->>'origin' <> coalesce(v_lead.origin, '');
      -- uma vez por lead, a não ser que o gatilho diga "toda vez"
      CONTINUE WHEN coalesce((v_cfg->>'repeat')::boolean, false) = false
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

  -- 7. SEGURANÇA: cada usuário só vê e altera os próprios dados (RLS)
  DO $$
  DECLARE t TEXT;
  BEGIN
    FOREACH t IN ARRAY ARRAY['messages','media_library','funnels','funnel_items','kanban_boards','kanban_columns','leads','tags','lead_tags','kanban_cards','lead_messages','triggers','trigger_fires','kanban_card_moves','appointments','tasks']
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
  CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON public.appointments(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON public.tasks(user_id, status, due_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.tasks(lead_id);

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

  -- Pronto. Confira em Table Editor: devem aparecer 16 tabelas.
