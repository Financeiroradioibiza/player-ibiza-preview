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
import yt_dlp

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

# Salva cookies do YouTube em arquivo (se a env var estiver definida)
COOKIES_PATH = None
if YOUTUBE_COOKIES:
    COOKIES_PATH = "/tmp/yt_cookies.txt"
    with open(COOKIES_PATH, "w") as f:
        f.write(YOUTUBE_COOKIES)
    log.info("Cookies do YouTube carregados.")
else:
    log.warning("YOUTUBE_COOKIES não definido. YouTube pode bloquear o download.")


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
# yt-dlp — busca e baixa o áudio do YouTube
# ============================================================
def download_track(title: str, artist: str, out_dir: Path) -> tuple[Path, int]:
    query = f"ytsearch1:{title} {artist} audio"
    out_template = str(out_dir / f"{uuid.uuid4()}.%(ext)s")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "m4a",
            "preferredquality": "192",
        }],
        "default_search": "ytsearch",
        # Headers que imitam um navegador comum
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0 Safari/537.36"
            ),
        },
        # Usa o cliente "android" do YouTube, que sofre menos com bot detection
        "extractor_args": {
            "youtube": {"player_client": ["android", "web"]},
        },
    }
    if COOKIES_PATH:
        opts["cookiefile"] = COOKIES_PATH

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(query, download=True)
        if "entries" in info:
            info = info["entries"][0]
        duration = int(info.get("duration") or 0)
        files = list(out_dir.glob("*.m4a"))
        if not files:
            raise RuntimeError("Arquivo de áudio não foi gerado")
        return files[-1], duration


# ============================================================
# Supabase helpers
# ============================================================
def upload_to_storage(local_path: Path, remote_name: str) -> str:
    with open(local_path, "rb") as f:
        sb.storage.from_("tracks").upload(
            path=remote_name,
            file=f,
            file_options={"content-type": "audio/mp4", "upsert": "false"},
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
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for item in items:
            try:
                update_item(item["id"], status="downloading")
                log.info(f"  ↓ {item['title']} — {item['artist']}")

                local_path, duration = download_track(
                    item["title"], item["artist"] or "", tmp_path
                )

                ext = local_path.suffix.lstrip(".")
                remote_name = f"{uuid.uuid4()}.{ext}"
                upload_to_storage(local_path, remote_name)
                local_path.unlink(missing_ok=True)

                track_res = sb.table("tracks").insert({
                    "preview_id": job.get("preview_id"),
                    "title": item["title"],
                    "artist": item["artist"] or "Desconhecido",
                    "storage_path": remote_name,
                    "duration_seconds": duration or None,
                    "status": "pending_review",
                    "source": "spotify",
                    "source_ref": item["spotify_url"],
                    "created_by": job.get("created_by"),
                }).execute()
                track_id = track_res.data[0]["id"]

                update_item(item["id"], status="done",
                            track_id=track_id, error_message=None)
                completed += 1
                update_job(job_id, completed_tracks=completed)
            except Exception as e:
                log.exception(f"  ✗ falha em {item['title']}")
                update_item(item["id"], status="failed",
                            error_message=str(e)[:300])

    update_job(job_id, status="done", finished_at="now()")
    log.info(f"Job {job_id} concluído: {completed}/{len(items)} faixas")


# ============================================================
# Loop principal
# ============================================================
def main_loop():
    log.info(f"Worker iniciado (v2 — embed scraping). Polling a cada {POLL}s.")
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
