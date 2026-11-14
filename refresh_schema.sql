-- ==========================================
-- SCRIPT TOTAL DE REPOSIÇÃO (ZAPFLOW)
-- Copie isso e rode no SQL Editor do Supabase
-- Isso vai limpar as tabelas erradas e recriar TUDO perfeitamente
-- ==========================================

-- 1. DROP NAS TABELAS CONFLITANTES (limpa o cache e estrutura errada)
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS funnel_items CASCADE;
DROP TABLE IF EXISTS funnels CASCADE;
DROP TABLE IF EXISTS kanban_columns CASCADE;
DROP TABLE IF EXISTS kanban_boards CASCADE;
DROP TABLE IF EXISTS media_library CASCADE;
DROP TABLE IF EXISTS messages CASCADE;

-- 2. RECRIANDO TUDO COM AS COLUNAS CORRETAS

CREATE TABLE messages (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE media_library (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    caption TEXT,
    url TEXT NOT NULL,
    type TEXT NOT NULL, 
    mime_type TEXT,
    size BIGINT, 
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_favorite BOOLEAN DEFAULT FALSE
);

CREATE TABLE funnels (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE funnel_items (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    funnel_id BIGINT REFERENCES funnels(id) ON DELETE CASCADE,
    type TEXT NOT NULL, 
    item_id BIGINT NOT NULL, 
    delay_minutes INT DEFAULT 0,
    delay_seconds INT DEFAULT 0,
    position INT DEFAULT 0
);

CREATE TABLE kanban_boards (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kanban_columns (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    board_id BIGINT REFERENCES kanban_boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    position INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leads (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    product TEXT,
    value NUMERIC(10, 2) DEFAULT 0,
    avatar TEXT,
    last_message TEXT,
    column_id BIGINT REFERENCES kanban_columns(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'warm', 
    position INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    tags TEXT[], 
    archived BOOLEAN DEFAULT FALSE
);

-- 3. HABILITANDO RLS EM TODAS AS TABELAS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 4. APLICANDO AS POLÍTICAS (POLICIES) SEGURO
CREATE POLICY "Users limit their messages" ON messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users limit their media" ON media_library FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users limit their funnels" ON funnels FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users limit their funnel items" ON funnel_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users limit their kanban boards" ON kanban_boards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users limit their kanban columns" ON kanban_columns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users limit their leads" ON leads FOR ALL 
USING (column_id IS NULL OR auth.uid() IN (SELECT user_id FROM kanban_columns WHERE kanban_columns.id = leads.column_id)) 
WITH CHECK (column_id IS NULL OR auth.uid() IN (SELECT user_id FROM kanban_columns WHERE kanban_columns.id = column_id));

-- Recarrega o cache de schema (Força o Supabase a ver as novas colunas como board_id)
NOTIFY pgrst, 'reload schema';
