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

  const [debugLog, setDebugLog] = useState([])

  function log(msg) {
    const ts = new Date().toLocaleTimeString('pt-BR')
    setDebugLog((prev) => [...prev, `[${ts}] ${msg}`])
    console.log('[login]', msg)
  }

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
    setDebugLog([])
    setLoading(true)
    log('Iniciando login...')
    try {
      log('Chamando signInWithPassword...')
      const { error: signErr } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout no signInWithPassword (15s)')), 15000)),
      ])
      if (signErr) throw signErr
      log('Login com senha OK')

      // Em vez de listFactors (que pode travar), usamos getAuthenticatorAssuranceLevel
      log('Verificando nível MFA...')
      const { data: aal, error: aalErr } = await Promise.race([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout em getAuthenticatorAssuranceLevel (10s)')), 10000)),
      ])
      if (aalErr) throw aalErr
      log(`AAL: current=${aal?.currentLevel}, next=${aal?.nextLevel}`)

      // Se nextLevel é aal2, significa que tem TOTP verificado
      if (aal?.nextLevel === 'aal2') {
        // Precisamos do factorId — tentamos listFactors com timeout curto, com fallback
        log('Buscando factor TOTP...')
        let verifiedTotp = null
        try {
          const { data: factors } = await Promise.race([
            supabase.auth.mfa.listFactors(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('listFactors timeout')), 5000)),
          ])
          verifiedTotp = factors?.totp?.find((f) => f.status === 'verified')
          log(`Factor encontrado: ${verifiedTotp?.id ? 'sim' : 'não'}`)
        } catch (e) {
          log(`listFactors falhou: ${e.message} — tentando challenge sem id`)
        }

        if (verifiedTotp) {
          log('Criando challenge...')
          const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
            factorId: verifiedTotp.id,
          })
          if (chErr) throw chErr
          log('Challenge OK, indo pra tela TOTP')
          setFactorId(verifiedTotp.id)
          setChallengeId(challenge.id)
          setStep('totp')
        } else {
          throw new Error('Você tem MFA mas não conseguimos achar o fator. Limpe o cache do navegador e tente de novo, ou contate o admin.')
        }
      } else {
        log('Sem TOTP, iniciando enroll...')
        const { data: enroll, error: enErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Radio Ibiza Admin',
        })
        if (enErr) throw enErr
        log('Enroll OK')
        setEnrollFactorId(enroll.id)
        setEnrollQR(enroll.totp.qr_code)
        setEnrollSecret(enroll.totp.secret)
        setStep('enrolling')
      }
    } catch (err) {
      log(`ERRO: ${err.message || err}`)
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

          {/* Debug do login */}
          {debugLog.length > 0 && (
            <details open style={{
              marginTop: 16,
              background: '#1a1a1a',
              color: '#22c55e',
              fontFamily: 'monospace',
              fontSize: 11,
              padding: 10,
              borderRadius: 4,
              maxHeight: 280,
              overflow: 'auto',
            }}>
              <summary style={{ color: '#fff', cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>
                🐞 Debug do login
              </summary>
              {debugLog.map((line, i) => (
                <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid #333', wordBreak: 'break-all' }}>
                  {line}
                </div>
              ))}
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
