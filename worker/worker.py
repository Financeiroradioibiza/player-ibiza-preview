"""
Radio Ibiza — Worker de downloads (v2 — sem API do Spotify)
============================================================
Em vez da API oficial (que mudou e exige OAuth de usuário desde fev/2026),
este worker faz scraping da página de embed pública do Spotify, que devolve
o JSON da playlist sem precisar de autenticação.

Fluxo:
1. Polling na tabela download_jobs
2. Para cada job: lê a playlist via embed scraping
3. Para cada faixa: busca no YouTube + baixa via yt-dlp
4. Sobe para o bucket 'tracks' do Supabase
5. Cria registro em 'tracks' com status='pending_review'

Variáveis de ambiente:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  POLL_INTERVAL_SECONDS (opcional, default 10)

Variáveis de SPOTIFY não são mais necessárias.
"""

import os
import re
import json
import time
import uuid
import logging
import tempfile
import html as html_module
from pathlib import Path

import requests
from supabase import create_client, Client

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
log = logging.getLogger("worker")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POLL = int(os.environ.get("POLL_INTERVAL_SECONDS", "10"))
YOUTUBE_COOKIES = os.environ.get("YOUTUBE_COOKIES", "").strip()

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Cookies não são mais usados (usamos API RapidAPI), mas a env var pode existir.
COOKIES_PATH = None


# ============================================================
# Spotify (scraping da página embed pública)
# ============================================================
class SpotifyEmbedScraper:
    """
    Lê o conteúdo de uma playlist via página /embed/playlist/<id>,
    que serve o JSON inline em uma tag <script id="__NEXT_DATA__">.
    Não precisa de autenticação.
    """

    UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")

    @staticmethod
    def extract_playlist_id(url: str) -> str:
        m = re.search(r"playlist[/:]([A-Za-z0-9]+)", url)
        if m:
            return m.group(1)
        if re.match(r"^[A-Za-z0-9]+$", url):
            return url
        raise ValueError("URL de playlist inválida")

    def fetch_playlist(self, url: str) -> list[dict]:
        pid = self.extract_playlist_id(url)
        embed_url = f"https://open.spotify.com/embed/playlist/{pid}"
        log.info(f"  Buscando embed: {embed_url}")

        resp = requests.get(
            embed_url,
            headers={"User-Agent": self.UA, "Accept-Language": "en-US,en;q=0.9"},
            timeout=30,
        )
        resp.raise_for_status()

        # O HTML contém uma tag <script id="__NEXT_DATA__" ...>{JSON}</script>
        html = resp.text
        m = re.search(
            r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
            html,
            re.DOTALL,
        )
        if not m:
            raise RuntimeError(
                "Não consegui localizar dados da playlist. "
                "Verifique se a playlist é pública."
            )

        raw = html_module.unescape(m.group(1))
        data = json.loads(raw)

        # Estrutura: props.pageProps.state.data.entity.trackList[]
        try:
            entity = data["props"]["pageProps"]["state"]["data"]["entity"]
            track_list = entity.get("trackList") or []
        except (KeyError, TypeError):
            raise RuntimeError("Formato inesperado do JSON da playlist")

        tracks = []
        for t in track_list:
            title = t.get("title") or t.get("name")
            artist_field = t.get("subtitle") or ""
            if not artist_field and t.get("artists"):
                artist_field = ", ".join(a.get("name", "") for a in t["artists"])
            if not title:
                continue
            tracks.append({
                "title": title.strip(),
                "artist": artist_field.strip() or "Desconhecido",
                "uri": t.get("uri"),
            })

        if not tracks:
            raise RuntimeError(
                "A playlist parece vazia ou inacessível publicamente. "
                "Confirme que ela é pública (não privada/colaborativa)."
            )

        return tracks


scraper = SpotifyEmbedScraper()


# ============================================================
# Download via RapidAPI (YouTube MP3 — youtube-mp36.p.rapidapi.com)
# ============================================================

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = "youtube-mp36.p.rapidapi.com"


def search_youtube_id(title: str, artist: str) -> str | None:
    """
    Busca o primeiro resultado no YouTube via scraping (sem precisar de API).
    Retorna o ID do vídeo (11 caracteres) ou None.
    """
    query = f"{artist} {title} audio".strip()
    encoded = requests.utils.quote(query)
    url = f"https://www.youtube.com/results?search_query={encoded}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        r = requests.get(url, headers=headers, timeout=20)
        r.raise_for_status()
        # Os IDs aparecem no formato "videoId":"XXXXXXXXXXX" no HTML
        matches = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', r.text)
        if matches:
            return matches[0]
    except Exception as e:
        log.warning("Falha buscando no YouTube: %s", e)
    return None


