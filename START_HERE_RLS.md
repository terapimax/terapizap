# 🚀 COMEÇAR AQUI - RLS SUPABASE (5 MIN SUMMARY)

## O QUE FAZER AGORA?

### 1️⃣ PASSO 1: SQL NO SUPABASE (5 min)

```
a) Abra: https://supabase.com/dashboard
b) Projeto: ezphizbbgjrfwbucaoun
c) SQL Editor → Novo Query
d) Arquivo local: backend/rls_setup.sql
e) Copie TODO → Cole → Execute
f) Aguarde "Success"
```

**Pronto!** RLS está ativo no banco.

---

### 2️⃣ PASSO 2: CORRIGIR APP.JS (30-45 min)

O app.js precisa passar `user_id` nas inserções.

**Abra arquivo:** `APP_JS_RLS_FIXES.md`

Ele tem todos os exemplos. Você precisa corrigir **6 locais**:
- Mensagens (linha ~449)
- Áudio (linha ~748)  
- Mídia (linha ~1041)
- Colunas Kanban (buscar)
- Funis (buscar)
- Leads (buscar)

**Dica:** Use Ctrl+F para buscar `.insert([` no app.js

---

### 3️⃣ PASSO 3: TESTAR (10 min)

```javascript
// No Console do navegador (F12):

// Teste 1: Seus dados
const { data } = await supabase.from('messages').select();
console.log(data); // Deve mostrar suas mensagens

// Teste 2: Criar novo (se user_id estiver correto)
const userId = (await supabase.auth.getUser()).data.user.id;
const { data: new_msg, error } = await supabase
  .from('messages')
  .insert([{ user_id: userId, title: 'Teste' }])
  .select();
console.log(new_msg, error);

// ✅ Se funcionou: user_id foi salvo
// ❌ Se erro "violates row-level security": user_id faltando no app.js
```

---

## 📁 ARQUIVOS CRIADOS

| Arquivo | Descrição |
|---------|-----------|
| `RLS_SUPABASE_SETUP.md` | 📖 Documentação completa (66 linhas) |
| `backend/rls_setup.sql` | 🔧 Script SQL pronto |
| `APP_JS_RLS_FIXES.md` | 📝 Exemplos de correções (150+ linhas) |
| `RLS_CHECKLIST.md` | ✅ Checklist de testes |
| `START_HERE_RLS.md` | 👈 Este arquivo (resumo rápido) |

---

## ⚡ QUICK REFERENCE

### Padrão de Correção (COPIE/COLE):

```javascript
// ADICIONE NO TOPO DO APP.JS (depois de SUPABASE_KEY):
async function getCurrentUserId() {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
}

// EM CADA .insert(), USEisto:
const userId = await getCurrentUserId();
if (!userId) {
    showToast('Erro: Não autenticado', 'error');
    return;
}

const { data, error } = await supabase
    .from('sua_tabela')
    .insert([{ 
        user_id: userId,  // ← SEMPRE ADICIONE ISTO
        outros_campos: valor
    }])
    .select();
```

---

## ✅ COMO SABER SE ESTÁ FUNCIONANDO?

### ✅ CORRETO:
```
1. Cria mensagem → Supabase mostra com user_id preenchido
2. Login com outro usuário → Não vê dados do primeiro
3. Console sem erros RLS
```

### ❌ ERRADO:
```
1. Erro: "violates row-level security policy"
   → Falta user_id em .insert()
   
2. Dados aparecem vazios após login
   → Nenhum dado criado com esse user_id ainda (normal!)
   
3. Vê dados de outro usuário
   → RLS não está ativa (rode SQL novamente)
```

---

## 📞 SUPORTE RÁPIDO

**P: "Erro: policy already exists"**
- R: Limpe SQL Editor e rode script novamente

**P: "Não consegui inserir dado"**
- R: Certifique-se de estar autenticado + user_id passado

**P: "Mas e se não passar user_id?"**
- R: Com RLS ativa, vai dar erro. Mas tem DEFAULT na tabela que deveria preencher.

---

## ⏱️ TEMPO TOTAL

| O quê | Tempo |
|------|-------|
| SQL | 5 min |
| App.js | 45 min |
| Testes | 10 min |
| **Total** | **~1 hora** |

---

## 🎯 SÓ ISSO?

**Sim!** Depois disso:

✅ RLS ativo
✅ Dados isolados por usuário  
✅ Segurança OK
✅ Pronto para Produção

**Próxima tarefa:** Agendamentos/Gatilhos (item 3 da lista)

---

**Criado em:** 16 de Abril, 2026
**Atualizado por:** GitHub Copilot
**Tempo de leitura:** 3 minutos
