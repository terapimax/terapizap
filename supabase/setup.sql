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

-- 4. LEADS (quadros → etapas → leads) ---------------------------
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

CREATE TABLE IF NOT EXISTS public.leads (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  product TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  avatar TEXT,
  last_message TEXT,
  origin TEXT,
  campaign TEXT,
  status TEXT NOT NULL DEFAULT 'warm' CHECK (status IN ('hot', 'warm', 'cold')),
  column_id BIGINT NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. GATILHOS --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.triggers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('lead_created', 'lead_moved', 'lead_status_changed', 'appointment_due', 'manual')),
  action TEXT NOT NULL CHECK (action IN ('send_message', 'send_audio', 'send_media', 'send_funnel', 'move_lead', 'notify')),
  event_config JSONB NOT NULL DEFAULT '{}',
  action_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- 7. SEGURANÇA: cada usuário só vê e altera os próprios dados (RLS)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['messages','media_library','funnels','funnel_items','kanban_boards','kanban_columns','leads','triggers','appointments','tasks']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "own_rows" ON public.%I', t);
    EXECUTE format('CREATE POLICY "own_rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
  END LOOP;
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
CREATE INDEX IF NOT EXISTS idx_leads_column ON public.leads(column_id, position);
CREATE INDEX IF NOT EXISTS idx_leads_user ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_triggers_user ON public.triggers(user_id);
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

-- Pronto. Confira em Table Editor: devem aparecer 10 tabelas.
