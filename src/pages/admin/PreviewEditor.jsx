import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase, generateCode } from '../../lib/supabase.js'

export default function PreviewEditor() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [preview, setPreview] = useState(null)
  const [tracks, setTracks] = useState([])
  const [job, setJob] = useState(null)
  const [jobItems, setJobItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)

  // Inputs do setup
  const [clientName, setClientName] = useState('')
  const [days, setDays] = useState(7)
  const [playlistUrl, setPlaylistUrl] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id))
  }, [])

  useEffect(() => {
    if (id) {
      load()
      const t = setInterval(load, 4000)
      return () => clearInterval(t)
    } else {
      setLoading(false)
    }
  }, [id])

  async function load() {
    const { data: p } = await supabase
      .from('previews')
      .select('*')
      .eq('id', id)
      .single()
    setPreview(p)
    if (p) {
      setClientName(p.client_name)
      setDays(p.days_valid)
    }

    const { data: t } = await supabase
      .from('tracks')
      .select('*')
      .eq('preview_id', id)
      .order('position')
      .order('created_at')
    setTracks(t || [])

    const { data: jobs } = await supabase
      .from('download_jobs')
      .select('*')
      .eq('preview_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
    const j = jobs?.[0]
    setJob(j || null)

    if (j) {
      const { data: items } = await supabase
        .from('download_job_items')
        .select('*')
        .eq('job_id', j.id)
        .order('updated_at')
      setJobItems(items || [])
    }

    setLoading(false)
  }

  // --- Criar preview rascunho ---
  async function createDraft(e) {
    e.preventDefault()
    setError('')
    if (!clientName.trim()) { setError('Informe o nome do cliente'); return }
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('previews')
        .insert({
          client_name: clientName.trim(),
          days_valid: days,
          status: 'draft',
          created_by: user.id,
        })
        .select()
        .single()
      if (error) throw error
      navigate(`/admin/previews/${data.id}/edit`)
    } catch (e) {
      setError(e.message || 'Erro')
    } finally {
      setSubmitting(false)
    }
  }

  // --- Atualizar config básica (nome/dias) ---
  async function updateConfig() {
    await supabase.from('previews').update({
      client_name: clientName.trim(),
      days_valid: days,
    }).eq('id', id)
    load()
  }

  // --- Iniciar download ---
  async function startDownload() {
    setError('')
    if (!playlistUrl.match(/spotify\.com\/playlist\//)) {
      setError('Cole um link válido de playlist do Spotify')
      return
    }
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('download_jobs').insert({
        preview_id: id,
        spotify_url: playlistUrl.trim(),
        created_by: user.id,
      })
      if (error) throw error
      setPlaylistUrl('')
      load()
    } catch (e) {
      setError(e.message || 'Erro ao criar job')
    } finally {
      setSubmitting(false)
    }
  }

  // --- Aprovar/Rejeitar música ---
  async function approveTrack(track) {
    await supabase.from('tracks').update({ status: 'approved' }).eq('id', track.id)
    load()
  }

  async function approveAll() {
    const pending = tracks.filter(t => t.status === 'pending_review')
    if (pending.length === 0) return
    if (!confirm(`Aprovar todas as ${pending.length} músicas pendentes?`)) return
    const ids = pending.map(t => t.id)
    await supabase.from('tracks').update({ status: 'approved' }).in('id', ids)
    load()
  }

  async function rejectTrack(track) {
    if (!confirm(`Rejeitar "${track.title}"? O arquivo será excluído.`)) return
    if (track.storage_path) {
      await supabase.storage.from('tracks').remove([track.storage_path])
    }
    await supabase.from('tracks').delete().eq('id', track.id)
    load()
  }

  // --- Publicar (ativar) ---
  async function publish() {
    if (!tracks.some(t => t.status === 'approved')) {
      alert('Aprove pelo menos uma música antes de publicar.')
      return
    }
    if (tracks.some(t => t.status === 'pending_review')) {
      if (!confirm('Existem músicas pendentes ainda. Elas não vão aparecer pro cliente até serem aprovadas. Publicar mesmo assim?')) return
    }

    const code = preview.code || generateCode()
    const expiresAt = new Date(Date.now() + (days || 7) * 86400000).toISOString()

    await supabase.from('previews').update({
      status: 'active',
      code,
      expires_at: expiresAt,
      client_name: clientName.trim(),
      days_valid: days,
    }).eq('id', id)

    navigate(`/admin/previews/${id}`)
  }

  // --- Excluir o rascunho inteiro ---
  async function deleteDraft() {
    if (!confirm('Excluir este rascunho? Todas as músicas baixadas serão removidas.')) return
    // remove arquivos do storage
    const paths = tracks.filter(t => t.storage_path).map(t => t.storage_path)
    if (paths.length > 0) {
      await supabase.storage.from('tracks').remove(paths)
    }
    await supabase.from('previews').delete().eq('id', id)
    navigate('/admin')
  }

  if (loading) return <div className="muted">Carregando…</div>

  // ====== Modo 1: Criar novo preview (sem id ainda) ======
  if (!id) {
    return (
      <div>
        <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
        <h1 className="display" style={{ fontSize: 36, fontWeight: 400, margin: '8px 0 24px' }}>
          Novo preview
        </h1>
        <div className="card" style={{ maxWidth: 560 }}>
          <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
            Comece preenchendo as informações básicas. Depois você poderá baixar a playlist do Spotify e aprovar as músicas antes de publicar.
          </p>
          <form onSubmit={createDraft} style={{ display: 'grid', gap: 16 }}>
            <div className="field">
              <label>Nome do cliente</label>
              <input className="input" value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Restaurante Casa 21" required autoFocus />
            </div>
            <div className="field">
              <label>Validade (dias após publicação)</label>
              <input className="input" type="number" min={1} max={365}
                value={days} onChange={(e) => setDays(parseInt(e.target.value) || 1)} required />
            </div>
            {error && <div style={{ color: 'var(--rose)', fontSize: 14 }}>{error}</div>}
            <button className="btn btn-primary" disabled={submitting}
              style={{ justifyContent: 'center', padding: 12 }}>
              {submitting ? 'Criando…' : 'Continuar →'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ====== Modo 2: Editar preview existente ======
  if (!preview) return <div className="muted">Preview não encontrado.</div>

  const isMine = currentUserId === preview.created_by
  if (!isMine) {
    return (
      <div>
        <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
        <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: 40 }}>
          <p>Este preview foi criado por outro admin.</p>
          <p className="muted" style={{ marginTop: 8 }}>Apenas o criador pode editar.</p>
          <Link to={`/admin/previews/${id}`} className="btn btn-primary" style={{ marginTop: 16 }}>
            Ver detalhes (somente leitura)
          </Link>
        </div>
      </div>
    )
  }

  if (preview.status !== 'draft') {
    // Já foi publicado — redireciona pro detalhe
    return (
      <div>
        <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
        <div className="card" style={{ marginTop: 16 }}>
          <p>Este preview já foi publicado. Vá para <Link to={`/admin/previews/${id}`} style={{ color: 'var(--cobalt)' }}>os detalhes</Link> para gerenciar.</p>
        </div>
      </div>
    )
  }

  const approvedCount = tracks.filter(t => t.status === 'approved').length
  const pendingCount = tracks.filter(t => t.status === 'pending_review').length
  const isJobActive = job && (job.status === 'queued' || job.status === 'processing')

  return (
    <div>
      <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8, marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="badge badge-warn" style={{ fontSize: 10 }}>RASCUNHO</span>
          <h1 className="display" style={{ fontSize: 32, fontWeight: 400, marginTop: 4 }}>
            {preview.client_name}
          </h1>
        </div>
        <button className="btn btn-danger" onClick={deleteDraft}>Excluir rascunho</button>
      </div>

      {/* Seção: Configuração */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
          1. Informações do cliente
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
          <div className="field">
            <label>Nome do cliente</label>
            <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="field">
            <label>Validade (dias)</label>
            <input className="input" type="number" min={1} max={365}
              value={days} onChange={(e) => setDays(parseInt(e.target.value) || 1)} />
          </div>
          <button className="btn btn-ghost" onClick={updateConfig}>Atualizar</button>
        </div>
      </div>

      {/* Seção: Upload manual de MP3s */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
          2. Adicionar músicas
        </h3>
        <UploadForm previewId={id} onUploaded={load} />
      </div>

      {/* Seção: Progresso do download em andamento (caso ainda haja um) */}
      {isJobActive && (
        <div className="card" style={{ marginBottom: 20, background: 'rgba(34, 56, 255, 0.04)' }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cobalt)', marginBottom: 12 }}>
            Baixando playlist… {job.completed_tracks}/{job.total_tracks || '—'}
          </h3>
          {jobItems.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Aguardando worker iniciar…</p>
          ) : (
            <div style={{ display: 'grid', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {jobItems.map((i) => (
                <div key={i.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '6px 10px', background: 'white', borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                }}>
                  <span style={{ width: 18, textAlign: 'center' }}>
                    {i.status === 'done' && '✓'}
                    {i.status === 'failed' && '✗'}
                    {i.status === 'downloading' && '⏳'}
                    {i.status === 'pending' && '·'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.title}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {i.artist}
                      {i.error_message && <span style={{ color: 'var(--rose)' }}> — {i.error_message}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Seção: Faixas (revisão) */}
      {tracks.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
              {isJobActive ? 'Faixas baixadas até agora' : `3. Revisar e aprovar (${approvedCount}/${tracks.length} aprovadas)`}
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!isJobActive && job?.status === 'done' && (
                <span className="badge badge-active">Download concluído</span>
              )}
              {!isJobActive && job?.status === 'failed' && (
                <span className="badge badge-expired" title={job.error_message}>Download falhou</span>
              )}
              {pendingCount > 0 && (
                <button className="btn btn-accent btn-sm" onClick={approveAll}>
                  ✓ Aprovar todas ({pendingCount})
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {tracks.map((t) => (
              <TrackRow key={t.id} track={t}
                onApprove={() => approveTrack(t)}
                onReject={() => rejectTrack(t)} />
            ))}
          </div>
        </div>
      )}

      {/* Seção: Publicar */}
      {tracks.length > 0 && !isJobActive && (
        <div className="card" style={{
          background: approvedCount > 0 ? 'rgba(34, 56, 255, 0.04)' : undefined,
          border: approvedCount > 0 ? '1px solid var(--cobalt)' : undefined,
        }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 8 }}>
            4. Publicar para o cliente
          </h3>
          <p style={{ fontSize: 14, marginBottom: 12 }}>
            {approvedCount === 0 && 'Aprove pelo menos uma música para publicar.'}
            {approvedCount > 0 && pendingCount === 0 && (
              <>Tudo pronto. <strong>{approvedCount} músicas aprovadas</strong>, prazo de <strong>{days} dias</strong>.</>
            )}
            {approvedCount > 0 && pendingCount > 0 && (
              <>{approvedCount} aprovadas, {pendingCount} ainda pendentes. As pendentes não aparecerão para o cliente.</>
            )}
          </p>
          <button className="btn btn-accent" onClick={publish} disabled={approvedCount === 0}
            style={{ padding: '12px 24px' }}>
            Publicar preview e gerar código →
          </button>
        </div>
      )}
    </div>
  )
}

function TrackRow({ track, onApprove, onReject }) {
  const [url, setUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showPlayer, setShowPlayer] = useState(false)
  const audioRef = useRef(null)
  const myId = track.id

  // Quando outro TrackRow começa a tocar, pausa este
  useEffect(() => {
    function onOtherPlay(e) {
      if (e.detail?.trackId !== myId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause()
      }
    }
    window.addEventListener('radioibiza:trackplay', onOtherPlay)
    return () => window.removeEventListener('radioibiza:trackplay', onOtherPlay)
  }, [myId])

  function announcePlay() {
    window.dispatchEvent(new CustomEvent('radioibiza:trackplay', { detail: { trackId: myId } }))
  }

  async function loadUrl() {
    if (url) return url
    const { data } = await supabase.storage
      .from('tracks').createSignedUrl(track.storage_path, 600)
    setUrl(data?.signedUrl)
    return data?.signedUrl
  }

  async function togglePlay() {
    if (!track.storage_path) return
    if (!showPlayer) {
      announcePlay()
      setShowPlayer(true)
      await loadUrl()
      setTimeout(() => audioRef.current?.play(), 100)
      return
    }
    if (playing) audioRef.current?.pause()
    else {
      announcePlay()
      audioRef.current?.play()
    }
  }

  function onTimeUpdate() {
    if (!audioRef.current) return
    setProgress(audioRef.current.currentTime)
    setDuration(audioRef.current.duration || 0)
  }

  function seek(e) {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = Math.max(0, Math.min(duration, pct * duration))
  }

  function skip(seconds) {
    if (!audioRef.current || !duration) return
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
  }

  function jumpTo(fraction) {
    if (!audioRef.current || !duration) return
    audioRef.current.currentTime = duration * fraction
    if (!playing) {
      announcePlay()
      audioRef.current.play()
    }
  }

  function fmtDuration(s) {
    if (!s || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const isApproved = track.status === 'approved'

  return (
    <div style={{
      padding: showPlayer ? '12px 14px 14px' : 10,
      background: isApproved ? 'rgba(34,197,94,0.06)' : 'var(--cream-soft)',
      borderRadius: 'var(--radius-sm)',
      border: isApproved ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent',
      transition: 'padding 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={togglePlay} disabled={!track.storage_path} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--ink)', color: 'var(--cream)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
          cursor: track.storage_path ? 'pointer' : 'not-allowed',
          opacity: track.storage_path ? 1 : 0.4,
        }}>
          {playing
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z"/></svg>}
        </button>
        <audio
          ref={audioRef} src={url || undefined}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onTimeUpdate}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {track.title}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {track.artist} <span className="mono">· {fmtDuration(track.duration_seconds)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isApproved ? (
            <button className="btn btn-ghost btn-sm" onClick={onReject}>Remover</button>
          ) : (
            <>
              <button className="btn btn-accent btn-sm" onClick={onApprove}>✓ Aprovar</button>
              <button className="btn btn-danger btn-sm" onClick={onReject}>Rejeitar</button>
            </>
          )}
        </div>
      </div>

      {/* Player expandido com barra de progresso */}
      {showPlayer && (
        <div style={{ marginTop: 12, paddingLeft: 48 }}>
          {/* Barra de progresso clicável */}
          <div
            onClick={seek}
            style={{
              height: 6,
              background: 'rgba(0,0,0,0.1)',
              borderRadius: 3,
              cursor: 'pointer',
              overflow: 'hidden',
              position: 'relative',
              marginBottom: 4,
            }}
          >
            {/* Marcadores de quartos (0, 25%, 50%, 75%) */}
            {[0.25, 0.5, 0.75].map((frac) => (
              <div key={frac} style={{
                position: 'absolute',
                left: `${frac * 100}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(0,0,0,0.15)',
              }} />
            ))}
            <div style={{
              width: duration ? `${(progress / duration) * 100}%` : '0%',
              height: '100%',
              background: 'var(--cobalt)',
              transition: 'width 0.1s linear',
            }} />
          </div>

          {/* Tempo + atalhos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              {fmtDuration(progress)} / {fmtDuration(duration)}
            </span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => skip(-15)} style={{ fontSize: 11, padding: '4px 8px' }}>
                ⏪ 15s
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => jumpTo(0)} style={{ fontSize: 11, padding: '4px 8px' }}>
                Início
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => jumpTo(0.5)} style={{ fontSize: 11, padding: '4px 8px' }}>
                Meio
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => jumpTo(0.85)} style={{ fontSize: 11, padding: '4px 8px' }}>
                Final
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => skip(15)} style={{ fontSize: 11, padding: '4px 8px' }}>
                15s ⏩
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Formulário de upload manual de MP3s
// ============================================================
function UploadForm({ previewId, onUploaded }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  function pickFiles(e) {
    const list = Array.from(e.target.files || [])
    setFiles(list)
    setError('')
  }

  async function getAudioDuration(file) {
    return new Promise((resolve) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => resolve(Math.round(audio.duration))
      audio.onerror = () => resolve(null)
      audio.src = URL.createObjectURL(file)
    })
  }

  // Lê tags ID3v2 (que cobre 99% dos MP3 modernos)
  async function readId3Tags(file) {
    try {
      // Lê os primeiros 1MB do arquivo (cabeçalho + tags geralmente ficam aí)
      const buffer = await file.slice(0, 1024 * 1024).arrayBuffer()
      const bytes = new Uint8Array(buffer)

      // Verifica magic "ID3"
      if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null

      const version = bytes[3] // 3 ou 4
      // Tamanho do bloco de tags (synchsafe integer)
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
                   ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)

      let pos = 10
      const end = Math.min(10 + size, bytes.length)
      const tags = {}

      while (pos < end - 10) {
        const frameId = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3])
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break

        let frameSize
        if (version === 4) {
          frameSize = ((bytes[pos+4] & 0x7f) << 21) | ((bytes[pos+5] & 0x7f) << 14) |
                      ((bytes[pos+6] & 0x7f) << 7) | (bytes[pos+7] & 0x7f)
        } else {
          frameSize = (bytes[pos+4] << 24) | (bytes[pos+5] << 16) |
                      (bytes[pos+6] << 8) | bytes[pos+7]
        }

        if (frameSize <= 0 || pos + 10 + frameSize > end) break

        const dataStart = pos + 10
        const encoding = bytes[dataStart]
        const textBytes = bytes.slice(dataStart + 1, dataStart + frameSize)

        let text = ''
        if (encoding === 0) {
          // ISO-8859-1 (latin1)
          text = new TextDecoder('iso-8859-1').decode(textBytes)
        } else if (encoding === 1 || encoding === 2) {
          // UTF-16 (com ou sem BOM)
          text = new TextDecoder('utf-16').decode(textBytes)
        } else if (encoding === 3) {
          // UTF-8
          text = new TextDecoder('utf-8').decode(textBytes)
        }
        text = text.replace(/\u0000+$/g, '').trim()

        if (frameId === 'TIT2') tags.title = text
        else if (frameId === 'TPE1') tags.artist = text
        else if (frameId === 'TPE2' && !tags.artist) tags.artist = text

        pos = dataStart + frameSize
      }

      return tags
    } catch (e) {
      console.warn('Erro lendo tags:', e)
      return null
    }
  }

  // Extrai metadados do arquivo: tenta tags ID3 primeiro, cai no nome do arquivo
  async function extractMetadata(file) {
    const tags = await readId3Tags(file)
    if (tags?.title) {
      return {
        title: tags.title,
        artist: tags.artist || 'Desconhecido',
      }
    }
    // Fallback: nome do arquivo
    const base = file.name.replace(/\.(mp3|m4a|wav|aac|ogg|flac)$/i, '')
    const parts = base.split(' - ')
    if (parts.length >= 2) {
      return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
    }
    return { artist: 'Desconhecido', title: base.trim() }
  }

  async function uploadAll() {
    if (files.length === 0) return
    setError('')
    setUploading(true)
    setProgress({ done: 0, total: files.length, current: '' })

    try {
      const { data: { user } } = await supabase.auth.getUser()
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress({ done: i, total: files.length, current: file.name })
        try {
          const { title, artist } = await extractMetadata(file)
          const ext = file.name.split('.').pop().toLowerCase()
          const path = `${crypto.randomUUID()}.${ext}`

          const { error: upErr } = await supabase.storage
            .from('tracks').upload(path, file, { upsert: false })
          if (upErr) throw upErr

          const duration = await getAudioDuration(file)
          const { error: insErr } = await supabase.from('tracks').insert({
            preview_id: previewId,
            title,
            artist,
            storage_path: path,
            duration_seconds: duration,
            status: 'pending_review',
            source: 'manual',
            created_by: user.id,
          })
          if (insErr) throw insErr
        } catch (e) {
          console.error('Erro em', file.name, e)
        }
      }
      setProgress({ done: files.length, total: files.length, current: '' })
      setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      onUploaded()
    } catch (e) {
      setError(e.message || 'Erro no upload')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{
        border: '2px dashed var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        padding: 24,
        textAlign: 'center',
        background: 'var(--cream-soft)',
      }}>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac"
          multiple
          onChange={pickFiles}
          style={{ display: 'none' }}
          id="file-upload"
        />
        <label htmlFor="file-upload" style={{
          cursor: 'pointer',
          display: 'inline-block',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎵</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
            {files.length === 0
              ? 'Clique para escolher os arquivos MP3'
              : `${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'} selecionado(s)`}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Pode selecionar várias músicas de uma vez
          </div>
        </label>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            <strong>Como funciona:</strong> usamos a tag interna do MP3 (ID3) para pegar nome e artista corretos. Se o arquivo não tiver tag, usamos o nome do arquivo (formato <span className="mono">"Artista - Música"</span>).
          </p>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 4, marginBottom: 12 }}>
            {files.map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--muted)' }}>
                · {f.name}
              </div>
            ))}
          </div>
          <button className="btn btn-accent" onClick={uploadAll} disabled={uploading}>
            {uploading ? `Enviando ${progress.done}/${progress.total}…` : `Enviar ${files.length} arquivo(s)`}
          </button>
          {uploading && progress.current && (
            <span className="muted" style={{ marginLeft: 12, fontSize: 12 }}>
              {progress.current}
            </span>
          )}
        </div>
      )}

      {error && <div style={{ color: 'var(--rose)', marginTop: 10, fontSize: 14 }}>{error}</div>}
    </div>
  )
}
