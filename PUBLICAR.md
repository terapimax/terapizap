# Publicar o painel do ZapFlow na Vercel

Hoje o painel roda só no seu computador (`localhost:3002`). Publicando na Vercel ele ganha um
endereço na internet (ex.: `https://zapflow-seunome.vercel.app`) e funciona de qualquer lugar.
O plano gratuito da Vercel basta. Leva uns 10 minutos e só precisa ser feito uma vez:
depois disso, toda atualização enviada ao GitHub é publicada sozinha.

O código já está pronto para isso. Faltam só os passos abaixo, que dependem das suas contas.

## 1. Atualizar o banco (Supabase)

1. Abra o seu projeto em <https://supabase.com/dashboard> e entre em **SQL Editor**.
2. Cole todo o conteúdo do arquivo `supabase/setup.sql` e clique em **Run**.
   Pode rodar quantas vezes quiser: ele não apaga nem duplica nada.
3. Em **Table Editor** devem aparecer **17 tabelas**.

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
   A versão deve ser **3.11.0** ou maior.
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
- **Quero um endereço próprio (meusite.com.br)**: em **Settings → Domains** do projeto na
  Vercel. Depois repita os passos 3 e 4 com o endereço novo.
- **Os envios continuam precisando do WhatsApp Web aberto?** Sim. Publicar o painel não muda
  isso: quem envia é a extensão, no seu navegador.
