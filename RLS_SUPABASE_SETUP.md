# 🔒 Configuração RLS (Row Level Security) - ZapFlow

## O QUE É RLS?
Row Level Security garante que cada usuário autenticado só acesse seus próprios dados, impedindo que um usuário veja dados de outro usuário.

---

## ⚠️ PROBLEMA ATUAL
Seu Supabase está com estas políticas fracas:
```sql
CREATE POLICY "Allow all access" ON kanban_columns FOR ALL USING (true)
```
Isso permite acesso IRRESTRITO a todos os dados.

---

## ✅ SOLUÇÃO: IMPLEMENTAR RLS SEGURA

### PASSO 1: Acessar Supabase
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto **ezphizbbgjrfwbucaoun**
3. Vá em **SQL Editor** (canto esquerdo)

### PASSO 2: Executar Script SQL
Copie e execute TODO o script abaixo:

```sql
-- ============================================
-- ZAPFLOW RLS CONFIGURATION
-- ============================================

-- 1. ENABLE RLS ON ALL TABLES (IDEMPOTENT)
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 2. DROP OLD INSECURE POLICIES
DROP POLICY IF EXISTS "Allow all access" ON media_library;
DROP POLICY IF EXISTS "Allow all access" ON messages;
DROP POLICY IF EXISTS "Allow all access" ON funnels;
DROP POLICY IF EXISTS "Allow all access" ON funnel_items;
DROP POLICY IF EXISTS "Allow all access" ON kanban_boards;
DROP POLICY IF EXISTS "Allow all access" ON kanban_columns;
DROP POLICY IF EXISTS "Allow all access" ON leads;

-- 3. CREATE SECURE USER-SPECIFIC POLICIES

-- Media Library: Users can only access their own media
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

-- Messages: Users can only access their own messages
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

-- Funnels: Users can only manage their own funnels
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

-- Funnel Items: Inherited from parent funnel
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

-- Kanban Boards: Users can only manage their own boards
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

-- Kanban Columns: Users can only manage their own columns
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

-- Leads: Users can only manage their own leads
CREATE POLICY "Users can view their leads" 
  ON leads FOR SELECT 
  USING (auth.uid() IN (
    SELECT user_id FROM kanban_columns 
    WHERE kanban_columns.id = leads.column_id
  ));

CREATE POLICY "Users can create leads" 
  ON leads FOR INSERT 
  WITH CHECK (auth.uid() IN (
    SELECT user_id FROM kanban_columns 
    WHERE kanban_columns.id = (NEW.column_id)
  ) OR new.column_id IS NULL);

CREATE POLICY "Users can update their leads" 
  ON leads FOR UPDATE 
  USING (auth.uid() IN (
    SELECT user_id FROM kanban_columns 
    WHERE kanban_columns.id = leads.column_id
  ));

CREATE POLICY "Users can delete their leads" 
  ON leads FOR DELETE 
  USING (auth.uid() IN (
    SELECT user_id FROM kanban_columns 
    WHERE kanban_columns.id = leads.column_id
  ));

-- 4. VERIFY RLS IS ENABLED
SELECT table_name, row_security 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('media_library', 'messages', 'funnels', 'funnel_items', 'kanban_boards', 'kanban_columns', 'leads')
ORDER BY table_name;

-- 5. VERIFY POLICIES ARE CREATED
SELECT table_name, policyname, qual, with_check 
FROM pg_policies 
WHERE table_name IN ('media_library', 'messages', 'funnels', 'funnel_items', 'kanban_boards', 'kanban_columns', 'leads')
ORDER BY table_name, policyname;
```

---

## PASSO 3: Validar Implementação

Após executar, você deve ver:

### ✅ Resultado esperado:
- Todas as 7 tabelas com `row_security = ON`
- Múltiplas políticas por tabela (SELECT, INSERT, UPDATE, DELETE)
- Cada política restrita ao `auth.uid() = user_id`

### ❌ Se houver erro "policy already exists":
- Clique em **Clear** no editor SQL
- Execute o script novamente

---

## PASSO 4: Atualizar App para Usar RLS

O app.js precisa passar o `user_id` nas inserções. Verifique se todas as queries incluem:

```javascript
// ✅ CORRETO - Supabase RLS captura user_id automaticamente
const { data, error } = await supabase
  .from('messages')
  .insert([{ title: 'Teste', content: 'Conteúdo' }]); // user_id preenchido automaticamente

// ✅ CORRETO - Se precisar passar explicitamente
const { data, error } = await supabase
  .from('leads')
  .insert([{ 
    name: 'João',
    phone: '11999999999',
    user_id: (await supabase.auth.getUser()).data.user.id
  }]);
```

---

## PASSO 5: Testar com Múltiplos Usuários

1. **Crie 2 contas diferentes** em seu Supabase
2. **User A:** Cria um lead
3. **User B:** Tenta acessar o lead de User A
4. ✅ **Resultado:** User B recebe array vazio (não vê dados de User A)

---

## ⚡ CHECKLIST RLS

- [ ] RLS habilitado em todas as 7 tabelas
- [ ] Políticas antigas "Allow all access" removidas
- [ ] Novas políticas com `auth.uid()` criadas
- [ ] App.js garante que `user_id` é preenchido
- [ ] Testado com 2+ usuários diferentes
- [ ] Sem erros em console do navegador

---

## 🚨 TROUBLESHOOTING

### Erro: "Unable to read from table"
- Verifique se está autenticado no app
- Confirme se `user_id` está na tabela
- Rode o script de RLS novamente

### Erro: "Cannot insert row"
- Garanta que `auth.uid()` retorna um UUID válido
- Verifique se user_id está preenchido na inserção

### Erro: "Policy already exists"
- Limpe o editor SQL e rode de novo
- Ou use `DROP POLICY IF EXISTS` antes de criar

---

## 📚 REFERÊNCIAS
- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**Tempo estimado:** 10-15 minutos
**Risco:** BAIXO (policies podem ser alteradas em qualquer momento)
