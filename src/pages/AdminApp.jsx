import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

import PreviewsList from './admin/PreviewsList.jsx'
import PreviewEditor from './admin/PreviewEditor.jsx'
import PreviewDetail from './admin/PreviewDetail.jsx'
import TracksLibrary from './admin/TracksLibrary.jsx'
import Downloads from './admin/Downloads.jsx'

export default function AdminApp() {
  const navigate = useNavigate()
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setSession(null); return }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel !== 'aal2') { setSession(null); return }
      setSession(session)
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())
    return () => sub?.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div style={{ padding: 40 }}>Carregando…</div>
  if (session === null) return <Navigate to="/admin/login" replace />

  async function logout() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 28px', borderBottom: '1px solid var(--border)',
        background: 'white',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div className="display" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>
            Radio Ibiza <span className="mono" style={{
              fontSize: 10, color: 'var(--cobalt)', verticalAlign: 'middle',
              marginLeft: 6, letterSpacing: '0.2em',
            }}>ADMIN</span>
          </div>
          <nav style={{ display: 'flex', gap: 4 }}>
            <NavTab to="/admin">Previews</NavTab>
            <NavTab to="/admin/tracks">Acervo</NavTab>
            <NavTab to="/admin/downloads">Downloads</NavTab>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {session.user.email}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sair</button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px 28px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <Routes>
          <Route index element={<PreviewsList />} />
          <Route path="previews/new" element={<PreviewEditor />} />
          <Route path="previews/:id" element={<PreviewDetail />} />
          <Route path="previews/:id/edit" element={<PreviewEditor />} />
          <Route path="tracks" element={<TracksLibrary />} />
          <Route path="downloads" element={<Downloads />} />
        </Routes>
      </main>
    </div>
  )
}

function NavTab({ to, children }) {
  return (
    <NavLink to={to} end style={({ isActive }) => ({
      padding: '8px 14px',
      borderRadius: 'var(--radius-md)',
      fontSize: 14,
      fontWeight: 500,
      color: isActive ? 'var(--cobalt)' : 'var(--ink)',
      background: isActive ? 'rgba(34, 56, 255, 0.08)' : 'transparent',
    })}>
      {children}
    </NavLink>
  )
}
