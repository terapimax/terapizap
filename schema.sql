-- Create kanban_columns table
CREATE TABLE IF NOT EXISTS kanban_columns (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) -- Optional: for multi-user
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    column_id BIGINT REFERENCES kanban_columns(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    value NUMERIC DEFAULT 0,
    priority TEXT DEFAULT 'low', -- low, medium, high
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    tags TEXT[], -- array of strings
    archived BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    type TEXT DEFAULT 'PF', -- PF, PJ
    product TEXT,
    temperature TEXT DEFAULT 'cold', -- cold, warm, hot
    campaign_origin TEXT, -- FB, Insta, Google, etc.
    campaign_name TEXT,
    history JSONB DEFAULT '[]'::jsonb -- Stores the history array
);

-- Enable RLS
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON kanban_columns FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON leads FOR ALL USING (true) WITH CHECK (true);

-- Insert Default Columns
INSERT INTO kanban_columns (title, color, position) VALUES 
('Novos', '#3B82F6', 0),
('Em Atendimento', '#F59E0B', 1),
('Aguardando', '#8A6CFF', 2),
('Concluído', '#10B981', 3);
