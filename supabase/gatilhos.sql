-- ZapFlow: só a parte dos GATILHOS POR PALAVRA-CHAVE (para quem já rodou o setup.sql antes).
-- Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.

-- 'keyword' = o contato escreveu uma palavra-chave (a extensão responde sozinha).
-- event_config do keyword: { keywords: text[], match: 'contains'|'exact'|'starts', cooldown_hours: 24 (0 = toda vez, -1 = uma vez por conversa) }
ALTER TABLE public.triggers DROP CONSTRAINT IF EXISTS triggers_event_check;
ALTER TABLE public.triggers ADD CONSTRAINT triggers_event_check
  CHECK (event IN ('keyword', 'lead_created', 'lead_moved', 'lead_status_changed', 'appointment_due', 'manual'));
ALTER TABLE public.triggers DROP CONSTRAINT IF EXISTS triggers_action_check;
ALTER TABLE public.triggers ADD CONSTRAINT triggers_action_check
  CHECK (action IN ('send_message', 'send_audio', 'send_media', 'send_document', 'send_funnel', 'move_lead', 'notify'));
