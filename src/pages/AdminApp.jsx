import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

import PreviewsList from './admin/PreviewsList.jsx'
import PreviewEditor from './admin/PreviewEditor.jsx'
import PreviewEmbedEditor from './admin/PreviewEmbedEditor.jsx'
import PreviewDetail from './admin/PreviewDetail.jsx'

export default function AdminApp() {
  const navigate = useNavigate()
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    async function check() {
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 5000)),
        ])
        // Se tem sessão, está logado. Confiamos no login inicial (que exigiu TOTP).
        setSession(session || null)
      } catch (e) {
        console.error('Erro no check de sessão:', e)
        setSession(null)
      }
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session || null)
    })
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
          <NavLink to="/admin" className="display" style={{
            fontSize: 22, letterSpacing: '-0.01em', textDecoration: 'none', color: 'inherit',
          }}>
            Radio Ibiza <span className="mono" style={{
              fontSize: 10, color: 'var(--cobalt)', verticalAlign: 'middle',
              marginLeft: 6, letterSpacing: '0.2em',
            }}>ADMIN</span>
          </NavLink>
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
          <Route path="previews/new-embed" element={<PreviewEmbedEditor />} />
          <Route path="previews/:id/edit" element={<PreviewEditor />} />
          <Route path="previews/:id/edit-embed" element={<PreviewEmbedEditor />} />
          <Route path="previews/:id" element={<PreviewDetail />} />
        </Routes>
      </main>
    </div>
  )
}
