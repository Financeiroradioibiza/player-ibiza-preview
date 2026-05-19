import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

export default function PreviewsList() {
  const [tab, setTab] = useState('active') // draft | active | archived
  const [previews, setPreviews] = useState([])
  const [counts, setCounts] = useState({ draft: 0, active: 0, archived: 0 })
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id))
  }, [])

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    let query = supabase.from('previews').select('*, tracks(count), access_logs(count)')

    if (tab === 'archived') {
      query = query.eq('is_archived', true)
    } else {
      query = query.eq('is_archived', false).eq('status', tab)
    }

    const { data } = await query.order('created_at', { ascending: false })
    setPreviews(data || [])

    // Contagens (queries simples)
    const [d, a, ar] = await Promise.all([
      supabase.from('previews').select('*', { count: 'exact', head: true }).eq('status', 'draft').eq('is_archived', false),
      supabase.from('previews').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_archived', false),
      supabase.from('previews').select('*', { count: 'exact', head: true }).eq('is_archived', true),
    ])
    setCounts({ draft: d.count || 0, active: a.count || 0, archived: ar.count || 0 })
    setLoading(false)
  }

  function statusOf(p) {
    if (p.is_archived) return { label: 'Arquivado', cls: 'badge-expired' }
    if (p.status === 'draft') return { label: 'Rascunho', cls: 'badge-warn' }
    if (p.expires_at && new Date(p.expires_at) < new Date()) return { label: 'Expirado', cls: 'badge-expired' }
    if (p.expires_at) {
      const daysLeft = Math.ceil((new Date(p.expires_at) - new Date()) / 86400000)
      if (daysLeft <= 2) return { label: `${daysLeft}d restantes`, cls: 'badge-warn' }
      return { label: `${daysLeft}d restantes`, cls: 'badge-active' }
    }
    return { label: 'Ativo', cls: 'badge-active' }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 className="display" style={{ fontSize: 40, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Previews
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {previews.length} {previews.length === 1 ? 'preview' : 'previews'} nesta aba
          </p>
        </div>
        <Link to="/admin/previews/new" className="btn btn-accent">+ Novo preview</Link>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <Tab active={tab === 'draft'} onClick={() => setTab('draft')}>
          Rascunhos {counts.draft > 0 && <Pill color="var(--amber)" textColor="var(--ink)">{counts.draft}</Pill>}
        </Tab>
        <Tab active={tab === 'active'} onClick={() => setTab('active')}>
          Ativos {counts.active > 0 && <Pill color="var(--cobalt)" textColor="white">{counts.active}</Pill>}
        </Tab>
        <Tab active={tab === 'archived'} onClick={() => setTab('archived')}>
          Arquivados {counts.archived > 0 && <Pill color="var(--cream-soft)" textColor="var(--muted)">{counts.archived}</Pill>}
        </Tab>
      </div>

      {loading ? (
        <div className="muted">Carregando…</div>
      ) : previews.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p className="muted">
            {tab === 'draft' && 'Nenhum rascunho. Crie um novo preview para começar.'}
            {tab === 'active' && 'Nenhum preview ativo.'}
            {tab === 'archived' && 'Nenhum preview arquivado.'}
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
                const isMine = currentUserId && p.created_by === currentUserId
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>
                      {p.client_name}
                      {!isMine && (
                        <span className="badge" style={{
                          marginLeft: 8, background: 'var(--cream-soft)', color: 'var(--muted)', fontSize: 10,
                        }}>
                          de outro admin
                        </span>
                      )}
                    </td>
                    <td>
                      {p.code
                        ? <span className="mono" style={{ fontSize: 13 }}>{p.code}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>{p.tracks?.[0]?.count ?? 0}</td>
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
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {children}
    </button>
  )
}

function Pill({ children, color, textColor }) {
  return (
    <span style={{
      padding: '1px 8px', borderRadius: 999,
      background: color, color: textColor, fontSize: 11, fontWeight: 600,
    }}>{children}</span>
  )
}
