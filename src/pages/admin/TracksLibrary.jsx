import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'

export default function TracksLibrary() {
  const [tab, setTab] = useState('pending') // pending | approved
  const [tracks, setTracks] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const status = tab === 'pending' ? 'pending_review' : 'approved'
    const { data } = await supabase
      .from('tracks')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
    setTracks(data || [])

    const { count } = await supabase
      .from('tracks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_review')
    setPendingCount(count || 0)
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 className="display" style={{ fontSize: 40, fontWeight: 400, letterSpacing: '-0.02em' }}>Acervo</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? 'música aguarda' : 'músicas aguardam'} sua aprovação`
              : 'Nenhuma música pendente'}
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Upload manual'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <Tab active={tab === 'pending'} onClick={() => setTab('pending')}>
          Pendentes {pendingCount > 0 && <span style={{
            marginLeft: 8, padding: '1px 8px', borderRadius: 999,
            background: 'var(--amber)', color: 'var(--ink)', fontSize: 11, fontWeight: 600,
          }}>{pendingCount}</span>}
        </Tab>
        <Tab active={tab === 'approved'} onClick={() => setTab('approved')}>Aprovadas</Tab>
      </div>

      {showForm && <UploadForm onDone={() => { setShowForm(false); load() }} />}

      {loading ? (
        <div className="muted">Carregando…</div>
      ) : tracks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p className="muted">
            {tab === 'pending'
              ? 'Nenhuma música pendente. Vá em Downloads para importar uma playlist.'
              : 'Nenhuma música aprovada ainda.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {tracks.map((t) => (
            <TrackRow key={t.id} track={t} mode={tab} onChange={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 16px',
      borderBottom: `2px solid ${active ? 'var(--cobalt)' : 'transparent'}`,
      color: active ? 'var(--cobalt)' : 'var(--muted)',
      fontWeight: 500, fontSize: 14, marginBottom: -1,
    }}>
      {children}
    </button>
  )
}

function TrackRow({ track, mode, onChange }) {
  const [url, setUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  async function loadUrl() {
    if (url) return url
    const { data } = await supabase.storage
      .from('tracks')
      .createSignedUrl(track.storage_path, 600)
    setUrl(data?.signedUrl)
    return data?.signedUrl
  }

  async function togglePlay() {
    if (!track.storage_path) return
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    const u = await loadUrl()
    if (!u) return
    if (audioRef.current) {
      audioRef.current.src = u
      audioRef.current.play()
    }
  }

  async function approve() {
    await supabase.from('tracks').update({ status: 'approved' }).eq('id', track.id)
    onChange()
  }

  async function reject() {
    if (!confirm(`Rejeitar "${track.title}"? O arquivo será removido.`)) return
    if (track.storage_path) {
      await supabase.storage.from('tracks').remove([track.storage_path])
    }
    await supabase.from('tracks').delete().eq('id', track.id)
    onChange()
  }

  async function remove() {
    if (!confirm(`Excluir "${track.title}"? Previews que usam essa faixa serão afetados.`)) return
    if (track.storage_path) {
      await supabase.storage.from('tracks').remove([track.storage_path])
    }
    await supabase.from('tracks').delete().eq('id', track.id)
    onChange()
  }

  function fmtDuration(s) {
    if (!s) return '—'
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
      <button onClick={togglePlay} disabled={!track.storage_path} style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--ink)', color: 'var(--cream)',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        {playing
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z"/></svg>}
      </button>
      <audio ref={audioRef} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.title}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {track.artist} · <span className="mono" style={{ fontSize: 12 }}>{fmtDuration(track.duration_seconds)}</span>
          {track.source === 'spotify' && (
            <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>· via Spotify</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {mode === 'pending' ? (
          <>
            <button className="btn btn-accent btn-sm" onClick={approve}>✓ Aprovar</button>
            <button className="btn btn-danger btn-sm" onClick={reject}>Rejeitar</button>
          </>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={remove}>Excluir</button>
        )}
      </div>
    </div>
  )
}

function UploadForm({ onDone }) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  async function getAudioDuration(file) {
    return new Promise((resolve) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => resolve(Math.round(audio.duration))
      audio.onerror = () => resolve(null)
      audio.src = URL.createObjectURL(file)
    })
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!file || !title || !artist) { setError('Preencha tudo'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('tracks').upload(path, file, { upsert: false })
      if (upErr) throw upErr

      const duration = await getAudioDuration(file)
      const { data: { user } } = await supabase.auth.getUser()

      await supabase.from('tracks').insert({
        title: title.trim(),
        artist: artist.trim(),
        storage_path: path,
        duration_seconds: duration,
        status: 'pending_review',
        source: 'manual',
        created_by: user.id,
      })
      setTitle(''); setArtist(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onDone()
    } catch (e) {
      setError(e.message || 'Erro')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr auto' }}>
        <div className="field">
          <label>Título</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label>Artista</label>
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} required />
        </div>
        <div className="field">
          <label>Arquivo</label>
          <input ref={fileRef} className="input" type="file" accept="audio/*"
            onChange={(e) => setFile(e.target.files[0])} required />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn btn-primary" disabled={uploading}>
            {uploading ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
      {error && <div style={{ color: 'var(--rose)', marginTop: 12, fontSize: 14 }}>{error}</div>}
    </form>
  )
}
