import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

export default function Downloads() {
  const [jobs, setJobs] = useState([])
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [openJob, setOpenJob] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!openJob) return
    loadItems(openJob)
    const t = setInterval(() => loadItems(openJob), 3000)
    return () => clearInterval(t)
  }, [openJob])

  async function load() {
    const { data } = await supabase
      .from('download_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setJobs(data || [])
  }

  async function loadItems(jobId) {
    const { data } = await supabase
      .from('download_job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('updated_at')
    setItems(data || [])
  }

  async function submitJob(e) {
    e.preventDefault()
    setError('')
    if (!url.match(/spotify\.com\/playlist\//)) {
      setError('Cole um link válido de playlist do Spotify')
      return
    }
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('download_jobs').insert({
        spotify_url: url.trim(),
        created_by: user.id,
      })
      if (error) throw error
      setUrl('')
      load()
    } catch (e) {
      setError(e.message || 'Erro ao criar job')
    } finally {
      setSubmitting(false)
    }
  }

  function statusBadge(s) {
    if (s === 'queued') return <span className="badge badge-warn">Na fila</span>
    if (s === 'processing') return <span className="badge badge-active">Processando…</span>
    if (s === 'done') return <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>Concluído</span>
    if (s === 'failed') return <span className="badge badge-expired">Falhou</span>
    return <span className="badge">{s}</span>
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 className="display" style={{ fontSize: 40, fontWeight: 400, letterSpacing: '-0.02em' }}>
          Downloads
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Cole o link de uma playlist do Spotify e o worker baixa todas as faixas pro acervo (status "pendente").
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={submitJob} style={{ display: 'flex', gap: 10 }}>
          <input className="input" placeholder="https://open.spotify.com/playlist/..."
            value={url} onChange={(e) => setUrl(e.target.value)}
            style={{ flex: 1 }} required />
          <button className="btn btn-accent" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Baixar playlist'}
          </button>
        </form>
        {error && <div style={{ color: 'var(--rose)', marginTop: 10, fontSize: 14 }}>{error}</div>}
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          O download fica em background. Você pode fechar esta página e voltar depois — o progresso é salvo.
          Quando terminar, as músicas ficam disponíveis em <Link to="/admin/tracks" style={{ color: 'var(--cobalt)' }}>Acervo</Link> com status "pendente" para você aprovar.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p className="muted">Nenhum download ainda.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Playlist</th>
                <th>Progresso</th>
                <th>Status</th>
                <th>Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} className="mono">
                    {j.spotify_url}
                  </td>
                  <td className="mono" style={{ fontSize: 13 }}>
                    {j.completed_tracks}/{j.total_tracks || '—'}
                  </td>
                  <td>{statusBadge(j.status)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {new Date(j.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setOpenJob(openJob === j.id ? null : j.id)}>
                      {openJob === j.id ? 'Fechar' : 'Ver faixas'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {openJob && (
            <div style={{ background: 'var(--cream-soft)', padding: 20, borderTop: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
                Faixas do job
              </h3>
              {items.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>Aguardando worker iniciar…</p>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {items.map((i) => (
                    <div key={i.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px 10px', background: 'white', borderRadius: 'var(--radius-sm)',
                      fontSize: 13,
                    }}>
                      <span style={{ width: 18, textAlign: 'center' }}>
                        {i.status === 'done' && '✓'}
                        {i.status === 'failed' && '✗'}
                        {i.status === 'downloading' && '⏳'}
                        {i.status === 'pending' && '·'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div>{i.title}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {i.artist}
                          {i.error_message && <span style={{ color: 'var(--rose)' }}> — {i.error_message}</span>}
                        </div>
                      </div>
                      <span className="muted" style={{ fontSize: 11 }}>{i.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
