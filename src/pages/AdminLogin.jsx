import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState('credentials') // credentials | totp | enrolling
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [factorId, setFactorId] = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [enrollQR, setEnrollQR] = useState(null)
  const [enrollSecret, setEnrollSecret] = useState(null)
  const [enrollFactorId, setEnrollFactorId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Se já tem sessão completa (AAL2 com TOTP), pula direto
    checkSession()
  }, [])

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') {
      navigate('/admin')
    }
  }

  async function handleCredentials(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signErr) throw signErr

      // Verifica se já tem TOTP configurado
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verifiedTotp = factors?.totp?.find((f) => f.status === 'verified')

      if (verifiedTotp) {
        // Já tem MFA — pedir código
        const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
          factorId: verifiedTotp.id,
        })
        if (chErr) throw chErr
        setFactorId(verifiedTotp.id)
        setChallengeId(challenge.id)
        setStep('totp')
      } else {
        // Primeiro login — configurar TOTP agora
        const { data: enroll, error: enErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Radio Ibiza Admin',
        })
        if (enErr) throw enErr
        setEnrollFactorId(enroll.id)
        setEnrollQR(enroll.totp.qr_code)
        setEnrollSecret(enroll.totp.secret)
        setStep('enrolling')
      }
    } catch (err) {
      setError(err.message || 'Falha ao entrar')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyTotp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      })
      if (vErr) throw vErr
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'Código inválido')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnrollVerify(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enrollFactorId,
      })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.id,
        code: totpCode,
      })
      if (vErr) throw vErr
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'Código inválido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" className="mono" style={{
            fontSize: 11, letterSpacing: '0.3em', color: 'var(--muted)',
          }}>
            ← RADIO IBIZA
          </Link>
          <h1 className="display" style={{
            fontSize: 38, fontWeight: 400, marginTop: 12, letterSpacing: '-0.02em',
          }}>
            {step === 'credentials' && 'Entrar'}
            {step === 'totp' && 'Verificação'}
            {step === 'enrolling' && 'Configurar 2FA'}
          </h1>
        </div>

        <div className="card">
          {step === 'credentials' && (
            <form onSubmit={handleCredentials} style={{ display: 'grid', gap: 16 }}>
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>Senha</label>
                <input className="input" type="password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <div style={{ color: 'var(--rose)', fontSize: 14 }}>{error}</div>}
              <button className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
                {loading ? 'Entrando...' : 'Continuar'}
              </button>
            </form>
          )}

          {step === 'totp' && (
            <form onSubmit={handleVerifyTotp} style={{ display: 'grid', gap: 16 }}>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Digite o código de 6 dígitos do seu Google Authenticator.
              </p>
              <div className="field">
                <label>Código</label>
                <input className="input mono" inputMode="numeric" maxLength={6}
                  required autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  style={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' }} />
              </div>
              {error && <div style={{ color: 'var(--rose)', fontSize: 14 }}>{error}</div>}
              <button className="btn btn-primary" disabled={loading || totpCode.length !== 6}
                style={{ justifyContent: 'center' }}>
                {loading ? 'Verificando...' : 'Entrar'}
              </button>
            </form>
          )}

          {step === 'enrolling' && (
            <form onSubmit={handleEnrollVerify} style={{ display: 'grid', gap: 18 }}>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Primeiro acesso. Abra o <strong>Google Authenticator</strong>,
                escaneie o QR e digite o código gerado.
              </p>
              {enrollQR && (
                <div style={{
                  display: 'grid', placeItems: 'center',
                  padding: 16, background: 'white',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                }}>
                  <img src={enrollQR} alt="QR Code" style={{ width: 200, height: 200 }} />
                </div>
              )}
              {enrollSecret && (
                <div style={{ fontSize: 12, textAlign: 'center' }} className="muted">
                  Não consegue escanear? Use o código manual:<br />
                  <span className="mono" style={{ color: 'var(--ink)' }}>{enrollSecret}</span>
                </div>
              )}
              <div className="field">
                <label>Código do Authenticator</label>
                <input className="input mono" inputMode="numeric" maxLength={6}
                  required value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  style={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' }} />
              </div>
              {error && <div style={{ color: 'var(--rose)', fontSize: 14 }}>{error}</div>}
              <button className="btn btn-primary" disabled={loading || totpCode.length !== 6}
                style={{ justifyContent: 'center' }}>
                {loading ? 'Confirmando...' : 'Confirmar e entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
