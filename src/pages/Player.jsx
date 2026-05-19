import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

// Paleta Radio Ibiza
const RI = {
  bg: '#0a0a0a',
  bgSoft: '#141414',
  bgCard: '#1a1a1a',
  pink: '#ff2e8a',
  pinkDeep: '#e01872',
  yellow: '#ffe70a',
  yellowSoft: '#fff36e',
  textPrimary: '#ffffff',
  textMuted: 'rgba(255,255,255,0.55)',
  textDim: 'rgba(255,255,255,0.35)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
}

const FONT_DISPLAY = "'Oswald', 'Bebas Neue', 'Impact', sans-serif"
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

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
  const [feedbackMap, setFeedbackMap] = useState({})
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

  return (
    <>
      <FontLoader />
      {state === 'idle' && <IdleScreen inputCode={inputCode} setInputCode={setInputCode} submit={submit} />}
      {state === 'loading' && <CenteredMessage text="CARREGANDO" />}
      {state === 'expired' && <ExpiredScreen />}
      {state === 'notfound' && <NotFoundScreen error={error} />}
      {state === 'playing' && <PlayerView preview={preview} feedbackMap={feedbackMap} setFeedbackMap={setFeedbackMap} />}
    </>
  )
}

function FontLoader() {
  return (
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
    />
  )
}

// ============================================================
// Tela de entrada de código
// ============================================================
function IdleScreen({ inputCode, setInputCode, submit }) {
  return (
    <Shell>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <Logo />
        <h1 style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 'clamp(48px, 8vw, 72px)',
          fontWeight: 700,
          lineHeight: 0.95,
          letterSpacing: '0.01em',
          marginTop: 32,
          marginBottom: 12,
          textTransform: 'uppercase',
        }}>
          SUA <span style={{ color: RI.pink }}>IDENTIDADE</span><br />
          MUSICAL
        </h1>
        <p style={{ color: RI.textMuted, fontSize: 16, marginBottom: 32, lineHeight: 1.5 }}>
          Digite o código que você recebeu para acessar seu preview exclusivo.
        </p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <input
            placeholder="IBZ-XXXXX"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            autoFocus
            style={{
              padding: '18px 20px',
              fontSize: 22,
              fontFamily: FONT_DISPLAY,
              letterSpacing: '0.2em',
              textAlign: 'center',
              background: RI.bgSoft,
              border: `1px solid ${RI.borderStrong}`,
              borderRadius: 4,
              color: RI.textPrimary,
              outline: 'none',
              textTransform: 'uppercase',
            }}
          />
          <button
            type="submit"
            disabled={!inputCode.trim()}
            style={{
              padding: '16px',
              background: RI.pink,
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: inputCode.trim() ? 'pointer' : 'not-allowed',
              opacity: inputCode.trim() ? 1 : 0.4,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { if (inputCode.trim()) e.target.style.background = RI.pinkDeep }}
            onMouseLeave={(e) => e.target.style.background = RI.pink}
          >
            Acessar Preview
          </button>
        </form>
        <p style={{ color: RI.textDim, fontSize: 12, marginTop: 24, textAlign: 'center' }}>
          Radio Ibiza · Identidade Musical para marcas
        </p>
      </div>
    </Shell>
  )
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Estrela/explosão da Radio Ibiza */}
      <svg width="44" height="44" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        <g transform="translate(50,50)">
          {[...Array(16)].map((_, i) => {
            const angle = (i / 16) * 360
            const len = i % 2 === 0 ? 42 : 28
            return (
              <line
                key={i}
                x1="0" y1="0"
                x2={Math.cos((angle * Math.PI) / 180) * len}
                y2={Math.sin((angle * Math.PI) / 180) * len}
                stroke={RI.yellow}
                strokeWidth="3"
              />
            )
          })}
          <circle r="14" fill={RI.bg} stroke={RI.yellow} strokeWidth="2" />
        </g>
      </svg>
      <div style={{
        fontFamily: FONT_DISPLAY,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '0.08em',
        lineHeight: 1,
      }}>
        RADIO<br />
        <span style={{ color: RI.yellow }}>IBIZA</span>
      </div>
    </div>
  )
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: RI.bg,
      color: RI.textPrimary,
      display: 'grid',
      placeItems: 'center',
      padding: '40px 24px',
      fontFamily: FONT_BODY,
    }}>
      {children}
    </div>
  )
}

function CenteredMessage({ text }) {
  return (
    <Shell>
      <div style={{
        fontFamily: FONT_DISPLAY,
        letterSpacing: '0.3em',
        color: RI.textMuted,
        fontSize: 14,
      }}>{text}…</div>
    </Shell>
  )
}

