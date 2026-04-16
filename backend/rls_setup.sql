-- ============================================
-- ZAPFLOW RLS CONFIGURATION - PRODUCTION
-- Crie um novo Query no Supabase SQL Editor
-- e copie/cole TUDO isto
-- ============================================
-- ⚠️ IMPORTANTE: Execute tudo de uma vez!

-- 1. ENABLE RLS ON ALL TABLES (IDEMPOTENT)
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 2. DROP OLD INSECURE POLICIES (IDEMPOTENT)
DROP POLICY IF EXISTS "Allow all access" ON media_library;
DROP POLICY IF EXISTS "Allow all access" ON messages;
DROP POLICY IF EXISTS "Allow all access" ON funnels;
DROP POLICY IF EXISTS "Allow all access" ON funnel_items;
DROP POLICY IF EXISTS "Allow all access" ON kanban_boards;
DROP POLICY IF EXISTS "Allow all access" ON kanban_columns;
DROP POLICY IF EXISTS "Allow all access" ON leads;

-- 3. MEDIA_LIBRARY POLICIES
CREATE POLICY "Users can view their media" 
  ON media_library FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create media" 
  ON media_library FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their media" 
  ON media_library FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their media" 
  ON media_library FOR DELETE 
  USING (auth.uid() = user_id);

-- 4. MESSAGES POLICIES
CREATE POLICY "Users can view their messages" 
  ON messages FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create messages" 
  ON messages FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their messages" 
  ON messages FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their messages" 
  ON messages FOR DELETE 
  USING (auth.uid() = user_id);

-- 5. FUNNELS POLICIES
CREATE POLICY "Users can view their funnels" 
  ON funnels FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create funnels" 
  ON funnels FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their funnels" 
  ON funnels FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their funnels" 
  ON funnels FOR DELETE 
  USING (auth.uid() = user_id);

-- 6. FUNNEL_ITEMS POLICIES
CREATE POLICY "Users can view their funnel items" 
  ON funnel_items FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create funnel items" 
  ON funnel_items FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their funnel items" 
  ON funnel_items FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their funnel items" 
  ON funnel_items FOR DELETE 
  USING (auth.uid() = user_id);

-- 7. KANBAN_BOARDS POLICIES
CREATE POLICY "Users can view their kanban boards" 
  ON kanban_boards FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create kanban boards" 
  ON kanban_boards FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their kanban boards" 
  ON kanban_boards FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their kanban boards" 
  ON kanban_boards FOR DELETE 
  USING (auth.uid() = user_id);

-- 8. KANBAN_COLUMNS POLICIES
CREATE POLICY "Users can view their kanban columns" 
  ON kanban_columns FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create kanban columns" 
  ON kanban_columns FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their kanban columns" 
  ON kanban_columns FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their kanban columns" 
  ON kanban_columns FOR DELETE 
  USING (auth.uid() = user_id);

-- 9. LEADS POLICIES (via kanban_columns.user_id constraint)
CREATE POLICY "Users can view their leads" 
  ON leads FOR SELECT 
  USING (
    column_id IS NULL OR auth.uid() IN (
      SELECT user_id FROM kanban_columns 
      WHERE kanban_columns.id = leads.column_id
    )
  );

CREATE POLICY "Users can create leads" 
  ON leads FOR INSERT 
  WITH CHECK (
    column_id IS NULL OR auth.uid() IN (
      SELECT user_id FROM kanban_columns 
      WHERE kanban_columns.id = column_id
    )
  );

CREATE POLICY "Users can update their leads" 
  ON leads FOR UPDATE 
  USING (
    column_id IS NULL OR auth.uid() IN (
      SELECT user_id FROM kanban_columns 
      WHERE kanban_columns.id = leads.column_id
    )
  )
  WITH CHECK (
    column_id IS NULL OR auth.uid() IN (
      SELECT user_id FROM kanban_columns 
      WHERE kanban_columns.id = column_id
    )
  );

CREATE POLICY "Users can delete their leads" 
  ON leads FOR DELETE 
  USING (
    column_id IS NULL OR auth.uid() IN (
      SELECT user_id FROM kanban_columns 
      WHERE kanban_columns.id = leads.column_id
    )
  );

-- ============================================
-- VERIFICATION QUERIES (optional)
-- Rode estes para confirmar a implementação
-- ============================================

-- Check: RLS Enabled on all tables
SELECT table_name, row_security 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('media_library', 'messages', 'funnels', 'funnel_items', 'kanban_boards', 'kanban_columns', 'leads')
ORDER BY table_name;

-- Check: All policies created
SELECT table_name, policyname, cmd::text as operation
FROM pg_policies 
WHERE table_name IN ('media_library', 'messages', 'funnels', 'funnel_items', 'kanban_boards', 'kanban_columns', 'leads')
ORDER BY table_name, policyname;
