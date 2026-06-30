import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@irisdrone/contexts/AuthContext';
import { userData } from './constants';

interface SidebarFooterProps {
  collapsed: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function SidebarFooter({ collapsed }: SidebarFooterProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      style={{
        padding: collapsed ? '12px 8px' : '14px',
        borderTop: '1px solid rgba(0, 95, 115, 0.25)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(0, 240, 255, 0.025) 100%)',
      }}
    >
      {/* Operator card */}
      <div
        className="tact-brackets-4"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: collapsed ? '10px 6px' : '12px 14px',
          background: 'rgba(0, 240, 255, 0.04)',
          border: '1px solid rgba(0, 95, 115, 0.4)',
          justifyContent: collapsed ? 'center' : 'flex-start',
          marginBottom: '10px',
        }}
      >
        <span className="tact-corner tact-corner-tl" />
        <span className="tact-corner tact-corner-tr" />
        <span className="tact-corner tact-corner-bl" />
        <span className="tact-corner tact-corner-br" />

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '34px',
              height: '34px',
              background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.18) 0%, rgba(0, 240, 255, 0.05) 100%)',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '12px',
              fontWeight: 700,
              color: '#66F7FF',
              letterSpacing: '0.05em',
              filter: 'drop-shadow(0 0 6px rgba(0, 240, 255, 0.3))',
            }}
          >
            {userData.initials}
          </div>
          <span className="tact-dot tact-dot--cyan" style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '8px', height: '8px' }} />
        </div>

        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#E0F7FA',
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                lineHeight: 1.1,
                fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
              }}
            >
              {userData.name}
            </div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#8FB3BB',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
              }}
            >
              {userData.role} • online
            </div>
          </div>
        )}
      </div>

      {/* Logout button */}
      <button
        onClick={handleLogout}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          height: '36px',
          padding: collapsed ? '0' : '0 12px',
          border: '1px solid rgba(255, 42, 42, 0.2)',
          background: 'rgba(255, 42, 42, 0.04)',
          color: '#fca5a5',
          cursor: 'pointer',
          justifyContent: collapsed ? 'center' : 'flex-start',
          transition: 'all 0.2s ease',
          fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 42, 42, 0.12)';
          e.currentTarget.style.borderColor = 'rgba(255, 42, 42, 0.5)';
          e.currentTarget.style.color = '#fecaca';
          e.currentTarget.style.boxShadow = '0 0 16px -4px rgba(255, 42, 42, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 42, 42, 0.04)';
          e.currentTarget.style.borderColor = 'rgba(255, 42, 42, 0.2)';
          e.currentTarget.style.color = '#fca5a5';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <LogOut size={14} strokeWidth={1.75} />
        {!collapsed && <span>Sign Out</span>}
      </button>
    </div>
  );
}
