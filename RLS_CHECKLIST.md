# 📋 CHECKLIST RLS - PRÓXIMOS PASSOS

## 🎯 RESUMO DA TAREFA

Configurar segurança total no Supabase com Row Level Security.

---

## ✅ FASE 1: BANCO DE DADOS (10 minutos)

### Passo 1: Abrir Supabase
```
1. Acesse https://supabase.com/dashboard
2. Clique no projeto "ezphizbbgjrfwbucaoun"
3. Vá em "SQL Editor" (esquerda)
4. Clique em "+" para criar novo query
```

### Passo 2: Copiar e Executar Script
```
- Abra arquivo: backend/rls_setup.sql
- Copie TODO o conteúdo
- Cole no Supabase SQL Editor
- Clique em "Execute" ou Ctrl+Enter
- ✅ Aguarde "Success" na interface
```

### Passo 3: Validar
```
Depois que completar, verá no console:

✅ RLS Enabled on all tables:
   - media_library: ON
   - messages: ON
   - funnels: ON
   - funnel_items: ON
   - kanban_boards: ON
   - kanban_columns: ON
   - leads: ON

✅ Policies created:
   - 28 políticas ao total (4 por tabela principais)
```

---

## ✅ FASE 2: ATUALIZAR APP.JS (30-45 minutos)

### Localizações a Encontrar no app.js:

| Item | Linha Aprox | Ação |
|------|-------------|------|
| **Criar Mensagem** | ~449 | Adicionar `user_id` em `.insert()` |
| **Upload Áudio** | ~748 | Adicionar `user_id` em `.insert()` |
| **Upload Mídia** | ~1041 | Adicionar `user_id` em `.insert()` |
| **Nova Coluna Kanban** | ~? | Buscar e adicionar `user_id` |
| **Novo Funil** | ~? | Buscar e adicionar `user_id` |
| **Novo Lead** | ~? | Buscar e adicionar `user_id` |

### Padrão de Correção:

```javascript
// 1. Adicone esta função NO TOPO do app.js (depois de SUPABASE_KEY):
async function getCurrentUserId() {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
}

// 2. Em cada .insert(), adicione user_id:
const userId = await getCurrentUserId();
if (!userId) {
    showToast('Erro: Não autenticado', 'error');
    return;
}

const { data, error } = await supabase
    .from('tabela')
    .insert([{ 
        user_id: userId,  // ← NOVO
        outras_fields: valor
    }])
    .select();
```

### 📌 Arquivo de Referência:
Veja `APP_JS_RLS_FIXES.md` para exemplos detalhados.

---

## ✅ FASE 3: TESTAR (15 minutos)

### Teste 1: Criar Dados com Login
```
1. Faça login no app como User A
2. Crie: 1 mensagem, 1 áudio, 1 mídia
3. Abra DevTools (F12)
4. Vá em Console
5. Execute:
   const { data } = await supabase.from('messages').select();
   console.log(data);
6. ✅ Deve mostrar apenas seus dados (com seu user_id)
```

### Teste 2: Testar Isolamento de Dados
```
1. Crie 2 usuários no Supabase:
   - User A: joao@email.com / senha123
   - User B: maria@email.com / senha123

2. Faça login com User A e crie dados
3. Faça logout
4. Faça login com User B
5. Execute no Console:
   const { data } = await supabase.from('messages').select();
   console.log(data);
6. ✅ Deve estar VAZIO (User B não vê dados de User A)
```

### Teste 3: Tentar Violação (Segurança)
```
1. Faça login com User B
2. Tente atualizar Lead de User A:
   const { error } = await supabase
     .from('leads')
     .update({ name: 'HACKED' })
     .eq('id', 1);  // ID do lead de User A
3. ✅ Deve erro: "new row violates row-level security policy"
```

---

## 📊 STATUS DE CONCLUSÃO

### ANTES:
```
❌ RLS Desativada
❌ Políticas fracas ("Allow all")
❌ Qualquer um via API acessa dados alheios
```

### DEPOIS:
```
✅ RLS Ativada
✅ Políticas fortes (user_id = auth.uid())
✅ Isolamento completo entre usuários
✅ Segurança em produção
```

---

## 🚨 POSSÍVEIS ERROS E SOLUÇÕES

| Erro | Causa | Solução |
|------|-------|--------|
| `new row violates row-level security policy` | user_id não preenchido | Adicionar user_id em .insert() |
| `Unable to read from table` | Falta de permissão SELECT | RLS criada mas user não autenticado |
| `policy already exists` | Script rodou 2x | Limpar SQL Editor e rodar novamente |
| Dados vazios após login | Nenhum dado do usuário | Normal, criar novos dados terá user_id |

---

## 📋 CHECKLIST FINAL

- [ ] Script RLS executado no Supabase SQL Editor
- [ ] Função `getCurrentUserId()` adicionada ao app.js
- [ ] Todas as 6 operações `.insert()` corrigidas
- [ ] App testado com login/logout
- [ ] 2+ usuários testados (isolamento funciona)
- [ ] Teste de segurança passou (violação rejeitada)
- [ ] Console limpo de erros RLS
- [ ] Documentação lida: `RLS_SUPABASE_SETUP.md` e `APP_JS_RLS_FIXES.md`

---

## ⏱️ TEMPO TOTAL

| Fase | Tempo |
|------|-------|
| Banco de Dados | 10 min |
| Código App.js | 45 min |
| Testes | 15 min |
| **TOTAL** | **70 min (~1h)** |

---

## 🎉 DEPOIS DE CONCLUÍDO

✅ Seu ZapFlow agora tem:
- Segurança de dados por usuário
- Proteção contra acessos não autorizados
- Pronto para produção
- Conformidade com LGPD/GDPR

**Próximo passo:** Agendamentos e Gatilhos
