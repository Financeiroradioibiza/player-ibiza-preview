import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

// Gera/recupera um session id único por navegador
function getSessionId() {
  let s = localStorage.getItem('rb_session')
  if (!s) {
    s = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now())
    localStorage.setItem('rb_session', s)
  }
  return s
}

export default function Player() {
  const { code: paramCode } = useParams()
  const navigate = useNavigate()
  const [inputCode, setInputCode] = useState('')
  const [preview, setPreview] = useState(null)
  const [feedbackMap, setFeedbackMap] = useState({}) // track_id -> { vote, comment }
  const [state, setState] = useState(paramCode ? 'loading' : 'idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (paramCode) loadPreview(paramCode)
  }, [paramCode])

  async function loadPreview(code) {
    setState('loading')
    setError('')
    try {
      const { data, error } = await supabase.functions.invoke('get-preview', {
        body: { code, session_id: getSessionId() },
      })

      if (error) {
        const ctx = error.context
        if (ctx?.status === 403) {
          const body = await ctx.json().catch(() => ({}))
          if (body.expired) { setState('expired'); return }
          setState('notfound'); return
        }
        if (ctx?.status === 404) { setState('notfound'); return }
        throw error
      }

      if (data?.error) {
        if (data.error === 'expired' || data.expired) setState('expired')
        else setState('notfound')
        return
      }

      setPreview(data)
      const map = {}
      ;(data.feedback || []).forEach((f) => {
        map[f.track_id] = { vote: f.vote, comment: f.comment || '' }
      })
      setFeedbackMap(map)
      setState('playing')
    } catch (e) {
      setError(e.message || 'Erro ao carregar')
      setState('notfound')
    }
  }

  function submit(e) {
    e.preventDefault()
    const cleaned = inputCode.trim().toUpperCase()
    if (!cleaned) return
    navigate(`/player/${cleaned}`)
  }

  if (state === 'idle') {
    return (
      <Shell>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div className="mono" style={{
            fontSize: 11, letterSpacing: '0.3em', color: 'var(--cobalt)', marginBottom: 18,
          }}>RADIO · IBIZA</div>
          <h1 className="display" style={{
            fontSize: 56, fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 12,
          }}>
            Preview <em style={{ color: 'var(--cobalt)' }}>exclusivo</em>.
          </h1>
          <p className="muted" style={{ marginBottom: 32 }}>Digite o código que você recebeu.</p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <input className="input mono" placeholder="IBZ-XXXXX"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              style={{ fontSize: 22, textAlign: 'center', letterSpacing: '0.15em', padding: '14px 16px' }}
              autoFocus />
            <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '12px' }}
              disabled={!inputCode.trim()}>
              Acessar
            </button>
          </form>
        </div>
      </Shell>
    )
  }

  if (state === 'loading') return <Shell><div className="muted">Carregando…</div></Shell>

  if (state === 'expired') {
    return (
      <Shell>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div className="display" style={{ fontSize: 80, color: 'var(--rose)', lineHeight: 1, marginBottom: 16 }}>·</div>
          <h1 className="display" style={{ fontSize: 36, fontWeight: 400, marginBottom: 12 }}>Preview expirado</h1>
          <p className="muted">O período de validação deste preview já encerrou.</p>
          <Link to="/" className="btn btn-ghost" style={{ marginTop: 24 }}>← Voltar</Link>
        </div>
      </Shell>
    )
  }

  if (state === 'notfound') {
    return (
      <Shell>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 className="display" style={{ fontSize: 36, fontWeight: 400, marginBottom: 12 }}>Código não encontrado</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Confira se digitou corretamente.</p>
          {error && <p style={{ fontSize: 12, color: 'var(--rose)', marginBottom: 16 }}>{error}</p>}
          <Link to="/player" className="btn btn-primary">Tentar outro código</Link>
        </div>
      </Shell>
    )
  }

  return <PlayerView preview={preview} feedbackMap={feedbackMap} setFeedbackMap={setFeedbackMap} />
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '40px 20px',
      background: 'radial-gradient(ellipse at top, #fffaf0 0%, var(--cream) 70%)',
    }}>{children}</div>
  )
}

