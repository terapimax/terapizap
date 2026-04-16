# 🔐 Correções App.js para RLS - ZapFlow

## PROBLEMA
O app.js insere dados sem passar `user_id` explicitamente. Embora Supabase deveria preencher automaticamente via `DEFAULT auth.uid()`, em alguns casos pode falhar.

## SOLUÇÃO

Você precisa garantir que TODAS as operações `.insert()` passam `user_id` explicitamente.

---

## 1️⃣ INSERÇÃO DE MENSAGENS (app.js ~linha 449)

### ❌ ANTES (INSEGURO):
```javascript
const { data, error } = await supabase
    .from('messages')
    .insert([{ title, content: 'Escreva sua mensagem aqui...', is_favorite: false }])
    .select();
```

### ✅ DEPOIS (SEGURO):
```javascript
const currentUser = (await supabase.auth.getUser()).data.user;
if (!currentUser) {
    showToast('Erro: Não autenticado', 'error');
    return;
}

const { data, error } = await supabase
    .from('messages')
    .insert([{ 
        user_id: currentUser.id,  // ← ADICIONADO
        title, 
        content: 'Escreva sua mensagem aqui...', 
        is_favorite: false 
    }])
    .select();
```

---

## 2️⃣ INSERÇÃO DE ÁUDIO (app.js ~linha 748)

### ❌ ANTES:
```javascript
const { data, error } = await supabase.from('media_library').insert([{
    title: title,
    url: publicUrl,
    type: 'audio',
    mime_type: audioFileToUpload.type,
    size: audioFileToUpload.size,
    is_favorite: false
}]).select();
```

### ✅ DEPOIS:
```javascript
const currentUser = (await supabase.auth.getUser()).data.user;
if (!currentUser) {
    showToast('Erro: Não autenticado', 'error');
    return;
}

const { data, error } = await supabase.from('media_library').insert([{
    user_id: currentUser.id,  // ← ADICIONADO
    title: title,
    url: publicUrl,
    type: 'audio',
    mime_type: audioFileToUpload.type,
    size: audioFileToUpload.size,
    is_favorite: false
}]).select();
```

---

## 3️⃣ INSERÇÃO DE MÍDIA (app.js ~linha 1041)

### ✅ MESMO PADRÃO:
```javascript
const currentUser = (await supabase.auth.getUser()).data.user;
if (!currentUser) {
    showToast('Erro: Não autenticado', 'error');
    return;
}

const { data, error } = await supabase.from('media_library').insert([{
    user_id: currentUser.id,  // ← ADICIONADO
    title: title,
    url: publicUrl,
    type: 'image', // ou 'video'
    mime_type: midiaFileToUpload.type,
    size: midiaFileToUpload.size,
    caption: caption || '',
    is_favorite: false
}]).select();
```

---

## 4️⃣ CRIAÇÃO DE COLUNAS KANBAN (app.js ~procure por "nova coluna")

### ✅ PADRÃO:
```javascript
const currentUser = (await supabase.auth.getUser()).data.user;
if (!currentUser) return;

const boardId = 1; // ou obter ID dinâmico da board

const { data, error } = await supabase
    .from('kanban_columns')
    .insert([{
        user_id: currentUser.id,  // ← ADICIONADO
        board_id: boardId,
        title: 'Nova Coluna',
        position: columns.length
    }])
    .select();
```

---

## 5️⃣ CRIAÇÃO DE FUNIS (app.js ~procure por "novo funil")

### ✅ PADRÃO:
```javascript
const currentUser = (await supabase.auth.getUser()).data.user;
if (!currentUser) return;

const { data, error } = await supabase
    .from('funnels')
    .insert([{
        user_id: currentUser.id,  // ← ADICIONADO
        title: 'Novo Funil',
        description: '',
        is_favorite: false
    }])
    .select();
```

---

## 6️⃣ CRIAÇÃO DE LEADS (app.js ~procure por "novo lead")

### ✅ PADRÃO:
```javascript
const currentUser = (await supabase.auth.getUser()).data.user;
if (!currentUser) return;

const { data, error } = await supabase
    .from('leads')
    .insert([{
        user_id: currentUser.id,  // ← ADICIONADO (new field na table)
        name: leadName,
        phone: leadPhone,
        email: leadEmail,
        product: productName,
        value: leadValue,
        temperature: 'cold',
        column_id: columnId,
        position: 0
    }])
    .select();
```

---

## 7️⃣ HELPER FUNCTION (Adicione ao topo do app.js)

Para evitar repetir esse código, crie uma função helper:

```javascript
// No início do app.js, após SUPABASE_KEY
async function getCurrentUserId() {
    if (!supabase) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        console.warn('User not authenticated');
        return null;
    }
    return user.id;
}

// Depois use assim:
const userId = await getCurrentUserId();
if (!userId) {
    showToast('Erro: Você não está autenticado', 'error');
    return;
}

const { data, error } = await supabase
    .from('mensagens')
    .insert([{ user_id: userId, ...otherFields }])
    .select();
```

---

## ✅ CHECKLIST DE CORREÇÕES

- [ ] Messages: `.insert()` adiciona `user_id`
- [ ] Media Library (Audio): `.insert()` adiciona `user_id`
- [ ] Media Library (Mídia): `.insert()` adiciona `user_id`
- [ ] Kanban Columns: `.insert()` adiciona `user_id`
- [ ] Funnels: `.insert()` adiciona `user_id`
- [ ] Leads: `.insert()` adiciona `user_id`
- [ ] Helper function `getCurrentUserId()` criada
- [ ] Todos `.insert()` verificam se `userId` existe antes de inserir

---

## 🧪 TESTE

1. Abra DevTools (F12)
2. Ative em **Console**
3. Crie uma nova mensagem
4. Vá em Supabase → tabela `messages`
5. ✅ Verifique se a coluna `user_id` foi preenchida
6. ✅ Verifique se é o UUID do seu usuário autenticado

---

## ⚠️ IMPORTANTE

Se receber erro: **"new row violates row-level security policy"**

Significa:
- ❌ `user_id` não foi preenchido
- ❌ RLS está ativo e rejeitando a operação
- ✅ Solução: Adicione `user_id: getCurrentUserId()` em cada `.insert()`

---

**Tempo estimado para corrigir:** 30-45 minutos
