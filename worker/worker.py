"""
Radio Ibiza — Worker de downloads
==================================
Roda no Railway (ou qualquer servidor com Python 3.11+).

Faz polling na tabela download_jobs do Supabase. Quando vê um job 'queued':
1. Lê a playlist do Spotify (via API pública, app credentials)
2. Para cada faixa, busca no YouTube e baixa o áudio via yt-dlp (formato m4a)
3. Sobe pro bucket 'tracks' do Supabase Storage
4. Cria o registro na tabela 'tracks' com status='pending_review'
5. Atualiza o progresso a cada faixa
6. Marca o job como 'done' ou 'failed'

Variáveis de ambiente necessárias:
  SUPABASE_URL                  — URL do projeto Supabase
  SUPABASE_SERVICE_ROLE_KEY     — service_role key (SECRETA)
  SPOTIFY_CLIENT_ID             — App Spotify (developer.spotify.com)
  SPOTIFY_CLIENT_SECRET         — App Spotify
  POLL_INTERVAL_SECONDS         — opcional, default 10
"""

import os
import re
import time
import uuid
import base64
import logging
import tempfile
import traceback
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
SPOTIFY_ID = os.environ["SPOTIFY_CLIENT_ID"]
SPOTIFY_SECRET = os.environ["SPOTIFY_CLIENT_SECRET"]
POLL = int(os.environ.get("POLL_INTERVAL_SECONDS", "10"))

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ============================================================
# Spotify — lê playlist (só metadados públicos)
# ============================================================
class Spotify:
    def __init__(self, client_id, client_secret):
        self.client_id = client_id
        self.client_secret = client_secret
        self.token = None
        self.token_exp = 0

    def _auth(self):
        if self.token and time.time() < self.token_exp - 30:
            return self.token
        creds = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        r = requests.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            headers={"Authorization": f"Basic {creds}"},
            timeout=15,
        )
        r.raise_for_status()
        d = r.json()
        self.token = d["access_token"]
        self.token_exp = time.time() + d["expires_in"]
        return self.token

    def _get(self, url, params=None):
        tk = self._auth()
        r = requests.get(url, headers={"Authorization": f"Bearer {tk}"}, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    @staticmethod
    def extract_playlist_id(url: str) -> str:
        # Aceita https://open.spotify.com/playlist/<id>?...  ou só o id
        m = re.search(r"playlist[/:]([A-Za-z0-9]+)", url)
        if m:
            return m.group(1)
        if re.match(r"^[A-Za-z0-9]+$", url):
            return url
        raise ValueError("URL de playlist inválida")

    def get_playlist_tracks(self, playlist_url: str):
        pid = self.extract_playlist_id(playlist_url)
        url = f"https://api.spotify.com/v1/playlists/{pid}/tracks"
        params = {"limit": 100, "fields": "items(track(name,artists(name),external_urls,duration_ms)),next"}
        out = []
        while url:
            data = self._get(url, params=params)
            for item in data.get("items", []):
                tr = item.get("track")
                if not tr:
                    continue
                out.append({
                    "title": tr["name"],
                    "artist": ", ".join(a["name"] for a in tr.get("artists", [])),
                    "url": tr.get("external_urls", {}).get("spotify"),
                    "duration_ms": tr.get("duration_ms"),
                })
            url = data.get("next")
            params = None  # next URL já tem tudo
        return out


spotify = Spotify(SPOTIFY_ID, SPOTIFY_SECRET)


# ============================================================
# yt-dlp — busca e baixa do YouTube
# ============================================================
def download_track(title: str, artist: str, out_dir: Path) -> tuple[Path, int]:
    """
    Busca '<title> <artist>' no YouTube, baixa o melhor áudio,
    converte pra m4a e retorna (path, duracao_segundos).
    """
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
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(query, download=True)
        if "entries" in info:
            info = info["entries"][0]
        duration = int(info.get("duration") or 0)
        # arquivo final tem extensão .m4a depois do postprocessor
        base = Path(out_template.replace("%(ext)s", "m4a"))
        # mas o nome real usa o uuid que o yt-dlp resolveu; buscar pelo prefixo
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
        tracks_info = spotify.get_playlist_tracks(job["spotify_url"])
    except Exception as e:
        log.exception("Erro lendo playlist do Spotify")
        update_job(job_id, status="failed", error_message=f"Spotify: {e}", finished_at="now()")
        return

    if not tracks_info:
        update_job(job_id, status="failed", error_message="Playlist vazia ou inacessível", finished_at="now()")
        return

    # Cria os itens
    items_payload = [{
        "job_id": job_id,
        "title": t["title"],
        "artist": t["artist"],
        "spotify_url": t["url"],
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

                # download
                local_path, duration = download_track(item["title"], item["artist"] or "", tmp_path)

                # upload
                ext = local_path.suffix.lstrip(".")
                remote_name = f"{uuid.uuid4()}.{ext}"
                upload_to_storage(local_path, remote_name)
                local_path.unlink(missing_ok=True)

                # cria track em pending_review
                track_res = sb.table("tracks").insert({
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

                update_item(item["id"], status="done", track_id=track_id, error_message=None)
                completed += 1
                update_job(job_id, completed_tracks=completed)
            except Exception as e:
                log.exception(f"  ✗ falha em {item['title']}")
                update_item(item["id"], status="failed", error_message=str(e)[:300])

    update_job(job_id, status="done", finished_at="now()")
    log.info(f"Job {job_id} concluído: {completed}/{len(items)} faixas")


# ============================================================
# Loop principal
# ============================================================
def main_loop():
    log.info(f"Worker iniciado. Polling a cada {POLL}s.")
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
