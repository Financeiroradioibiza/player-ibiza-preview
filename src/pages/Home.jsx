import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '40px 20px',
      background: 'radial-gradient(ellipse at top, #fffaf0 0%, var(--cream) 60%)',
    }}>
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        <div className="mono" style={{
          fontSize: 11,
          letterSpacing: '0.3em',
          color: 'var(--cobalt)',
          marginBottom: 18,
        }}>
          RADIO · IBIZA
        </div>
        <h1 className="display" style={{
          fontSize: 'clamp(48px, 8vw, 84px)',
          fontWeight: 400,
          lineHeight: 0.95,
          letterSpacing: '-0.03em',
          marginBottom: 18,
        }}>
          Identidade<br />
          <em style={{ color: 'var(--cobalt)' }}>sonora</em>.
        </h1>
        <p style={{
          fontSize: 17,
          color: 'var(--muted)',
          marginBottom: 40,
          maxWidth: 420,
          marginInline: 'auto',
        }}>
          Previews curados para cada cliente, validação simples por código.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/player" className="btn btn-accent">
            Acessar com código →
          </Link>
          <Link to="/admin/login" className="btn btn-ghost">
            Área administrativa
          </Link>
        </div>
      </div>
    </div>
  )
}
