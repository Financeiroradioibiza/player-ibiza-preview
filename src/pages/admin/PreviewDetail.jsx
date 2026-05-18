import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

export default function PreviewDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(null)
  const [logs, setLogs] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('info') // info | feedback | logs

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const { data: p } = await supabase
      .from('previews')
      .select('*, preview_tracks(position, tracks(id, title, artist, status))')
      .eq('id', id)
      .single()
    setPreview(p)

    const { data: l } = await supabase
      .from('access_logs')
      .select('*')
      .eq('preview_id', id)
      .order('accessed_at', { ascending: false })
      .limit(100)
    setLogs(l || [])

    const { data: fb } = await supabase
      .from('track_feedback')
      .select('*, tracks(title, artist)')
      .eq('preview_id', id)
      .order('updated_at', { ascending: false })
    setFeedback(fb || [])

    setLoading(false)
  }

  async function deactivate() {
    if (!confirm('Desativar este preview? O cliente não conseguirá mais acessar.')) return
    await supabase.from('previews').update({ is_active: false }).eq('id', id)
    load()
  }
  async function reactivate() {
    await supabase.from('previews').update({ is_active: true }).eq('id', id)
    load()
  }
  async function extend(extraDays) {
    const newExpiry = new Date(
      Math.max(Date.now(), new Date(preview.expires_at).getTime()) + extraDays * 86400000
    ).toISOString()
    await supabase.from('previews').update({ expires_at: newExpiry }).eq('id', id)
    load()
  }

  async function archive() {
    if (!confirm(
      'Arquivar este preview?\n\n' +
      '• Mantém: nome do cliente, código, lista de músicas (nomes), votos e comentários, logs de acesso.\n' +
      '• Remove: os arquivos de áudio (caso não estejam em outro preview ativo).\n\n' +
      'O cliente não poderá mais acessar e a ação não é reversível para os áudios.'
    )) return

    // 1. Marcar como arquivado
    await supabase
      .from('previews')
      .update({ is_archived: true, archived_at: new Date().toISOString(), is_active: false })
      .eq('id', id)

    // 2. Para cada música deste preview, se NÃO estiver em nenhum outro preview ativo,
    //    apaga o arquivo do storage e marca a track como 'archived'
    const trackIds = (preview.preview_tracks || []).map((pt) => pt.tracks.id)

    for (const tid of trackIds) {
      // Está em outro preview ainda ativo (não-arquivado)?
      const { count } = await supabase
        .from('preview_tracks')
        .select('preview_id, previews!inner(id, is_archived)', { count: 'exact', head: true })
        .eq('track_id', tid)
        .eq('previews.is_archived', false)

      if ((count || 0) === 0) {
        // Pode arquivar — busca o storage_path
        const { data: t } = await supabase.from('tracks').select('storage_path').eq('id', tid).single()
        if (t?.storage_path) {
          await supabase.storage.from('tracks').remove([t.storage_path])
        }
        await supabase.from('tracks')
          .update({ storage_path: null, status: 'archived' })
          .eq('id', tid)
      }
    }

    load()
  }

  async function deletePreview() {
    if (!confirm('Excluir permanentemente este preview e todos os logs/feedbacks?')) return
    await supabase.from('previews').delete().eq('id', id)
    navigate('/admin')
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/player/${preview.code}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="muted">Carregando…</div>
  if (!preview) return <div className="muted">Preview não encontrado.</div>

  const expired = new Date(preview.expires_at) < new Date()
  const archived = preview.is_archived
  const tracks = (preview.preview_tracks || []).sort((a, b) => a.position - b.position)
  const playerLink = `${window.location.origin}/player/${preview.code}`

  // Agrega feedback por faixa
  const fbByTrack = {}
  feedback.forEach((f) => {
    if (!fbByTrack[f.track_id]) fbByTrack[f.track_id] = { up: 0, down: 0, comments: [], title: f.tracks?.title, artist: f.tracks?.artist }
    if (f.vote === 1) fbByTrack[f.track_id].up++
    if (f.vote === -1) fbByTrack[f.track_id].down++
    if (f.comment) fbByTrack[f.track_id].comments.push({ text: f.comment, when: f.updated_at, session: f.client_session })
  })

  // Lista todas as faixas (mesmo sem feedback) na ordem do preview
  const feedbackRows = tracks.map((pt) => {
    const tid = pt.tracks.id
    return {
      track_id: tid,
      title: pt.tracks.title,
      artist: pt.tracks.artist,
      up: fbByTrack[tid]?.up || 0,
      down: fbByTrack[tid]?.down || 0,
      comments: fbByTrack[tid]?.comments || [],
      archived: pt.tracks.status === 'archived',
    }
  })

  const totalUp = feedbackRows.reduce((s, r) => s + r.up, 0)
  const totalDown = feedbackRows.reduce((s, r) => s + r.down, 0)
  const totalComments = feedbackRows.reduce((s, r) => s + r.comments.length, 0)

  return (
    <div>
      <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Todos os previews</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8, marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="display" style={{ fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em' }}>
            {preview.client_name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 18, color: 'var(--cobalt)', letterSpacing: '0.1em' }}>
              {preview.code}
            </span>
            {archived && <span className="badge badge-expired">Arquivado</span>}
            {!archived && !preview.is_active && <span className="badge badge-expired">Desativado</span>}
            {!archived && preview.is_active && expired && <span className="badge badge-expired">Expirado</span>}
            {!archived && preview.is_active && !expired && <span className="badge badge-active">Ativo</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!archived && (
            <Link to={`/admin/previews/${id}/edit`} className="btn btn-ghost">Editar</Link>
          )}
          {!archived && (preview.is_active
            ? <button className="btn btn-ghost" onClick={deactivate}>Desativar</button>
            : <button className="btn btn-ghost" onClick={reactivate}>Reativar</button>)}
          {!archived && (
            <button className="btn btn-ghost" onClick={archive} title="Mantém os dados mas remove os áudios para economizar espaço">
              📦 Arquivar
            </button>
          )}
          <button className="btn btn-danger" onClick={deletePreview}>Excluir</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <Tab active={tab === 'info'} onClick={() => setTab('info')}>Informações</Tab>
        <Tab active={tab === 'feedback'} onClick={() => setTab('feedback')}>
          Feedback do cliente
          {(totalUp + totalDown + totalComments) > 0 && (
            <span style={{
              marginLeft: 8, padding: '1px 8px', borderRadius: 999,
              background: 'var(--cobalt)', color: 'white', fontSize: 11, fontWeight: 600,
            }}>{totalUp + totalDown + totalComments}</span>
          )}
        </Tab>
        <Tab active={tab === 'logs'} onClick={() => setTab('logs')}>
          Acessos
          {logs.length > 0 && (
            <span style={{
              marginLeft: 8, padding: '1px 8px', borderRadius: 999,
              background: 'var(--cream-soft)', color: 'var(--muted)', fontSize: 11, fontWeight: 600,
            }}>{logs.length}</span>
          )}
        </Tab>
      </div>

      {tab === 'info' && (
        <div className="card">
          {!archived && (
            <>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
                Link de acesso
              </h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input className="input mono" readOnly value={playerLink} style={{ fontSize: 12, flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={copyLink}>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>

              <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
                Validade
              </h3>
              <p style={{ fontSize: 15, marginBottom: 12 }}>
                Expira em <strong>{new Date(preview.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => extend(7)}>+7 dias</button>
                <button className="btn btn-ghost btn-sm" onClick={() => extend(15)}>+15 dias</button>
                <button className="btn btn-ghost btn-sm" onClick={() => extend(30)}>+30 dias</button>
              </div>
            </>
          )}

          {archived && (
            <div style={{
              padding: 16, marginBottom: 16,
              background: 'rgba(255, 154, 60, 0.1)',
              border: '1px solid var(--amber-deep)',
              borderRadius: 'var(--radius-md)', fontSize: 14,
            }}>
              Este preview está arquivado. Áudios foram removidos em {new Date(preview.archived_at).toLocaleDateString('pt-BR')}.
              Os dados (nomes das músicas, votos, comentários, acessos) foram preservados.
            </div>
          )}

          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
            Faixas ({tracks.length})
          </h3>
          <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {tracks.map((row, i) => (
              <li key={i} style={{ fontSize: 14, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="mono muted">{String(i + 1).padStart(2, '0')}.</span>{' '}
                {row.tracks.title} — <span className="muted">{row.tracks.artist}</span>
                {row.tracks.status === 'archived' && (
                  <span className="badge badge-warn" style={{ marginLeft: 8 }}>áudio removido</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 'feedback' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <Stat label="Curtidas" value={totalUp} color="#16a34a" />
            <Stat label="Não curtiu" value={totalDown} color="var(--rose)" />
            <Stat label="Comentários" value={totalComments} color="var(--cobalt)" />
          </div>

          {feedbackRows.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p className="muted">Nenhuma faixa neste preview.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {feedbackRows.map((r) => {
                const hasAny = r.up + r.down + r.comments.length > 0
                return (
                  <div key={r.track_id} className="card" style={{
                    padding: 14, opacity: hasAny ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title}
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>{r.artist}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 14, flexShrink: 0 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a' }}>
                          ♥ {r.up}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--rose)' }}>
                          ✕ {r.down}
                        </span>
                        {r.comments.length > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--cobalt)' }}>
                            ✎ {r.comments.length}
                          </span>
                        )}
                      </div>
                    </div>
                    {r.comments.length > 0 && (
                      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                        {r.comments.map((c, i) => (
                          <div key={i} style={{
                            background: 'var(--cream-soft)',
                            borderLeft: '3px solid var(--cobalt)',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: 13,
                          }}>
                            <div>{c.text}</div>
                            <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
                              {new Date(c.when).toLocaleString('pt-BR')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="card">
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 16 }}>
            Acessos do cliente
          </h3>
          {logs.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>O cliente ainda não acessou.</p>
          ) : (
            <div>
              {logs.map((l) => (
                <div key={l.id} style={{
                  padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
                }}>
                  <div>{new Date(l.accessed_at).toLocaleString('pt-BR')}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {l.user_agent?.slice(0, 100)}
                  </div>
                </div>
              ))}
            </div>
          )}
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
      display: 'inline-flex', alignItems: 'center',
    }}>
      {children}
    </button>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="card" style={{ padding: 16, textAlign: 'center' }}>
      <div className="display" style={{ fontSize: 38, lineHeight: 1, color, fontWeight: 400 }}>{value}</div>
      <div className="mono muted" style={{ fontSize: 10, letterSpacing: '0.12em', marginTop: 6 }}>
        {label.toUpperCase()}
      </div>
    </div>
  )
}
