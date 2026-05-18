-- ============================================================
-- Radio Ibiza — Schema v2
-- Rode este SQL UMA VEZ no editor SQL do Supabase
-- (Se já rodou o schema v1, este script é idempotente — pode rodar de novo)
-- ============================================================

-- ---------- Tabela: tracks ----------
create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  storage_path text,
  duration_seconds int,
  status text not null default 'approved',  -- 'pending_review' | 'approved' | 'archived'
  source text,                              -- 'manual' | 'spotify'
  source_ref text,                          -- URL original (Spotify track)
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

alter table tracks add column if not exists status text not null default 'approved';
alter table tracks add column if not exists source text;
alter table tracks add column if not exists source_ref text;
alter table tracks alter column storage_path drop not null;

create index if not exists idx_tracks_status on tracks(status);

-- ---------- Tabela: previews ----------
create table if not exists previews (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  client_name text not null,
  days_valid int not null default 7,
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id),
  is_active boolean default true,
  is_archived boolean default false,
  archived_at timestamptz
);

alter table previews add column if not exists is_archived boolean default false;
alter table previews add column if not exists archived_at timestamptz;

-- ---------- Tabela: preview_tracks ----------
create table if not exists preview_tracks (
  preview_id uuid references previews(id) on delete cascade,
  track_id uuid references tracks(id) on delete cascade,
  position int not null default 0,
  primary key (preview_id, track_id)
);

-- ---------- Tabela: access_logs ----------
create table if not exists access_logs (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid references previews(id) on delete cascade,
  client_session text,
  accessed_at timestamptz default now(),
  user_agent text,
  ip_hash text
);

alter table access_logs add column if not exists client_session text;

create index if not exists idx_access_logs_preview on access_logs(preview_id, accessed_at desc);
create index if not exists idx_previews_code on previews(code);

-- ============================================================
-- Feedback do cliente
-- ============================================================
create table if not exists track_feedback (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid references previews(id) on delete cascade not null,
  track_id uuid references tracks(id) on delete cascade not null,
  client_session text not null,
  vote smallint,                            -- 1 curtiu, -1 não curtiu, NULL só comentário
  comment text,
  updated_at timestamptz default now(),
  unique (preview_id, track_id, client_session)
);

create index if not exists idx_feedback_preview on track_feedback(preview_id);

-- ============================================================
-- Fila de downloads (Spotify -> YouTube via worker)
-- ============================================================
create table if not exists download_jobs (
  id uuid primary key default gen_random_uuid(),
  spotify_url text not null,
  status text not null default 'queued',    -- queued | processing | done | failed
  total_tracks int default 0,
  completed_tracks int default 0,
  error_message text,
  created_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id)
);

create table if not exists download_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references download_jobs(id) on delete cascade not null,
  title text not null,
  artist text,
  spotify_url text,
  status text not null default 'pending',   -- pending | downloading | done | failed | skipped
  track_id uuid references tracks(id) on delete set null,
  error_message text,
  updated_at timestamptz default now()
);

create index if not exists idx_jobs_status on download_jobs(status, created_at);
create index if not exists idx_job_items_job on download_job_items(job_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table tracks enable row level security;
alter table previews enable row level security;
alter table preview_tracks enable row level security;
alter table access_logs enable row level security;
alter table track_feedback enable row level security;
alter table download_jobs enable row level security;
alter table download_job_items enable row level security;

drop policy if exists "admins full access tracks" on tracks;
drop policy if exists "admins full access previews" on previews;
drop policy if exists "admins full access preview_tracks" on preview_tracks;
drop policy if exists "admins read logs" on access_logs;
drop policy if exists "admins insert logs" on access_logs;
drop policy if exists "anon can read active previews by code" on previews;
drop policy if exists "anon can read preview_tracks for active previews" on preview_tracks;
drop policy if exists "anon can read tracks via active preview" on tracks;
drop policy if exists "anon can read approved tracks via active preview" on tracks;
drop policy if exists "anon can insert access logs" on access_logs;
drop policy if exists "admins full access feedback" on track_feedback;
drop policy if exists "anon can read feedback for active preview" on track_feedback;
drop policy if exists "anon can insert feedback for active preview" on track_feedback;
drop policy if exists "anon can update own feedback" on track_feedback;
drop policy if exists "admins full access download jobs" on download_jobs;
drop policy if exists "admins full access download items" on download_job_items;

create policy "admins full access tracks" on tracks
  for all using (auth.role() = 'authenticated');
create policy "admins full access previews" on previews
  for all using (auth.role() = 'authenticated');
create policy "admins full access preview_tracks" on preview_tracks
  for all using (auth.role() = 'authenticated');
create policy "admins read logs" on access_logs
  for select using (auth.role() = 'authenticated');
create policy "admins full access feedback" on track_feedback
  for all using (auth.role() = 'authenticated');
create policy "admins full access download jobs" on download_jobs
  for all using (auth.role() = 'authenticated');
create policy "admins full access download items" on download_job_items
  for all using (auth.role() = 'authenticated');

create policy "anon can read active previews by code" on previews
  for select using (is_active = true and is_archived = false and expires_at > now());

create policy "anon can read preview_tracks for active previews" on preview_tracks
  for select using (
    exists (
      select 1 from previews p
      where p.id = preview_tracks.preview_id
      and p.is_active = true and p.is_archived = false and p.expires_at > now()
    )
  );

create policy "anon can read approved tracks via active preview" on tracks
  for select using (
    status = 'approved' and exists (
      select 1 from preview_tracks pt
      join previews p on p.id = pt.preview_id
      where pt.track_id = tracks.id
      and p.is_active = true and p.is_archived = false and p.expires_at > now()
    )
  );

create policy "anon can insert access logs" on access_logs
  for insert with check (
    exists (
      select 1 from previews p
      where p.id = access_logs.preview_id
      and p.is_active = true and p.is_archived = false and p.expires_at > now()
    )
  );

create policy "anon can read feedback for active preview" on track_feedback
  for select using (
    exists (
      select 1 from previews p
      where p.id = track_feedback.preview_id
      and p.is_active = true and p.is_archived = false and p.expires_at > now()
    )
  );
create policy "anon can insert feedback for active preview" on track_feedback
  for insert with check (
    exists (
      select 1 from previews p
      where p.id = track_feedback.preview_id
      and p.is_active = true and p.is_archived = false and p.expires_at > now()
    )
  );
create policy "anon can update own feedback" on track_feedback
  for update using (
    exists (
      select 1 from previews p
      where p.id = track_feedback.preview_id
      and p.is_active = true and p.is_archived = false and p.expires_at > now()
    )
  );

-- ============================================================
-- Storage bucket 'tracks' (privado) — policies (idempotente)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'admins can upload tracks'
  ) then
    create policy "admins can upload tracks"
      on storage.objects for insert
      with check (bucket_id = 'tracks' and auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'admins can read tracks'
  ) then
    create policy "admins can read tracks"
      on storage.objects for select
      using (bucket_id = 'tracks' and auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'admins can delete tracks'
  ) then
    create policy "admins can delete tracks"
      on storage.objects for delete
      using (bucket_id = 'tracks' and auth.role() = 'authenticated');
  end if;
end$$;
