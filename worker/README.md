# Worker de Downloads — Radio Ibiza

Este worker baixa as músicas de playlists do Spotify (via YouTube + yt-dlp) e sobe
pro Supabase Storage. Ele fica rodando em loop, checando a fila de jobs a cada 10s.

## Deploy no Railway (passo a passo, sem dev)

### 1. Credenciais do Spotify
Você precisa criar um "app" no Spotify pra ler as playlists.

1. Acesse https://developer.spotify.com/dashboard
2. Login com sua conta Spotify (qualquer uma)
3. Clique em **Create app**
4. Nome: `Radio Ibiza Worker` · Descrição: qualquer coisa
5. Redirect URI: `http://localhost` (não usa, mas pede)
6. Aceite os termos e crie
7. Na tela do app, clique em **Settings** e copie:
   - **Client ID**
   - **Client secret** (View client secret)

### 2. Criar conta no Railway
1. https://railway.app → **Login with GitHub**
2. No primeiro deploy você recebe US$ 5 de crédito grátis
3. Depois disso é US$ 5/mês fixo (Hobby plan) — esse uso cabe folgado

### 3. Subir o código pro GitHub
Como o frontend já vai estar no GitHub (pro Netlify), basta deixar a pasta `worker/`
junto no mesmo repositório.

### 4. Criar o serviço no Railway
1. No Railway: **New Project → Deploy from GitHub repo**
2. Selecione seu repositório `radio-ibiza`
3. Em **Settings → Root Directory**, coloque: `worker`
4. Railway detecta o Dockerfile e começa a fazer build

### 5. Adicionar as variáveis de ambiente
Em **Variables**, adicione (uma por linha, formato CHAVE=valor):

```
SUPABASE_URL=https://seuprojeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...sua-service-role-key
SPOTIFY_CLIENT_ID=seu-client-id-spotify
SPOTIFY_CLIENT_SECRET=seu-client-secret-spotify
```

> ⚠️ A `SUPABASE_SERVICE_ROLE_KEY` é a chave secreta que está em
> Supabase Dashboard → Settings → API → `service_role` key. **Nunca** coloque ela
> no frontend nem no GitHub público — ela só vai aqui no Railway.

### 6. Verificar
Depois do deploy, abra a aba **Deployments → View logs**. Deve aparecer:
```
[INFO] Worker iniciado. Polling a cada 10s.
```

Quando o admin criar um job no painel, vai aparecer:
```
[INFO] Processando job xxx — playlist https://open.spotify.com/playlist/...
[INFO]   ↓ Música 1 — Artista
[INFO]   ↓ Música 2 — Artista
...
[INFO] Job xxx concluído: 15/15 faixas
```

## Rodar localmente (opcional, pra testar)

```bash
cd worker
pip install -r requirements.txt
# Você precisa ter ffmpeg instalado: brew install ffmpeg / choco install ffmpeg

# Defina as variáveis de ambiente:
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SPOTIFY_CLIENT_ID=...
export SPOTIFY_CLIENT_SECRET=...

python worker.py
```

## Custos esperados

- Railway: ~US$ 5/mês (Hobby plan, o worker fica idle a maior parte do tempo)
- Supabase Storage: dentro do free tier (1GB ≈ 250 músicas)
- Spotify API: grátis (uso de leitura de playlist)

## Por que YouTube + yt-dlp e não Spotify direto?

A API do Spotify **não permite baixar** áudio dos catálogos comerciais — só dá
metadados (nome, artista, duração) e previews de 30s. O worker usa esses metadados
pra buscar a mesma música no YouTube, onde o áudio está disponível. É a abordagem
padrão de ferramentas como `spotdl`.

Lembre que reutilizar conteúdo do YouTube precisa de licenciamento adequado pro
uso comercial (que imagino sua empresa tenha como parte do serviço de identidade
sonora). O sistema é uma ferramenta de validação interna pro cliente.