function ExpiredScreen() {
  return (
    <Shell>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <Logo />
        <div style={{
          display: 'inline-block',
          marginTop: 40, marginBottom: 16,
          padding: '6px 14px',
          background: RI.pink,
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}>
          PREVIEW EXPIRADO
        </div>
        <h1 style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: '0.01em',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          O Período<br />Encerrou.
        </h1>
        <p style={{ color: RI.textMuted, fontSize: 15, lineHeight: 1.5 }}>
          Entre em contato com a Radio Ibiza para mais informações sobre sua identidade musical.
        </p>
      </div>
    </Shell>
  )
}

function NotFoundScreen({ error }) {
  return (
    <Shell>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <Logo />
        <h1 style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: '0.01em',
          textTransform: 'uppercase',
          marginTop: 40, marginBottom: 16,
        }}>
          Código <span style={{ color: RI.pink }}>Inválido</span>
        </h1>
        <p style={{ color: RI.textMuted, fontSize: 15, marginBottom: 28 }}>
          Confira se digitou corretamente.
        </p>
        {error && <p style={{ fontSize: 12, color: RI.pink, marginBottom: 16 }}>{error}</p>}
        <Link to="/player" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: RI.pink,
          color: 'white',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          borderRadius: 4,
          textDecoration: 'none',
        }}>
          Tentar Outro Código
        </Link>
      </div>
    </Shell>
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
    const nextFb = { ...currentFb, ...updates }
    setFeedbackMap((m) => ({ ...m, [current.id]: nextFb }))
    try {
      await supabase.functions.invoke('save-feedback', {
        body: {
          preview_id: preview.preview_id,
          track_id: current.id,
          session_id: sessionId,
          vote: nextFb.vote,
          comment: nextFb.comment,
        },
      })
    } catch (e) {
      console.error('Falha ao salvar feedback', e)
    }
  }

  function vote(v) {
    saveFeedback({ vote: currentFb.vote === v ? null : v })
  }

  function saveComment() {
    saveFeedback({ comment: commentDraft.trim() })
    setCommentOpen(false)
  }

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        minHeight: '100vh',
        background: RI.bg,
        color: RI.textPrimary,
        fontFamily: FONT_BODY,
        padding: '32px 24px 64px',
      }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 40,
          paddingBottom: 24,
          borderBottom: `1px solid ${RI.border}`,
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <Logo />
          <div style={{ textAlign: 'right' }}>
            <div style={{
              display: 'inline-block',
              padding: '4px 10px',
              background: RI.yellow,
              color: RI.bg,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              CLIENTE
            </div>
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {preview.client_name}
            </div>
            <div style={{ color: RI.textDim, fontSize: 11, marginTop: 4, letterSpacing: '0.05em' }}>
              {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'DIA RESTANTE' : 'DIAS RESTANTES'}` : 'EXPIRA HOJE'}
            </div>
          </div>
        </div>

        {/* Now Playing */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 10px',
            background: RI.pink,
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            TOCANDO · {String(currentIdx + 1).padStart(2, '0')} / {String(preview.tracks.length).padStart(2, '0')}
          </div>
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 'clamp(36px, 6vw, 58px)',
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: '0.005em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            {current?.title}
          </div>
          <div style={{
            fontSize: 16,
            color: RI.textMuted,
            letterSpacing: '0.02em',
          }}>
            {current?.artist}
          </div>
        </div>

        {/* Progress */}
        <div
          onClick={seek}
          style={{
            height: 3,
            background: RI.border,
            cursor: 'pointer',
            marginBottom: 8,
            overflow: 'hidden',
          }}>
          <div style={{
            width: duration ? `${(progress / duration) * 100}%` : '0%',
            height: '100%',
            background: RI.yellow,
            transition: 'width 0.1s linear',
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: RI.textDim,
          letterSpacing: '0.1em',
          marginBottom: 28,
          fontFamily: FONT_DISPLAY,
        }}>
          <span>{fmt(progress)}</span>
          <span>{fmt(duration)}</span>
        </div>

        {/* Controles */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          marginBottom: 28,
        }}>
          <CircleBtn onClick={prev} disabled={currentIdx === 0} size={48}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </CircleBtn>
          <CircleBtn onClick={togglePlay} size={76} primary>
            {playing
              ? <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
              : <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 4 }}><path d="M8 5v14l11-7z"/></svg>}
          </CircleBtn>
          <CircleBtn onClick={next} disabled={currentIdx === preview.tracks.length - 1} size={48}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </CircleBtn>
        </div>

        {/* Voting */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <VoteBtn
            active={currentFb.vote === 1}
            activeColor="#22c55e"
            onClick={() => vote(1)}
            icon="♥"
            label="Curti"
          />
          <VoteBtn
            active={currentFb.vote === -1}
            activeColor={RI.pink}
            onClick={() => vote(-1)}
            icon="✕"
            label="Não curti"
          />
          <VoteBtn
            active={!!currentFb.comment}
            activeColor={RI.yellow}
            onClick={() => setCommentOpen(!commentOpen)}
            icon="✎"
            label={currentFb.comment ? 'Editar comentário' : 'Comentar'}
          />
        </div>

        {commentOpen && (
          <div style={{
            background: RI.bgCard,
            border: `1px solid ${RI.borderStrong}`,
            padding: 16,
            marginBottom: 28,
          }}>
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="O que achou desta música?"
              rows={3}
              style={{
                width: '100%',
                background: 'transparent',
                color: RI.textPrimary,
                border: 'none',
                outline: 'none',
                resize: 'vertical',
                fontSize: 14,
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setCommentOpen(false)} style={{
                padding: '8px 16px',
                background: 'transparent',
                color: RI.textMuted,
                border: `1px solid ${RI.borderStrong}`,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}>
                Cancelar
              </button>
              <button onClick={saveComment} style={{
                padding: '8px 16px',
                background: RI.yellow,
                color: RI.bg,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}>
                Salvar
              </button>
            </div>
          </div>
        )}

        <audio
          ref={audioRef}
          src={current?.url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { if (currentIdx < preview.tracks.length - 1) next(); else setPlaying(false) }}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onTimeUpdate}
          controlsList="nodownload noplaybackrate"
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Tracklist */}
        <div style={{ marginTop: 36 }}>
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.25em',
            color: RI.textDim,
            marginBottom: 14,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{
              display: 'inline-block',
              width: 16, height: 2, background: RI.yellow,
            }} />
            FAIXAS DO PREVIEW
          </div>
          <div style={{
            background: RI.bgSoft,
            border: `1px solid ${RI.border}`,
            overflow: 'hidden',
          }}>
            {preview.tracks.map((t, i) => {
              const active = i === currentIdx
              const fb = feedbackMap[t.id] || {}
              return (
                <button
                  key={t.id}
                  onClick={() => selectTrack(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    width: '100%',
                    padding: '16px 18px',
                    textAlign: 'left',
                    background: active ? 'rgba(255, 46, 138, 0.08)' : 'transparent',
                    borderBottom: i < preview.tracks.length - 1 ? `1px solid ${RI.border}` : 'none',
                    borderLeft: `3px solid ${active ? RI.pink : 'transparent'}`,
                    color: RI.textPrimary,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    fontFamily: 'inherit',
                  }}>
                  <span style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 14,
                    fontWeight: 600,
                    color: active ? RI.yellow : RI.textDim,
                    width: 28,
                    letterSpacing: '0.05em',
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 15,
                      fontWeight: active ? 600 : 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 13, color: RI.textMuted, marginTop: 2 }}>
                      {t.artist}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, flexShrink: 0 }}>
                    {fb.vote === 1 && <span style={{ color: '#22c55e' }}>♥</span>}
                    {fb.vote === -1 && <span style={{ color: RI.pink }}>✕</span>}
                    {fb.comment && <span style={{ color: RI.yellow }}>✎</span>}
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

        {/* Footer */}
        <div style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: `1px solid ${RI.border}`,
          textAlign: 'center',
          fontSize: 10,
          letterSpacing: '0.2em',
          color: RI.textDim,
          textTransform: 'uppercase',
          fontFamily: FONT_DISPLAY,
        }}>
          Radio Ibiza · Identidade Musical · Preview expira em {expiresAt.toLocaleDateString('pt-BR')}
        </div>
      </div>

      <style>{`
        @keyframes bar { 0%, 100% { height: 4px } 50% { height: 14px } }
      `}</style>
    </div>
  )
}

function CircleBtn({ onClick, disabled, children, size = 48, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size,
        height: size,
        background: primary ? RI.pink : RI.bgCard,
        color: 'white',
        border: primary ? 'none' : `1px solid ${RI.borderStrong}`,
        borderRadius: '50%',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'transform 0.08s, background 0.15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        if (primary) e.currentTarget.style.background = RI.pinkDeep
        else e.currentTarget.style.background = RI.bgSoft
      }}
      onMouseLeave={(e) => {
        if (primary) e.currentTarget.style.background = RI.pink
        else e.currentTarget.style.background = RI.bgCard
      }}
    >
      {children}
    </button>
  )
}

function VoteBtn({ active, activeColor, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: active ? activeColor : RI.bgCard,
        color: active ? RI.bg : RI.textPrimary,
        border: `1px solid ${active ? activeColor : RI.borderStrong}`,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  )
}

function Bar({ delay }) {
  return <span style={{
    width: 3,
    background: RI.yellow,
    animation: 'bar 0.9s ease-in-out infinite',
    animationDelay: `${delay}s`,
  }} />
}