def get_mp3_link(title: str, artist: str) -> tuple[str, int]:
    """
    Obtém o link MP3 e duração de uma música via RapidAPI.
    NÃO baixa — apenas retorna o link pra o navegador do usuário baixar.
    """
    if not RAPIDAPI_KEY:
        raise RuntimeError("RAPIDAPI_KEY não configurada nas variáveis do Railway")

    video_id = search_youtube_id(title, artist)
    if not video_id:
        raise RuntimeError(f"Vídeo não encontrado no YouTube para: {artist} - {title}")

    api_url = f"https://{RAPIDAPI_HOST}/dl"
    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY,
    }
    params = {"id": video_id}

    last_response = None
    for attempt in range(4):
        try:
            r = requests.get(api_url, headers=headers, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            last_response = data
            status = data.get("status", "").lower()
            if status == "ok" and data.get("link"):
                return data["link"], int(data.get("duration") or 0)
            elif status == "processing":
                log.info("  API processando, aguardando... (tentativa %d/4)", attempt + 1)
                time.sleep(5)
                continue
            elif status == "fail":
                raise RuntimeError(f"API falhou: {data.get('msg', 'sem mensagem')}")
            else:
                time.sleep(3)
        except requests.HTTPError as e:
            raise RuntimeError(f"Erro HTTP na API: {e}")

    raise RuntimeError(f"API não retornou link após 4 tentativas. Última resposta: {last_response}")


# ============================================================
# Supabase helpers
# ============================================================
def upload_to_storage(local_path: Path, remote_name: str) -> str:
    # Detecta content-type pela extensão
    content_type = "audio/mpeg" if local_path.suffix.lower() == ".mp3" else "audio/mp4"
    with open(local_path, "rb") as f:
        sb.storage.from_("tracks").upload(
            path=remote_name,
            file=f,
            file_options={"content-type": content_type, "upsert": "false"},
        )
    return remote_name


def update_job(job_id: str, **fields):
    sb.table("download_jobs").update(fields).eq("id", job_id).execute()


def update_item(item_id: str, **fields):
    sb.table("download_job_items").update(fields).eq("id", item_id).execute()


# ============================================================
# Processamento de 1 job
# ============================================================
def process_job(job: dict):
    job_id = job["id"]
    log.info(f"Processando job {job_id} — playlist {job['spotify_url']}")
    update_job(job_id, status="processing", started_at="now()")

    try:
        tracks_info = scraper.fetch_playlist(job["spotify_url"])
        log.info(f"  Playlist tem {len(tracks_info)} faixas")
    except Exception as e:
        log.exception("Erro lendo playlist do Spotify")
        update_job(job_id, status="failed",
                   error_message=f"Spotify: {e}", finished_at="now()")
        return

    items_payload = [{
        "job_id": job_id,
        "title": t["title"],
        "artist": t["artist"],
        "spotify_url": t.get("uri") or "",
        "status": "pending",
    } for t in tracks_info]
    res = sb.table("download_job_items").insert(items_payload).execute()
    items = res.data
    update_job(job_id, total_tracks=len(items))

    completed = 0
    for item in items:
        try:
            update_item(item["id"], status="processing")
            log.info(f"  → {item['title']} — {item['artist']}")

            # Apenas obtém o link MP3, NÃO baixa
            mp3_link, duration = get_mp3_link(
                item["title"], item["artist"] or ""
            )

            update_item(item["id"],
                        status="ready",
                        mp3_url=mp3_link,
                        duration_seconds=duration,
                        error_message=None)
            completed += 1
            update_job(job_id, completed_tracks=completed)
        except Exception as e:
            log.exception(f"  ✗ falha em {item['title']}")
            update_item(item["id"], status="failed",
                        error_message=str(e)[:300])

    update_job(job_id, status="done", finished_at="now()")
    log.info(f"Job {job_id} concluído: {completed}/{len(items)} links obtidos")


# ============================================================
# Loop principal
# ============================================================
def main_loop():
    log.info(f"Worker iniciado (v3 — RapidAPI). Polling a cada {POLL}s.")
    if RAPIDAPI_KEY:
        log.info("RAPIDAPI_KEY configurada (ok).")
    else:
        log.error("RAPIDAPI_KEY NÃO está configurada! Configure no Railway.")
    while True:
        try:
            res = sb.table("download_jobs") \
                .select("*") \
                .eq("status", "queued") \
                .order("created_at") \
                .limit(1) \
                .execute()
            jobs = res.data
            if jobs:
                process_job(jobs[0])
            else:
                time.sleep(POLL)
        except Exception:
            log.exception("Erro no loop principal")
            time.sleep(POLL)


if __name__ == "__main__":
    main_loop()
