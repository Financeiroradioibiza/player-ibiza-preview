import { Link } from 'react-router-dom'

const RI = {
  bg: '#0a0a0a',
  pink: '#ff2e8a',
  pinkDeep: '#e01872',
  yellow: '#ffe70a',
  textPrimary: '#ffffff',
  textMuted: 'rgba(255,255,255,0.55)',
  textDim: 'rgba(255,255,255,0.35)',
  borderStrong: 'rgba(255,255,255,0.16)',
}

const FONT_DISPLAY = "'Oswald', 'Bebas Neue', 'Impact', sans-serif"
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

export default function Home() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap"
      />
      <div style={{
        minHeight: '100vh',
        background: RI.bg,
        color: RI.textPrimary,
        display: 'grid',
        placeItems: 'center',
        padding: '24px 20px',
        fontFamily: FONT_BODY,
      }}>
        <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          {/* Logo */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            justifyContent: 'center', marginBottom: 28,
          }}>
            <Logo />
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.08em',
              lineHeight: 1,
              textAlign: 'left',
            }}>
              RADIO<br />
              <span style={{ color: RI.yellow }}>IBIZA</span>
            </div>
          </div>

          {/* Badge */}
          <div style={{
            display: 'inline-block',
            padding: '4px 10px',
            background: RI.yellow,
            color: RI.bg,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 18,
          }}>
            IDENTIDADE MUSICAL
          </div>

          {/* Título */}
          <h1 style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 'clamp(40px, 12vw, 64px)',
            fontWeight: 700,
            lineHeight: 0.95,
            letterSpacing: '0.005em',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}>
            A MÚSICA QUE<br />
            FAZ SUA MARCA<br />
            <span style={{ color: RI.pink }}>VIBRAR.</span>
          </h1>

          <p style={{
            color: RI.textMuted,
            fontSize: 15,
            marginBottom: 28,
            maxWidth: 340,
            marginInline: 'auto',
            lineHeight: 1.5,
          }}>
            Acesse o preview exclusivo da sua identidade musical com o código que recebeu.
          </p>

          {/* CTA único */}
          <Link to="/player" style={{
            display: 'block',
            width: '100%',
            padding: '16px 24px',
            background: RI.pink,
            color: 'white',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            transition: 'background 0.15s',
            marginBottom: 32,
          }}
          onMouseEnter={(e) => e.target.style.background = RI.pinkDeep}
          onMouseLeave={(e) => e.target.style.background = RI.pink}
          >
            Acessar Com Código →
          </Link>

          {/* Faixa de manifesto rolando */}
          <div style={{
            borderTop: `1px solid ${RI.borderStrong}`,
            borderBottom: `1px solid ${RI.borderStrong}`,
            padding: '12px 0',
            overflow: 'hidden',
            marginBottom: 24,
          }}>
            <div style={{
              display: 'flex',
              gap: 24,
              animation: 'scroll 25s linear infinite',
              whiteSpace: 'nowrap',
              fontFamily: FONT_DISPLAY,
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: RI.textMuted,
            }}>
              {Array(3).fill(null).map((_, i) => (
                <span key={i} style={{ display: 'inline-flex', gap: 24, paddingRight: 24 }}>
                  <span>★ Som não é detalhe. É posicionamento.</span>
                  <span style={{ color: RI.yellow }}>★</span>
                  <span>Identidade sonora é presença que se escuta.</span>
                  <span style={{ color: RI.yellow }}>★</span>
                </span>
              ))}
            </div>
          </div>

          <p style={{
            color: RI.textDim,
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontFamily: FONT_DISPLAY,
          }}>
            Radio Ibiza · Rio de Janeiro
          </p>
        </div>

        <style>{`
          @keyframes scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </div>
    </>
  )
}

function Logo() {
  return (
    <svg width="48" height="48" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <g transform="translate(50,50)">
        {[...Array(16)].map((_, i) => {
          const angle = (i / 16) * 360
          const len = i % 2 === 0 ? 44 : 30
          return (
            <line
              key={i}
              x1="0" y1="0"
              x2={Math.cos((angle * Math.PI) / 180) * len}
              y2={Math.sin((angle * Math.PI) / 180) * len}
              stroke={RI.yellow}
              strokeWidth="3"
            />
          )
        })}
        <circle r="16" fill={RI.bg} stroke={RI.yellow} strokeWidth="2" />
      </g>
    </svg>
  )
}
