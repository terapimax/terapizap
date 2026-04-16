-- Create media_library table (Audios, Documents, Media)
CREATE TABLE IF NOT EXISTS media_library (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    caption TEXT,
    url TEXT NOT NULL,
    type TEXT NOT NULL, -- 'audio', 'video', 'image', 'document'
    mime_type TEXT,
    size BIGINT, -- in bytes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_favorite BOOLEAN DEFAULT FALSE,
    is_view_once BOOLEAN DEFAULT FALSE -- only for media
);

-- Create messages table (Text Templates)
CREATE TABLE IF NOT EXISTS messages (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create funnels table
CREATE TABLE IF NOT EXISTS funnels (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create funnel_items table (Linked to funnels)
CREATE TABLE IF NOT EXISTS funnel_items (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    funnel_id BIGINT REFERENCES funnels(id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL, 
    type TEXT NOT NULL, 
    delay_minutes INTEGER DEFAULT 0,
    delay_seconds INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create kanban_boards table
CREATE TABLE IF NOT EXISTS kanban_boards (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create kanban_columns table
CREATE TABLE IF NOT EXISTS kanban_columns (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL,
    board_id BIGINT REFERENCES kanban_boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
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
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Safe to run multiple times)
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid "policy already exists" error
DROP POLICY IF EXISTS "Allow all access" ON media_library;
DROP POLICY IF EXISTS "Allow all access" ON messages;
DROP POLICY IF EXISTS "Allow all access" ON funnels;
DROP POLICY IF EXISTS "Allow all access" ON funnel_items;

DROP POLICY IF EXISTS "Users can manage their own media" ON media_library;
DROP POLICY IF EXISTS "Users can manage their own messages" ON messages;
DROP POLICY IF EXISTS "Users can manage their own funnels" ON funnels;
DROP POLICY IF EXISTS "Users can manage their own funnel items" ON funnel_items;
DROP POLICY IF EXISTS "Users can manage their own kanban boards" ON kanban_boards;
DROP POLICY IF EXISTS "Users can manage their own kanban columns" ON kanban_columns;
DROP POLICY IF EXISTS "Users can manage their own leads" ON leads;
DROP POLICY IF EXISTS "Allow public storage access" ON storage.objects;

-- Re-create Policies (Restricted)
CREATE POLICY "Users can manage their own media" ON media_library FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own messages" ON messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own funnels" ON funnels FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own funnel items" ON funnel_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own kanban boards" ON kanban_boards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own kanban columns" ON kanban_columns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own leads" ON leads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for campaign files if missed
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campaign_files', 'campaign_files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public storage access" ON storage.objects FOR ALL USING ( bucket_id = 'campaign_files' ) WITH CHECK ( bucket_id = 'campaign_files' );
