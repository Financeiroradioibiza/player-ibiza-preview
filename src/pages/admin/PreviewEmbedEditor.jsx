import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase, generateCode } from '../../lib/supabase.js'

// Converte uma URL do Spotify em URL de embed
function toEmbedUrl(url) {
  if (!url) return null
  const m = url.match(/spotify\.com\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/)
  if (!m) return null
  return `https://open.spotify.com/embed/${m[1]}/${m[2]}`
}

function isValidSpotifyUrl(url) {
  return !!toEmbedUrl(url)
}

export default function PreviewEmbedEditor() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)

  const [clientName, setClientName] = useState('')
  const [days, setDays] = useState(7)
  const [spotifyUrl, setSpotifyUrl] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id))
  }, [])

  useEffect(() => {
    if (id) load()
    else setLoading(false)
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
      setSpotifyUrl(p.spotify_embed_url || '')
    }
    setLoading(false)
  }

  // Criar e publicar de uma vez (fluxo simples)
  async function createAndPublish(e) {
    e.preventDefault()
    setError('')
    if (!clientName.trim()) {
      setError('Informe o nome do cliente')
      return
    }
    if (!isValidSpotifyUrl(spotifyUrl)) {
      setError('Cole uma URL válida do Spotify (playlist, álbum ou faixa)')
      return
    }
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const code = generateCode()
      const expiresAt = new Date(Date.now() + (days || 7) * 86400000).toISOString()

      const finalEmbedUrl = toEmbedUrl(spotifyUrl)
      if (!finalEmbedUrl) {
        setError('URL inválida do Spotify')
        setSubmitting(false)
        return
      }

      if (id) {
        // Atualizar existente
        const { error: updErr } = await supabase
          .from('previews')
          .update({
            client_name: clientName.trim(),
            days_valid: days,
            spotify_embed_url: finalEmbedUrl,
            status: 'active',
            code: preview.code || code,
            expires_at: preview.expires_at || expiresAt,
          })
          .eq('id', id)
        if (updErr) throw updErr
        navigate(`/admin/previews/${id}`)
      } else {
        // Criar novo
        const { data, error: insErr } = await supabase
          .from('previews')
          .insert({
            client_name: clientName.trim(),
            days_valid: days,
            status: 'active',
            kind: 'embed',
            spotify_embed_url: finalEmbedUrl,
            code,
            expires_at: expiresAt,
            created_by: user.id,
          })
          .select()
          .single()
        if (insErr) throw insErr
        navigate(`/admin/previews/${data.id}`)
      }
    } catch (e) {
      setError(e.message || 'Erro')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="muted">Carregando…</div>

  const isEdit = !!id
  const isMine = !isEdit || (currentUserId === preview?.created_by)
  if (isEdit && !isMine) {
    return (
      <div>
        <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
        <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: 40 }}>
          <p>Este preview foi criado por outro admin.</p>
        </div>
      </div>
    )
  }

  const embedUrl = toEmbedUrl(spotifyUrl)

  return (
    <div>
      <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 24 }}>
        <h1 className="display" style={{ fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em' }}>
          {isEdit ? 'Editar preview Spotify' : 'Novo preview Spotify embed'}
        </h1>
        <span className="badge" style={{ background: '#1DB954', color: 'white', fontSize: 10 }}>
          SPOTIFY
        </span>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
          O cliente vai ver o player oficial do Spotify embedado, com a sua identidade Radio Ibiza ao redor. Ideal pra cliente que já tem Spotify Premium.
        </p>

        <form onSubmit={createAndPublish} style={{ display: 'grid', gap: 16 }}>
          <div className="field">
            <label>Nome do cliente</label>
            <input className="input" value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex: Hotel Copacabana" required />
          </div>

          <div className="field">
            <label>Validade (dias)</label>
            <input className="input" type="number" min={1} max={365}
              value={days} onChange={(e) => setDays(parseInt(e.target.value) || 1)} required />
          </div>

          <div className="field">
            <label>URL do Spotify (playlist, álbum, faixa)</label>
            <input className="input" value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/..." required />
            {spotifyUrl && !embedUrl && (
              <p style={{ color: 'var(--rose)', fontSize: 12, marginTop: 6 }}>
                URL inválida. Cole o link compartilhado do Spotify.
              </p>
            )}
          </div>

          {/* Preview do embed */}
          {embedUrl && (
            <div>
              <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Pré-visualização:</p>
              <iframe
                src={embedUrl}
                width="100%"
                height="352"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                style={{ borderRadius: 12 }}
              />
            </div>
          )}

          {error && <div style={{ color: 'var(--rose)', fontSize: 14 }}>{error}</div>}

          <button className="btn btn-accent" disabled={submitting}
            style={{ justifyContent: 'center', padding: 12 }}>
            {submitting
              ? 'Publicando…'
              : isEdit
                ? 'Salvar alterações'
                : 'Publicar preview e gerar código →'}
          </button>
        </form>
      </div>
    </div>
  )
}
