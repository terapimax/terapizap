# Publicar o painel do ZapFlow na Vercel

O projeto **zapflow** publica o painel em [zapflow1.vercel.app](https://zapflow1.vercel.app/auth/login).
A Vercel usa a pasta `zapflow-app` da branch `main` do repositório `terapimax/terapizap`.
Para atualizar uma instalação existente, siga a seção da versão abaixo.

## 1. Preparar o banco de uma nova instalação (Supabase)

1. Abra o seu projeto em <https://supabase.com/dashboard> e entre em **SQL Editor**.
2. Cole todo o conteúdo do arquivo `supabase/setup.sql` e clique em **Run**.
   O instalador também migra dados de versões anteriores e reúne leads com telefone repetido.
3. Em **Table Editor**, o esquema atual do ZapFlow tem **26 tabelas**.

### Atualizar para a versão 3.20 (resumo do dia automático)

1. No SQL Editor do projeto, execute `supabase/atualizar_resumo_3_20.sql`. Ele instala a reserva que impede dois resumos no mesmo dia. Sem ele, o resumo automático não liga (o painel continua funcionando).
2. Publique o painel pela branch `main`. Em **Agente › Gerente › Resumo do dia**, ligue **Gerar sozinho todo dia** e escolha a hora.
3. Em `chrome://extensions`, recarregue o ZapFlow, confira a versão **3.21.0** e atualize a aba do WhatsApp Web.

Como funciona: não existe servidor, então o resumo sai quando o painel ou o WhatsApp Web com a extensão estiver aberto depois da hora escolhida. É uma chamada por dia, com a chave de IA da própria conta. Com os dois abertos, só um gera. Se a IA falhar, ele tenta de novo em 15 minutos e avisa uma vez na tela.

### Cuidado ao atualizar a biblioteca WA-JS

O arquivo `extension/wppconnect-wa.js` **não é o pacote original**: é a WA-JS 4.8.2 com trechos ajustados para as versões atuais do WhatsApp Web (identificador da conta, chave de mensagem, espera dos módulos). Sem esses ajustes o envio falha com `getMeLidUserOrThrow is not a function`.

- Nunca troque o arquivo por uma cópia nova da WA-JS. Use `node tools/prepare-wa-library.mjs <pasta extraída do pacote 4.8.2>`, que recria o arquivo com os ajustes e confere o pacote por hash.
- Se o WhatsApp mudar de novo e o envio quebrar, o erro aparece no console da aba (F12) com o prefixo `ZapFlow engine`. O conserto é atualizar esse script e gerar o arquivo de novo, não editar o arquivo gerado à mão.
- Depois de qualquer mudança nele, rode `node tools/tests/extension.test.cjs`.

### Atualizar os funis da versão 3.18 para a 3.19

1. No SQL Editor do projeto, execute `supabase/atualizar_funis_3_19.sql`. Ele instala a função que salva a nova ordem dos passos.
2. Publique o painel pela branch `main`. Em **Funis**, clique no relógio ou no item para editar a espera. Arraste pela alça ao lado do número para mover o passo com seu intervalo.
3. Aguarde a conclusão dos disparos que deseja manter em andamento. Em `chrome://extensions`, recarregue o ZapFlow, confira a versão **3.19.0** ou posterior e atualize a aba do WhatsApp Web. Recarregar essa aba interrompe os funis que ainda estão rodando nela.

### Atualizar uma instalação existente para a versão 3.18

1. No projeto Supabase desta instalação, abra **SQL Editor → New query**, cole o conteúdo de
   `supabase/atualizar_3_18.sql` e clique em **Run**. Esse arquivo ajusta as permissões e instala a
   função que confirma a restauração de um backup inteiro em uma transação.
2. Envie as correções para a branch `main`. No GitHub, aguarde a confirmação
   **Vercel – zapflow** no commit e abra a tela de login do painel.
3. No Chrome, abra `chrome://extensions`, localize o ZapFlow e clique em **Recarregar**. Confira
   a versão **3.18.1**. Volte à aba do WhatsApp Web e pressione **Ctrl + R**.
4. Abra a conversa com você mesmo e teste um texto e um áudio da biblioteca. **Pronto** indica
   que a extensão pode enviar. Em **Modo manual**, escolha o item e confirme no botão **Enviar**
   do WhatsApp. Nesse modo o áudio é preparado como anexo.

## 2. Criar o projeto na Vercel

1. Entre em <https://vercel.com> com a conta que você quer usar para o ZapFlow.
   O jeito mais simples é **Continue with GitHub**, com a conta do GitHub que tem o repositório.
2. Clique em **Add New… → Project** e, na lista, escolha o repositório do ZapFlow (**Import**).
   Se ele não aparecer, clique em **Adjust GitHub App Permissions** e libere o repositório.
3. Na tela de configuração:
   - **Root Directory**: clique em **Edit** e escolha a pasta **`zapflow-app`**. Este passo é
     obrigatório: sem ele a Vercel publica o painel antigo.
   - **Framework Preset**: deve aparecer **Next.js** sozinho.
   - **Environment Variables**: crie as duas abaixo. Os valores estão no arquivo
     `zapflow-app/.env.local` do seu computador (copie o que vem depois do `=`).

     | Nome | Valor |
     |---|---|
     | `NEXT_PUBLIC_SUPABASE_URL` | o endereço do seu projeto Supabase |
     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave pública do Supabase |

4. Clique em **Deploy** e espere terminar (1 a 2 minutos).
5. Copie o endereço que a Vercel mostrar (termina em `.vercel.app`). Esse é o seu painel.

## 3. Avisar o Supabase do endereço novo

Sem isto, o link de confirmação de e-mail continua apontando para o `localhost`.

1. No Supabase, abra **Authentication → URL Configuration**.
2. Em **Site URL**, cole o endereço do painel (ex.: `https://zapflow-seunome.vercel.app`).
3. Em **Redirect URLs**, clique em **Add URL** e adicione o mesmo endereço com `/**` no fim
   (ex.: `https://zapflow-seunome.vercel.app/**`). Deixe também `http://localhost:3002/**`
   se ainda quiser usar o painel no computador.
4. Salve.

## 4. Apontar a extensão para o painel publicado

1. Em `chrome://extensions`, clique em **recarregar** (a seta circular) no ZapFlow.
   A versão deve ser **3.12.0** ou maior.
2. Abra o WhatsApp Web, abra o ZapFlow e vá em **Ajustes → Painel**.
3. Cole o endereço do painel e aperte Enter.

Pronto: o menu ☰ e os botões “Abrir no painel” passam a abrir o painel publicado.

## Conferir se deu certo

- Abra o endereço da Vercel, entre com o seu e-mail e senha: seus dados devem aparecer.
- No WhatsApp Web, menu ☰ → **Abrir o painel** deve abrir o endereço novo.

## Dúvidas comuns

- **A página abre mas não carrega os dados / erro ao entrar**: confira as duas variáveis no
  passo 2 (em **Settings → Environment Variables** do projeto na Vercel). Depois de corrigir,
  vá em **Deployments → ⋯ → Redeploy**.
- **Apareceu o painel antigo**: o **Root Directory** não ficou como `zapflow-app`
  (em **Settings → Build and Deployment**). Corrija e faça **Redeploy**.
- **Quero um endereço próprio (meusite.com.br)**: veja “Marca própria” logo abaixo.
- **Os envios continuam precisando do WhatsApp Web aberto?** Sim. Publicar o painel não muda
  isso: quem envia é a extensão, no seu navegador.

## Foto de perfil dos leads

A extensão (versão **3.15.0** ou maior) busca a foto de perfil do WhatsApp e mostra no painel, em
**Leads**, no **Kanban** e na ficha do lead. Quem não tem foto (ou esconde pela privacidade do
WhatsApp) continua com as iniciais.

- **Não precisa mexer no banco**: a foto usa a coluna e a pasta de arquivos que já existem.
- Ao recarregar a extensão, o Chrome pode pedir para **aceitar uma nova permissão** (acesso aos
  endereços do WhatsApp para baixar as fotos). Aceite. Sem isso a foto não aparece.
- A foto aparece quando você abre a conversa e quando um lead novo chega. Os leads antigos são
  preenchidos aos poucos, **um a cada 12–25 segundos**, enquanto o WhatsApp Web estiver aberto
  (uns 150 por hora, começando pelos contatos mais recentes). Isso é de propósito, para não
  chamar a atenção do WhatsApp.
- A cópia é pequena (96 px, uns 5 KB) e fica na sua conta. É renovada a cada 30 dias e apagada
  quando o lead é excluído. Contatos com etiqueta de ignorar nunca têm foto guardada.
- Para desligar: **Ajustes da extensão → Guardar a foto de perfil dos leads**.

## Marca própria (white label)

Em **Configurações → Marca**, cada conta troca o nome, envia o logotipo horizontal e o ícone
quadrado e liga um domínio próprio. A extensão usa a mesma marca sozinha (ela lê do banco ao
abrir o WhatsApp Web). Precisa do `supabase/setup.sql` atualizado (passo 1).

### Domínio próprio por conta

O domínio é salvo na conta e precisa ser ligado ao projeto na Vercel. Há dois jeitos:

**Automático (recomendado se você vai ter vários clientes).** O painel adiciona o domínio na
Vercel sozinho quando o cliente clica em **Conectar**. Para isso, crie mais estas variáveis em
**Settings → Environment Variables** do projeto e faça **Redeploy**:

| Nome | Valor |
|---|---|
| `VERCEL_TOKEN` | um token criado em <https://vercel.com/account/tokens> |
| `VERCEL_PROJECT_ID` | em **Settings → General → Project ID** do projeto |
| `VERCEL_TEAM_ID` | só se o projeto for de um time: **Settings → General → Team ID** do time |

O token dá acesso à sua conta da Vercel: guarde só nas variáveis do projeto, nunca no código.

**Manual.** Sem essas variáveis, o cliente salva o domínio em Configurações e você adiciona o
mesmo domínio em **Settings → Domains** do projeto na Vercel.

No provedor do domínio, copie o CNAME ou A indicado pela Vercel para aquele projeto. Se a Vercel
pedir confirmação de propriedade, adicione também o TXT que ela informar.

Em **Configurações → Marca → Domínio próprio**, o resultado fica abaixo do campo. **Verificar
novamente** repete a consulta. Nos dois modos, **Conectado** indica que o navegador conseguiu
acessar esta instalação do painel pelo endereço HTTPS. Enquanto o acesso estiver pendente, a tela
repete a consulta a cada 30 segundos.

Se o cadastro usa confirmação de e-mail, inclua também `https://dominio-do-cliente/**` nas
**Redirect URLs** do Supabase (passo 3).

### Trocar o nome padrão da instalação inteira

Para que o nome padrão (antes de qualquer conta personalizar) não seja “ZapFlow”, crie a
variável `NEXT_PUBLIC_BRAND_NAME` na Vercel com o nome desejado e faça **Redeploy**.

### O que não muda sozinho

O nome e o ícone da extensão na lista do Chrome (`chrome://extensions`) vêm do arquivo
`extension/manifest.json` e da pasta `extension/icons`: são fixos por pacote da extensão. Para
entregar a um cliente com outro nome ali, edite esses arquivos antes de empacotar.
