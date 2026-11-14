-- ============================================================
-- ZAPFLOW v2.0 — Schema SQL Completo
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- ┌──────────────────────────────────────────────┐
-- │ 1. MENSAGENS (messages)                      │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON messages
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 2. BIBLIOTECA DE MÍDIA (media_library)       │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS media_library (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT,
  url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('audio', 'video', 'image', 'document')),
  mime_type TEXT,
  size BIGINT,
  is_favorite BOOLEAN DEFAULT false,
  is_view_once BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own media" ON media_library
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 3. FUNIS (funnels + funnel_items)            │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS funnels (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own funnels" ON funnels
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS funnel_items (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  funnel_id BIGINT NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('message', 'audio', 'midia', 'document')),
  delay_minutes INT DEFAULT 0,
  delay_seconds INT DEFAULT 0,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE funnel_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own funnel_items" ON funnel_items
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 4. KANBAN BOARDS                             │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS kanban_boards (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own boards" ON kanban_boards
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 5. KANBAN COLUMNS                            │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS kanban_columns (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id BIGINT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT DEFAULT '#8b5cf6',
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own columns" ON kanban_columns
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 6. LEADS                                     │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  product TEXT,
  value NUMERIC DEFAULT 0,
  avatar TEXT,
  last_message TEXT,
  origin TEXT,
  campaign TEXT,
  status TEXT DEFAULT 'warm' CHECK (status IN ('hot', 'warm', 'cold')),
  column_id BIGINT NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own leads" ON leads
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 7. GATILHOS / TRIGGERS                       │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS triggers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('lead_created', 'lead_moved', 'lead_status_changed', 'appointment_due', 'manual')),
  action TEXT NOT NULL CHECK (action IN ('send_message', 'send_audio', 'send_media', 'send_funnel', 'move_lead', 'notify')),
  event_config JSONB DEFAULT '{}',
  action_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own triggers" ON triggers
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 8. AGENDAMENTOS / APPOINTMENTS               │
-- └──────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  contact TEXT NOT NULL,
  phone TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  color TEXT DEFAULT '#e13584',
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own appointments" ON appointments
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────┐
-- │ 9. STORAGE BUCKET                            │
-- └──────────────────────────────────────────────┘
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campaign_files', 'campaign_files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'campaign_files' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'campaign_files' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'campaign_files' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public read campaign files" ON storage.objects
  FOR SELECT USING (bucket_id = 'campaign_files');

-- ┌──────────────────────────────────────────────┐
-- │ 10. ÍNDICES PARA PERFORMANCE                 │
-- └──────────────────────────────────────────────┘
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_media_user ON media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_library(user_id, type);
CREATE INDEX IF NOT EXISTS idx_funnels_user ON funnels(user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_items_funnel ON funnel_items(funnel_id);
CREATE INDEX IF NOT EXISTS idx_boards_user ON kanban_boards(user_id);
CREATE INDEX IF NOT EXISTS idx_columns_board ON kanban_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_leads_column ON leads(column_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_triggers_user ON triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(user_id, date);
