import { useNavigate } from 'react-router-dom';

interface SidebarHeaderProps {
  collapsed: boolean;
}

export function SidebarHeader({ collapsed }: SidebarHeaderProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate('/')}
      className="tact-brackets-4"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: collapsed ? '0' : '0 16px',
        height: '56px',
        minHeight: '56px',
        maxHeight: '56px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderBottom: '1px solid rgba(0, 95, 115, 0.25)',
        cursor: 'pointer',
        background: 'linear-gradient(180deg, rgba(0, 240, 255, 0.04) 0%, transparent 100%)',
      }}
    >
      <span className="tact-corner tact-corner-tl" />
      <span className="tact-corner tact-corner-bl" />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '30px',
          height: '30px',
          flexShrink: 0,
          background: 'rgba(0, 240, 255, 0.08)',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          filter: 'drop-shadow(0 0 8px rgba(0, 240, 255, 0.3))',
        }}
      >
        <svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="#00F0FF" strokeWidth="1.4">
          <polygon points="16,3 29,11 29,21 16,29 3,21 3,11" />
          <circle cx="16" cy="16" r="5" />
          <line x1="16" y1="11" x2="16" y2="3" />
        </svg>
      </div>

      {!collapsed && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            gap: '3px',
          }}
        >
          <span
            className="tact-display"
            style={{
              fontSize: '17px',
              color: '#E0F7FA',
              letterSpacing: '0.32em',
              textShadow: '0 0 12px rgba(0, 240, 255, 0.4)',
              lineHeight: 1,
            }}
          >
            IRIS
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#8FB3BB',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              lineHeight: 1,
              fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
            }}
          >
            Oversight Protocol
          </span>
        </div>
      )}
    </div>
  );
}
