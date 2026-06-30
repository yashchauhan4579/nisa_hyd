import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@irisdrone/contexts/AuthContext';
import { Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(new Date());
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/';

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'PASSWORD_RESET_REQUIRED') {
        navigate('/operator-reset', { state: { email }, replace: true });
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const ss = String(time.getSeconds()).padStart(2, '0');
  const dateStr = time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at center, #04080d 0%, #020408 70%, #000 100%)',
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 240, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.025) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.018) 0, rgba(0, 240, 255, 0.018) 1px, transparent 1px, transparent 4px)',
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #020408 100%)',
        }}
      />

      {/* Ambient cyan glow */}
      <div
        className="absolute top-[20%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0, 240, 255, 0.05) 0%, transparent 60%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Top status bar */}
      <div className="absolute top-0 left-0 right-0 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="tact-dot tact-dot--cyan" />
          <span
            className="tact-mono"
            style={{
              fontSize: '10px',
              color: '#7d9fa6',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            OVERSIGHT · SECURE TERMINAL
          </span>
        </div>
        <div
          className="tact-mono"
          style={{
            fontSize: '11px',
            color: '#66F7FF',
            letterSpacing: '0.12em',
            textShadow: '0 0 8px rgba(0, 240, 255, 0.5)',
          }}
        >
          {dateStr} · {hh}:{mm}:{ss}
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-0 left-0 right-0 px-6 py-4 flex items-center justify-between z-10">
        <div
          className="tact-mono"
          style={{
            fontSize: '9px',
            color: '#4a6b73',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Smart City Surveillance · Belagam City Police
        </div>
        <div
          className="tact-mono"
          style={{
            fontSize: '9px',
            color: '#4a6b73',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          v3.0.0 · Build {dateStr}
        </div>
      </div>

      {/* Main login card */}
      <div className="relative z-10 w-full max-w-[420px] px-6">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="relative mb-5"
            style={{
              width: '64px',
              height: '64px',
              filter: 'drop-shadow(0 0 16px rgba(0, 240, 255, 0.5))',
            }}
          >
            <svg viewBox="0 0 32 32" width="64" height="64" fill="none" stroke="#00F0FF" strokeWidth="1.2">
              <polygon points="16,3 29,11 29,21 16,29 3,21 3,11" />
              <circle cx="16" cy="16" r="5" />
              <line x1="16" y1="11" x2="16" y2="3" />
              <line x1="16" y1="21" x2="16" y2="29" />
              <line x1="11" y1="13.5" x2="3" y2="11" />
              <line x1="11" y1="18.5" x2="3" y2="21" />
              <line x1="21" y1="13.5" x2="29" y2="11" />
              <line x1="21" y1="18.5" x2="29" y2="21" />
            </svg>
          </div>
          <h1
            className="tact-display"
            style={{
              fontSize: '32px',
              color: '#E0F7FA',
              letterSpacing: '0.5em',
              textShadow: '0 0 24px rgba(0, 240, 255, 0.5), 0 0 48px rgba(0, 240, 255, 0.2)',
              marginRight: '-0.5em',
            }}
          >
            IRIS
          </h1>
          <div
            className="tact-mono mt-2"
            style={{
              fontSize: '9px',
              color: '#7d9fa6',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
            }}
          >
            Intelligent Response & Integrated Surveillance
          </div>
        </div>

        {/* Auth panel with corner brackets */}
        <div
          className="tact-brackets-4 relative"
          style={{
            background: 'linear-gradient(180deg, rgba(5, 16, 25, 0.92) 0%, rgba(2, 8, 14, 0.95) 100%)',
            border: '1px solid rgba(0, 95, 115, 0.4)',
            padding: '32px 28px',
            boxShadow: '0 24px 64px -16px rgba(0, 0, 0, 0.6), 0 0 64px -16px rgba(0, 240, 255, 0.15)',
          }}
        >
          <span className="tact-corner tact-corner-tl" />
          <span className="tact-corner tact-corner-tr" />
          <span className="tact-corner tact-corner-bl" />
          <span className="tact-corner tact-corner-br" />

          {/* Top scanline */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.6), transparent)',
            }}
          />

          {/* Header */}
          <div className="flex items-center gap-2 mb-7">
            <span className="tact-dot tact-dot--cyan" style={{ width: '7px', height: '7px' }} />
            <span
              className="tact-display"
              style={{
                fontSize: '11px',
                color: '#9FE7F0',
                letterSpacing: '0.22em',
                fontWeight: 700,
                textShadow: '0 0 8px rgba(0, 240, 255, 0.4)',
              }}
            >
              AUTHENTICATION REQUIRED
            </span>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(0, 240, 255, 0.5) 0%, transparent 100%)' }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                className="tact-label-sm block mb-2"
                style={{ color: '#B8D6DC', fontSize: 11, letterSpacing: '0.18em' }}
              >
                Operator ID
              </label>
              <input
                type="text"
                placeholder="ENTER USERNAME"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className="tact-input"
              />
            </div>

            <div>
              <label
                className="tact-label-sm block mb-2"
                style={{ color: '#B8D6DC', fontSize: 11, letterSpacing: '0.18em' }}
              >
                Access Key
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="ENTER PASSWORD"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="tact-input"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[#7d9fa6] hover:text-[#66F7FF] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="flex items-start gap-2 p-3"
                style={{
                  background: 'rgba(255, 42, 42, 0.08)',
                  border: '1px solid rgba(255, 42, 42, 0.35)',
                }}
              >
                <AlertTriangle className="w-4 h-4 text-red-300 flex-shrink-0 mt-px" />
                <div
                  className="tact-mono"
                  style={{
                    fontSize: '11px',
                    color: '#fca5a5',
                    letterSpacing: '0.04em',
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="tact-btn tact-btn--primary w-full"
              style={{ height: '44px', fontSize: '11px', letterSpacing: '0.2em' }}
              disabled={loading || !email || !password}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AUTHENTICATING
                </>
              ) : (
                <>SIGN IN ▸</>
              )}
            </button>

            <div
              className="tact-mono text-center"
              style={{
                fontSize: '8.5px',
                color: '#4a6b73',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                lineHeight: 1.6,
                marginTop: '8px',
              }}
            >
              Unauthorized access prohibited<br />
              All sessions are monitored & logged
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
