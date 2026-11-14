-- ZapFlow: só a parte das TAREFAS (para quem já rodou o setup.sql antes).
-- Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.

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

-- Segurança: cada usuário só vê e altera as próprias tarefas
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_rows" ON public.tasks;
CREATE POLICY "own_rows" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

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


-- Atualiza o cache da API para a nova tabela aparecer na hora
NOTIFY pgrst, 'reload schema';
