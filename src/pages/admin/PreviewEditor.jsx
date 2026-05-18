import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase, generateCode } from '../../lib/supabase.js'

export default function PreviewEditor() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = !!id

  const [clientName, setClientName] = useState('')
  const [code, setCode] = useState(generateCode())
  const [days, setDays] = useState(7)
  const [allTracks, setAllTracks] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadTracks()
    if (isEditing) loadPreview()
  }, [id])

  async function loadTracks() {
    const { data } = await supabase
      .from('tracks')
      .select('*')
      .eq('status', 'approved')
      .order('title')
    setAllTracks(data || [])
  }

  async function loadPreview() {
    const { data: p } = await supabase
      .from('previews')
      .select('*, preview_tracks(track_id, position)')
      .eq('id', id)
      .single()
    if (!p) return
    setClientName(p.client_name)
    setCode(p.code)
    const created = new Date(p.created_at)
    const expires = new Date(p.expires_at)
    setDays(Math.round((expires - created) / 86400000))
    const sorted = (p.preview_tracks || []).sort((a, b) => a.position - b.position)
    setSelectedIds(sorted.map((t) => t.track_id))
  }

  function toggle(trackId) {
    setSelectedIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    )
  }

  function moveTrack(trackId, direction) {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(trackId)
      if (idx === -1) return prev
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
      return copy
    })
  }

  async function save() {
    setError('')
    if (!clientName.trim()) { setError('Informe o nome do cliente'); return }
    if (selectedIds.length === 0) { setError('Selecione pelo menos uma faixa'); return }
    setSaving(true)
    try {
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString()
      const { data: { user } } = await supabase.auth.getUser()

      let previewId = id
      if (isEditing) {
        const { error } = await supabase
          .from('previews')
          .update({ client_name: clientName.trim(), expires_at: expiresAt, days_valid: days })
          .eq('id', id)
        if (error) throw error
        await supabase.from('preview_tracks').delete().eq('preview_id', id)
      } else {
        const { data, error } = await supabase
          .from('previews')
          .insert({
            code, client_name: clientName.trim(),
            days_valid: days, expires_at: expiresAt,
            created_by: user.id,
          })
          .select().single()
        if (error) throw error
        previewId = data.id
      }

      const rows = selectedIds.map((trackId, position) => ({
        preview_id: previewId, track_id: trackId, position,
      }))
      const { error: linkErr } = await supabase.from('preview_tracks').insert(rows)
      if (linkErr) throw linkErr

      navigate(`/admin/previews/${previewId}`)
    } catch (e) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const filtered = allTracks.filter((t) =>
    (t.title + ' ' + t.artist).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Link to="/admin" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
      <h1 className="display" style={{ fontSize: 36, fontWeight: 400, margin: '8px 0 24px' }}>
        {isEditing ? 'Editar preview' : 'Novo preview'}
      </h1>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
            Configuração
          </h3>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="field">
              <label>Nome do cliente</label>
              <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Restaurante Casa 21" />
            </div>
            <div className="field">
              <label>Código de acesso</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input mono" value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={isEditing}
                  style={{ flex: 1, letterSpacing: '0.1em' }} />
                {!isEditing && (
                  <button className="btn btn-ghost btn-sm" type="button"
                    onClick={() => setCode(generateCode())}>
                    Gerar novo
                  </button>
                )}
              </div>
            </div>
            <div className="field">
              <label>Validade (dias)</label>
              <input className="input" type="number" min={1} max={365}
                value={days} onChange={(e) => setDays(parseInt(e.target.value) || 1)} />
              <small className="muted" style={{ fontSize: 12 }}>
                Expira em {new Date(Date.now() + days * 86400000).toLocaleDateString('pt-BR')}
              </small>
            </div>
          </div>

          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

          <h3 style={{ marginBottom: 12, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
            Faixas selecionadas ({selectedIds.length})
          </h3>
          {selectedIds.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Nenhuma faixa selecionada ainda.</p>
          ) : (
            <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {selectedIds.map((tid, i) => {
                const t = allTracks.find((x) => x.id === tid)
                if (!t) return null
                return (
                  <li key={tid} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', background: 'var(--cream-soft)',
                    borderRadius: 'var(--radius-sm)', fontSize: 13,
                  }}>
                    <span className="mono muted" style={{ width: 24 }}>{i + 1}.</span>
                    <span style={{ flex: 1 }}>{t.title} — <span className="muted">{t.artist}</span></span>
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => moveTrack(tid, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => moveTrack(tid, 1)} disabled={i === selectedIds.length - 1}>↓</button>
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => toggle(tid)}>×</button>
                  </li>
                )
              })}
            </ol>
          )}

          {error && <div style={{ color: 'var(--rose)', marginTop: 16, fontSize: 14 }}>{error}</div>}

          <button className="btn btn-primary" onClick={save} disabled={saving}
            style={{ marginTop: 20, justifyContent: 'center', width: '100%' }}>
            {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar preview'}
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
              Acervo aprovado
            </h3>
            <Link to="/admin/tracks" className="muted" style={{ fontSize: 12 }}>Gerenciar →</Link>
          </div>
          <input className="input" placeholder="Buscar por título ou artista"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: 500, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {filtered.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, padding: 12 }}>
                Nenhuma música aprovada. <Link to="/admin/tracks" style={{ color: 'var(--cobalt)' }}>Aprovar pendentes</Link>.
              </p>
            ) : filtered.map((t) => {
              const selected = selectedIds.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => toggle(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', textAlign: 'left',
                    borderRadius: 'var(--radius-sm)',
                    background: selected ? 'rgba(34, 56, 255, 0.08)' : 'transparent',
                    border: `1px solid ${selected ? 'var(--cobalt)' : 'transparent'}`,
                  }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 4,
                    border: '1.5px solid ' + (selected ? 'var(--cobalt)' : 'var(--border-strong)'),
                    background: selected ? 'var(--cobalt)' : 'transparent',
                    color: 'white', fontSize: 12, display: 'grid', placeItems: 'center',
                  }}>{selected ? '✓' : ''}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{t.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{t.artist}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
