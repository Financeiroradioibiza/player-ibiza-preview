import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

export default function PreviewsList() {
  const [tab, setTab] = useState('active') // active | archived
  const [previews, setPreviews] = useState([])
  const [archivedCount, setArchivedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('previews')
      .select('*, preview_tracks(count), access_logs(count)')
      .eq('is_archived', tab === 'archived')
      .order('created_at', { ascending: false })
    setPreviews(data || [])

    const { count } = await supabase
      .from('previews')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', true)
    setArchivedCount(count || 0)

    setLoading(false)
  }

  function statusOf(p) {
    if (p.is_archived) return { label: 'Arquivado', cls: 'badge-expired' }
    if (!p.is_active) return { label: 'Desativado', cls: 'badge-expired' }
    if (new Date(p.expires_at) < new Date()) return { label: 'Expirado', cls: 'badge-expired' }
    const daysLeft = Math.ceil((new Date(p.expires_at) - new Date()) / 86400000)
    if (daysLeft <= 2) return { label: `${daysLeft}d restantes`, cls: 'badge-warn' }
    return { label: `${daysLeft}d restantes`, cls: 'badge-active' }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 className="display" style={{ fontSize: 40, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Previews
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {previews.length} {previews.length === 1 ? 'preview' : 'previews'}
          </p>
        </div>
        <Link to="/admin/previews/new" className="btn btn-accent">+ Novo preview</Link>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <Tab active={tab === 'active'} onClick={() => setTab('active')}>Ativos</Tab>
        <Tab active={tab === 'archived'} onClick={() => setTab('archived')}>
          Arquivados
          {archivedCount > 0 && (
            <span style={{
              marginLeft: 8, padding: '1px 8px', borderRadius: 999,
              background: 'var(--cream-soft)', color: 'var(--muted)', fontSize: 11, fontWeight: 600,
            }}>{archivedCount}</span>
          )}
        </Tab>
      </div>

      {loading ? (
        <div className="muted">Carregando…</div>
      ) : previews.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p className="muted">
            {tab === 'active' ? 'Nenhum preview ativo. Crie o primeiro.' : 'Nenhum preview arquivado.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Código</th>
                <th>Faixas</th>
                <th>Acessos</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {previews.map((p) => {
                const status = statusOf(p)
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.client_name}</td>
                    <td><span className="mono" style={{ fontSize: 13 }}>{p.code}</span></td>
                    <td>{p.preview_tracks?.[0]?.count ?? 0}</td>
                    <td>{p.access_logs?.[0]?.count ?? 0}</td>
                    <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/admin/previews/${p.id}`} className="btn btn-ghost btn-sm">Abrir</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
