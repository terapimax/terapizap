-- ============================================
-- ZAPFLOW RLS CONFIGURATION (SAFE)
-- This script enables RLS and creates policies only for tables
-- that exist in the database. Copy & paste the whole file into
-- Supabase SQL Editor and run it. It will skip missing tables.
-- ============================================

-- Helper: each block checks for table existence before making changes

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'media_library'
  ) THEN
    -- Ensure column exists before creating policies
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'media_library' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.media_library ADD COLUMN user_id UUID';
      EXECUTE 'ALTER TABLE public.media_library ALTER COLUMN user_id SET DEFAULT auth.uid()';
    END IF;

    EXECUTE 'ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all access" ON public.media_library';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own media" ON public.media_library';
    EXECUTE 'CREATE POLICY "Users can view their media" ON public.media_library FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can create media" ON public.media_library FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can update their media" ON public.media_library FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can delete their media" ON public.media_library FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'messages'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.messages ADD COLUMN user_id UUID';
      EXECUTE 'ALTER TABLE public.messages ALTER COLUMN user_id SET DEFAULT auth.uid()';
    END IF;

    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all access" ON public.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own messages" ON public.messages';
    EXECUTE 'CREATE POLICY "Users can view their messages" ON public.messages FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can create messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can update their messages" ON public.messages FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can delete their messages" ON public.messages FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'funnels'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'funnels' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.funnels ADD COLUMN user_id UUID';
      EXECUTE 'ALTER TABLE public.funnels ALTER COLUMN user_id SET DEFAULT auth.uid()';
    END IF;

    EXECUTE 'ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all access" ON public.funnels';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own funnels" ON public.funnels';
    EXECUTE 'CREATE POLICY "Users can view their funnels" ON public.funnels FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can create funnels" ON public.funnels FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can update their funnels" ON public.funnels FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can delete their funnels" ON public.funnels FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'funnel_items'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'funnel_items' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.funnel_items ADD COLUMN user_id UUID';
      EXECUTE 'ALTER TABLE public.funnel_items ALTER COLUMN user_id SET DEFAULT auth.uid()';
    END IF;

    EXECUTE 'ALTER TABLE public.funnel_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all access" ON public.funnel_items';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own funnel items" ON public.funnel_items';
    EXECUTE 'CREATE POLICY "Users can view their funnel items" ON public.funnel_items FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can create funnel items" ON public.funnel_items FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can update their funnel items" ON public.funnel_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can delete their funnel items" ON public.funnel_items FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kanban_boards'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kanban_boards' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.kanban_boards ADD COLUMN user_id UUID';
      EXECUTE 'ALTER TABLE public.kanban_boards ALTER COLUMN user_id SET DEFAULT auth.uid()';
    END IF;

    EXECUTE 'ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all access" ON public.kanban_boards';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own kanban boards" ON public.kanban_boards';
    EXECUTE 'CREATE POLICY "Users can view their kanban boards" ON public.kanban_boards FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can create kanban boards" ON public.kanban_boards FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can update their kanban boards" ON public.kanban_boards FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can delete their kanban boards" ON public.kanban_boards FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kanban_columns'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kanban_columns' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.kanban_columns ADD COLUMN user_id UUID';
      EXECUTE 'ALTER TABLE public.kanban_columns ALTER COLUMN user_id SET DEFAULT auth.uid()';
    END IF;

    EXECUTE 'ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all access" ON public.kanban_columns';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own kanban columns" ON public.kanban_columns';
    EXECUTE 'CREATE POLICY "Users can view their kanban columns" ON public.kanban_columns FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can create kanban columns" ON public.kanban_columns FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can update their kanban columns" ON public.kanban_columns FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can delete their kanban columns" ON public.kanban_columns FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END
$$;

-- Leads policies depend on kanban_columns (we only create them if both tables exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kanban_columns'
  ) THEN
    -- Ensure leads.user_id exists (optional)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.leads ADD COLUMN user_id UUID';
      EXECUTE 'ALTER TABLE public.leads ALTER COLUMN user_id SET DEFAULT auth.uid()';
    END IF;

    EXECUTE 'ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all access" ON public.leads';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own leads" ON public.leads';
    EXECUTE 'CREATE POLICY "Users can view their leads" ON public.leads FOR SELECT USING (column_id IS NULL OR auth.uid() IN (SELECT user_id FROM kanban_columns WHERE kanban_columns.id = leads.column_id))';
    EXECUTE 'CREATE POLICY "Users can create leads" ON public.leads FOR INSERT WITH CHECK (column_id IS NULL OR auth.uid() IN (SELECT user_id FROM kanban_columns WHERE kanban_columns.id = column_id))';
    EXECUTE 'CREATE POLICY "Users can update their leads" ON public.leads FOR UPDATE USING (column_id IS NULL OR auth.uid() IN (SELECT user_id FROM kanban_columns WHERE kanban_columns.id = leads.column_id)) WITH CHECK (column_id IS NULL OR auth.uid() IN (SELECT user_id FROM kanban_columns WHERE kanban_columns.id = column_id))';
    EXECUTE 'CREATE POLICY "Users can delete their leads" ON public.leads FOR DELETE USING (column_id IS NULL OR auth.uid() IN (SELECT user_id FROM kanban_columns WHERE kanban_columns.id = leads.column_id))';
  END IF;
END
$$;

-- Optional: verification queries (run after the script completes)

-- Optional: verification queries (run after the script completes)
--
-- 1) List public tables and RLS status (use pg_class.relrowsecurity):
-- SELECT n.nspname AS schema, c.relname AS table_name, c.relrowsecurity AS row_security
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'r'
--   AND c.relname IN ('media_library','messages','funnels','funnel_items','kanban_boards','kanban_columns','leads')
-- ORDER BY c.relname;
--
-- 2) List policies (note: column is "tablename", not "table_name"):
-- SELECT schemaname, tablename, policyname, permissive, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('media_library','messages','funnels','funnel_items','kanban_boards','kanban_columns','leads')
-- ORDER BY tablename, policyname;
--
-- 3) Find tables containing the column "user_id":
-- SELECT table_schema, table_name, column_name
-- FROM information_schema.columns
-- WHERE column_name = 'user_id' AND table_schema = 'public'
-- ORDER BY table_name;
--
-- NOTE: Run these in the Supabase SQL Editor. If the editor applies a limit, select "No limit" before running.
