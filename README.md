# Radio Ibiza — Player & Admin

Sistema para criar previews curados de músicas para clientes da Radio Ibiza.

**Fluxo completo:**
1. Admin cola um link de playlist do Spotify → worker baixa as faixas no servidor
2. Admin escuta e aprova cada música (vai pro acervo)
3. Admin cria um preview pro cliente: seleciona faixas, define prazo, gera código
4. Cliente acessa via código, ouve, curte/não curte, deixa comentários
5. Admin vê o feedback compilado no painel
6. Quando termina, admin pode arquivar (mantém os dados, libera o espaço dos áudios)

---

## Arquitetura

```
┌──────────────────┐      ┌──────────────────┐
│   Netlify        │      │   Supabase       │
│  (frontend)      │◄────►│  Auth + DB       │
│  /admin /player  │      │  Storage + Edge  │
└──────────────────┘      │  Functions       │
                          └────────▲─────────┘
                                   │ lê fila
                          ┌────────┴─────────┐
                          │   Railway        │
                          │  Worker Python   │
                          │  (yt-dlp)        │
                          └──────────────────┘
```

**Custos esperados:**
- Netlify: grátis
- Supabase: grátis (free tier — 1GB de storage, 500MB de banco)
- Railway: ~US$ 5/mês (worker em Docker)
- Spotify API: grátis (só leitura de playlist pública)

**Total: ~US$ 5/mês**

---

## Setup completo

### Parte 1 — Supabase

#### 1.1 Criar projeto
1. https://supabase.com → New Project
2. Nome: `radio-ibiza`, defina senha forte do banco
3. Aguarde provisionar (~2 min)
4. Em **Settings → API**, anote:
   - `Project URL`
   - `anon public` key
   - `service_role` key (mantenha secreta!)

#### 1.2 Rodar o schema
1. **SQL Editor → New query**
2. Cole o conteúdo de `supabase/schema.sql`
3. Clique em **Run**

#### 1.3 Criar bucket de áudios
1. **Storage → New bucket**
2. Nome: `tracks`
3. **Desmarque** "Public bucket"
4. Salve

#### 1.4 Criar usuários admin
1. **Authentication → Users → Add user → Create new user**
2. Email + senha, marque **Auto Confirm User**
3. Crie quantos quiser

#### 1.5 Habilitar TOTP
1. **Authentication → Providers → Auth Settings**
2. Em "Multi-Factor Authentication", marque **Enable TOTP**
3. Salve

#### 1.6 Deploy das Edge Functions
```bash
npm install -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy get-preview --no-verify-jwt
supabase functions deploy save-feedback --no-verify-jwt
```

### Parte 2 — Worker no Railway

Siga o tutorial detalhado em [`worker/README.md`](worker/README.md). Resumo:

1. Crie app no Spotify Developer Dashboard, copie Client ID + Secret
2. Crie projeto no Railway conectado ao GitHub
3. Aponte Root Directory = `worker`
4. Adicione variáveis:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
5. Deploy

### Parte 3 — Frontend no Netlify

#### 3.1 Rodar localmente (opcional)
```bash
npm install
cp .env.example .env
# edite .env com URL e anon key do Supabase
npm run dev
```

#### 3.2 Deploy
1. Suba o código no GitHub
2. Netlify → **Add new site → Import from Git**
3. Build: `npm run build` · Publish: `dist`
4. Em **Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

---

## Como usar (admin)

### Importar uma playlist do Spotify
1. Vá em **Downloads**
2. Cole o link da playlist (formato `https://open.spotify.com/playlist/...`)
3. Clique em **Baixar playlist**
4. Acompanhe o progresso na tabela (atualiza sozinho a cada 5s)
5. Quando terminar, vá em **Acervo → Pendentes**

### Aprovar músicas
1. **Acervo → Pendentes**
2. Clique no botão de play pra ouvir cada faixa
3. **✓ Aprovar** — vai pro acervo aprovado e pode ser usada em previews
4. **Rejeitar** — remove o arquivo

### Criar preview pro cliente
1. **Previews → + Novo preview**
2. Digite o nome do cliente
3. Sistema gera código automaticamente (regenerável)
4. Defina dias de validade
5. Selecione as músicas aprovadas e reordene
6. Salvar
7. Na tela do preview, copie o link e envie pro cliente

### Ver o feedback do cliente
1. Abra o preview
2. Aba **Feedback do cliente**
3. Vê estatísticas (curtidas, descurtidas, comentários) + detalhe por faixa

### Arquivar
1. Quando o trabalho com o cliente acabar, abra o preview
2. Clique em **📦 Arquivar**
3. **Mantém**: nome do cliente, código, lista de músicas (nomes), votos, comentários, logs
4. **Remove**: arquivos de áudio (só se a música não estiver em nenhum outro preview ativo)

---

## Como usa (cliente)

1. Recebe link `https://seusite.netlify.app/player/IBZ-7K9M2`
2. (Ou entra em `/player` e digita o código)
3. Tem o player com todas as músicas
4. Em cada faixa pode:
   - Curtir (♥) ou não curtir (✕)
   - Deixar um comentário escrito
5. Pode mudar de ideia quantas vezes quiser — sempre vale o último voto/comentário
6. O cliente nunca precisa de senha, só do código

---

## Estrutura

```
radio-ibiza/
├── netlify.toml
├── package.json
├── vite.config.js
├── index.html
├── .env.example
├── README.md                       ← este arquivo
│
├── supabase/
│   ├── schema.sql                  ← rode no SQL Editor
│   └── functions/
│       ├── get-preview/index.ts    ← valida código + URLs assinadas
│       └── save-feedback/index.ts  ← salva voto/comentário
│
├── worker/                         ← roda no Railway
│   ├── worker.py                   ← polling + download yt-dlp
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── railway.toml
│   └── README.md                   ← tutorial passo a passo
│
└── src/
    ├── main.jsx
    ├── lib/supabase.js
    ├── styles/global.css
    └── pages/
        ├── Home.jsx
        ├── AdminLogin.jsx          ← email/senha + Google Authenticator
        ├── AdminApp.jsx            ← shell com tabs
        ├── Player.jsx              ← player do cliente + curtidas
        └── admin/
            ├── PreviewsList.jsx    ← lista (ativos / arquivados)
            ├── PreviewEditor.jsx   ← criar/editar
            ├── PreviewDetail.jsx   ← info + feedback + logs + arquivar
            ├── TracksLibrary.jsx   ← pendentes / aprovadas
            └── Downloads.jsx       ← fila de jobs do Spotify
```

---

## Notas de segurança

- Bucket de áudios é **privado**. O player recebe URLs assinadas que expiram em 1h
- O player tem `controlsList="nodownload"` e bloqueia menu de contexto
- Admin sempre exige TOTP após o setup inicial
- Worker usa `service_role` key — **nunca** exponha ela no frontend, só no Railway
- Acessos do cliente são identificados por um session id no localStorage do navegador (não há login)
- O Spotify Client Secret só vive no Railway

## Sobre o uso do yt-dlp e direitos autorais

O worker usa metadados públicos da Spotify API para identificar as músicas e busca o áudio correspondente no YouTube via `yt-dlp`. Reproduzir conteúdo do YouTube fora da plataforma viola os Termos de Uso do YouTube; o uso comercial dos áudios também depende de licenciamento adequado. Imagino que como empresa de identidade sonora você opere com licenciamento e use o sistema como ferramenta interna de validação com o cliente antes do trabalho final licenciado.