// ============================================================
// Player principal
// ============================================================
function PlayerView({ preview, feedbackMap, setFeedbackMap }) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const audioRef = useRef(null)
  const sessionId = getSessionId()

  const current = preview.tracks[currentIdx]
  const currentFb = feedbackMap[current?.id] || { vote: null, comment: '' }
  const expiresAt = new Date(preview.expires_at)
  const daysLeft = Math.ceil((expiresAt - new Date()) / 86400000)

  useEffect(() => {
    setCommentOpen(false)
    setCommentDraft(currentFb.comment || '')
  }, [currentIdx])

  function togglePlay() {
    if (!audioRef.current) return
    if (audioRef.current.paused) audioRef.current.play()
    else audioRef.current.pause()
  }

  function selectTrack(idx) {
    setCurrentIdx(idx)
    setPlaying(true)
    setTimeout(() => audioRef.current?.play(), 50)
  }

  function next() { if (currentIdx < preview.tracks.length - 1) selectTrack(currentIdx + 1) }
  function prev() { if (currentIdx > 0) selectTrack(currentIdx - 1) }

  function onTimeUpdate() {
    if (!audioRef.current) return
    setProgress(audioRef.current.currentTime)
    setDuration(audioRef.current.duration || 0)
  }

  function seek(e) {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  function fmt(s) {
    if (!s || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  async function saveFeedback(updates) {
    const next = { ...currentFb, ...updates }
    setFeedbackMap((m) => ({ ...m, [current.id]: next }))
    try {
      await supabase.functions.invoke('save-feedback', {
        body: {
          preview_id: preview.preview_id,
          track_id: current.id,
          session_id: sessionId,
          vote: next.vote,
          comment: next.comment,
        },
      })
    } catch (e) {
      console.error('Falha ao salvar feedback', e)
    }
  }

  function vote(v) {
    // clicar de novo no mesmo voto = remove
    saveFeedback({ vote: currentFb.vote === v ? null : v })
  }

  function saveComment() {
    saveFeedback({ comment: commentDraft.trim() })
    setCommentOpen(false)
  }

  return (
    <div onContextMenu={(e) => e.preventDefault()} style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, var(--ink) 0%, #050810 100%)',
      color: 'var(--cream)',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.3em', color: 'var(--amber)' }}>
              RADIO · IBIZA
            </div>
            <div className="display" style={{ fontSize: 20, marginTop: 4, opacity: 0.9 }}>
              {preview.client_name}
            </div>
          </div>
          <div className="mono" style={{ fontSize: 11, opacity: 0.5, textAlign: 'right' }}>
            {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} restantes` : 'expira hoje'}
          </div>
        </div>

        {/* Now Playing */}
        <div style={{ marginBottom: 32 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.25em', opacity: 0.5, marginBottom: 8 }}>
            TOCANDO AGORA · {String(currentIdx + 1).padStart(2, '0')} / {String(preview.tracks.length).padStart(2, '0')}
          </div>
          <div className="display" style={{
            fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 400,
            lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 8,
          }}>
            {current?.title}
          </div>
          <div style={{ fontSize: 18, opacity: 0.7 }}>{current?.artist}</div>
        </div>

        {/* Progress */}
        <div onClick={seek} style={{
          height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2,
          cursor: 'pointer', marginBottom: 8, overflow: 'hidden',
        }}>
          <div style={{
            width: duration ? `${(progress / duration) * 100}%` : '0%',
            height: '100%', background: 'var(--amber)', transition: 'width 0.1s linear',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.5, marginBottom: 24 }} className="mono">
          <span>{fmt(progress)}</span><span>{fmt(duration)}</span>
        </div>

        {/* Controles */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 20 }}>
          <button onClick={prev} disabled={currentIdx === 0} style={ctrlBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button onClick={togglePlay} style={{
            ...ctrlBtn, width: 72, height: 72,
            background: 'var(--amber)', color: 'var(--ink)', borderRadius: '50%',
          }}>
            {playing ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <button onClick={next} disabled={currentIdx === preview.tracks.length - 1} style={ctrlBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>

        {/* Voting */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={() => vote(1)} style={{
            ...voteBtn,
            background: currentFb.vote === 1 ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
            color: currentFb.vote === 1 ? '#4ade80' : 'var(--cream)',
            border: `1px solid ${currentFb.vote === 1 ? '#4ade80' : 'rgba(255,255,255,0.12)'}`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 21h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2zM1 9h4v12H1z"/>
            </svg>
            Curti
          </button>
          <button onClick={() => vote(-1)} style={{
            ...voteBtn,
            background: currentFb.vote === -1 ? 'rgba(244,63,94,0.18)' : 'rgba(255,255,255,0.06)',
            color: currentFb.vote === -1 ? 'var(--rose)' : 'var(--cream)',
            border: `1px solid ${currentFb.vote === -1 ? 'var(--rose)' : 'rgba(255,255,255,0.12)'}`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/>
            </svg>
            Não curti
          </button>
          <button onClick={() => setCommentOpen(!commentOpen)} style={{
            ...voteBtn,
            background: currentFb.comment ? 'rgba(34, 56, 255, 0.18)' : 'rgba(255,255,255,0.06)',
            color: currentFb.comment ? '#9bb5ff' : 'var(--cream)',
            border: `1px solid ${currentFb.comment ? '#6b8aff' : 'rgba(255,255,255,0.12)'}`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
            {currentFb.comment ? 'Editar comentário' : 'Comentário'}
          </button>
        </div>

        {commentOpen && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 'var(--radius-md)',
            padding: 12, marginBottom: 24,
          }}>
            <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Comentário sobre esta música..."
              rows={3}
              style={{
                width: '100%', background: 'transparent', color: 'var(--cream)',
                border: 'none', outline: 'none', resize: 'vertical', fontSize: 14,
                fontFamily: 'inherit',
              }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => setCommentOpen(false)}
                style={{ background: 'transparent', color: 'var(--cream)', opacity: 0.7 }}>
                Cancelar
              </button>
              <button onClick={saveComment} style={{
                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                background: 'var(--amber)', color: 'var(--ink)', fontSize: 13, fontWeight: 500,
              }}>
                Salvar
              </button>
            </div>
          </div>
        )}

        <audio ref={audioRef} src={current?.url}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { if (currentIdx < preview.tracks.length - 1) next(); else setPlaying(false) }}
          onTimeUpdate={onTimeUpdate} onLoadedMetadata={onTimeUpdate}
          controlsList="nodownload noplaybackrate"
          onContextMenu={(e) => e.preventDefault()} />

        {/* Tracklist */}
        <div style={{ marginTop: 32 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.25em', opacity: 0.5, marginBottom: 12 }}>
            FAIXAS
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          }}>
            {preview.tracks.map((t, i) => {
              const active = i === currentIdx
              const fb = feedbackMap[t.id] || {}
              return (
                <button key={t.id} onClick={() => selectTrack(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  width: '100%', padding: '14px 18px', textAlign: 'left',
                  background: active ? 'rgba(255, 154, 60, 0.12)' : 'transparent',
                  borderBottom: i < preview.tracks.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  color: 'var(--cream)',
                }}>
                  <span className="mono" style={{
                    fontSize: 12, opacity: active ? 1 : 0.4,
                    color: active ? 'var(--amber)' : 'inherit', width: 28,
                  }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: active ? 500 : 400 }}>{t.title}</div>
                    <div style={{ fontSize: 13, opacity: 0.5 }}>{t.artist}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    {fb.vote === 1 && <span style={{ color: '#4ade80' }}>♥</span>}
                    {fb.vote === -1 && <span style={{ color: 'var(--rose)' }}>✕</span>}
                    {fb.comment && <span style={{ color: '#9bb5ff' }}>✎</span>}
                    {active && playing && (
                      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 14, marginLeft: 4 }}>
                        <Bar delay={0} /><Bar delay={0.15} /><Bar delay={0.3} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginTop: 40, textAlign: 'center', fontSize: 11, opacity: 0.3 }} className="mono">
          PREVIEW EXPIRA EM {expiresAt.toLocaleDateString('pt-BR')}
        </div>
      </div>

      <style>{`@keyframes bar { 0%, 100% { height: 4px } 50% { height: 14px } }`}</style>
    </div>
  )
}

const ctrlBtn = {
  display: 'grid', placeItems: 'center',
  width: 44, height: 44,
  background: 'rgba(255,255,255,0.08)',
  color: 'var(--cream)',
  borderRadius: '50%',
  transition: 'background 0.15s, transform 0.08s',
}

const voteBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 999,
  fontSize: 13, fontWeight: 500,
  transition: 'all 0.15s',
}

function Bar({ delay }) {
  return <span style={{
    width: 3, background: 'var(--amber)',
    animation: `bar 0.9s ease-in-out infinite`,
    animationDelay: `${delay}s`,
  }} />
}
