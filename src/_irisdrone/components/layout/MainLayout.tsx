import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Bell, Sun, Moon, Menu, X } from 'lucide-react';
import { IRISSidebar } from './sidebar/IRISSidebar';
import { menuSections, colors } from './sidebar/constants';
import type { MenuItem } from './sidebar/constants';
import type { LucideIcon } from 'lucide-react';
import { useIsMobile } from '@irisdrone/hooks/use-mobile';
import { useTheme } from '@irisdrone/contexts/ThemeContext';
import { playSound } from '@irisdrone/hooks/useSound';
import { useWatchlistSiren } from '@irisdrone/hooks/useWatchlistSiren';

type MainLayoutProps = {
  children: React.ReactNode;
};

// Build a flat lookup: path → MenuItem
const allItems = menuSections.flatMap((s) => s.items);
const itemByPath = new Map(allItems.map((item) => [item.path, item]));

// Section default paths — the first logical route in each section
const SECTION_DEFAULT: Record<string, string> = {
  traffic: '/itms',
  tv: '/itms/tv/toc-overview',
  crowd: '/map',
  system: '/analytics',
};

interface Crumb {
  label: string;
  path?: string;
  icon?: LucideIcon;
  isCurrent: boolean;
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [];

  // 1. Find the active section
  const activeSection = menuSections.find((s) =>
    s.items.some((i) => pathname === i.path || pathname.startsWith(i.path + '/'))
  );

  // 2. Find the exact active item (most specific match)
  let activeItem: MenuItem | undefined;
  let bestLen = 0;
  for (const item of allItems) {
    if (pathname === item.path || pathname.startsWith(item.path + '/')) {
      if (item.path.length > bestLen) {
        bestLen = item.path.length;
        activeItem = item;
      }
    }
  }

  // 3. Section crumb (links to section default page)
  if (activeSection) {
    const sectionTarget = SECTION_DEFAULT[activeSection.id];
    // Only show section crumb if active item is not the section default itself
    if (sectionTarget && sectionTarget !== activeItem?.path) {
      crumbs.push({
        label: activeSection.label,
        path: sectionTarget,
        isCurrent: false,
      });
    } else if (!sectionTarget) {
      crumbs.push({ label: activeSection.label, isCurrent: false });
    }
  }

  // 4. For nested paths, find intermediate items
  // e.g. /itms/watchlist/rules → show Watchlist crumb before Watchlist Rules
  if (activeItem) {
    const parts = activeItem.path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const prefix = '/' + parts.slice(0, i).join('/');
      const parentItem = itemByPath.get(prefix);
      if (parentItem && parentItem.path !== activeItem.path) {
        // Avoid duplicate if it's the section default we already added
        const sectionTarget = activeSection ? SECTION_DEFAULT[activeSection.id] : undefined;
        if (parentItem.path !== sectionTarget) {
          crumbs.push({
            label: parentItem.label,
            path: parentItem.path,
            icon: parentItem.icon,
            isCurrent: false,
          });
        }
      }
    }

    // 5. Current page (no link)
    crumbs.push({
      label: activeItem.label,
      icon: activeItem.icon,
      isCurrent: true,
    });
  }

  return crumbs;
}

const crumbBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  height: '28px',
  padding: '0 10px',
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: '#7d9fa6',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  transition: 'all 0.2s ease',
  fontFamily: "'Rajdhani', sans-serif",
};

interface ContentHeaderProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

function ContentHeader({ onMenuClick, showMenuButton }: ContentHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const crumbs = buildBreadcrumbs(location.pathname);
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();

  // On mobile, only show the current crumb (last one) to save space
  const visibleCrumbs = isMobile && crumbs.length > 0 ? [crumbs[crumbs.length - 1]] : crumbs;

  return (
    <nav
      aria-label="breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '0 10px' : '0 20px',
        gap: '10px',
        height: '56px',
        minHeight: '56px',
        maxHeight: '56px',
        borderBottom: '1px solid rgba(0, 95, 115, 0.25)',
        background: 'linear-gradient(180deg, rgba(4, 8, 13, 0.96) 0%, rgba(2, 4, 8, 0.92) 100%)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      {/* Decorative top scanline */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -1,
          height: '1px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(var(--tact-accent-rgb, 0, 240, 255), 0.4) 50%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              minWidth: '38px',
              border: '1px solid rgba(0, 95, 115, 0.4)',
              background: 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.04)',
              color: '#7d9fa6',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.1)';
              e.currentTarget.style.color = 'var(--tact-cyan-bright, #66F7FF)';
              e.currentTarget.style.borderColor = 'var(--tact-cyan, #00F0FF)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.04)';
              e.currentTarget.style.color = '#7d9fa6';
              e.currentTarget.style.borderColor = 'rgba(0, 95, 115, 0.4)';
            }}
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
        )}

        {/* IRIS root chip */}
        <button
          onClick={() => navigate('/')}
          style={crumbBtnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.06)';
            e.currentTarget.style.color = 'var(--tact-cyan-bright, #66F7FF)';
            e.currentTarget.style.borderColor = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#7d9fa6';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <svg viewBox="0 0 32 32" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="16,3 29,11 29,21 16,29 3,21 3,11" />
            <circle cx="16" cy="16" r="5" />
          </svg>
          {!isMobile && <span>IRIS</span>}
        </button>

        {visibleCrumbs.map((crumb, idx) => {
          const CrumbIcon = crumb.icon;
          return (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ChevronRight size={11} style={{ color: '#4a6b73' }} />
              {crumb.isCurrent ? (
                <div
                  className="tact-brackets-4"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    height: '28px',
                    padding: '0 12px',
                    background: 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.08)',
                    border: '1px solid rgba(var(--tact-accent-rgb, 0, 240, 255), 0.4)',
                    color: 'var(--tact-cyan-bright, #66F7FF)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    fontFamily: "'Rajdhani', sans-serif",
                    boxShadow: '0 0 16px -6px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)',
                  }}
                >
                  <span className="tact-corner tact-corner-tl" />
                  <span className="tact-corner tact-corner-tr" />
                  <span className="tact-corner tact-corner-bl" />
                  <span className="tact-corner tact-corner-br" />
                  {CrumbIcon && <CrumbIcon size={12} strokeWidth={1.75} />}
                  <span>{crumb.label}</span>
                </div>
              ) : (
                <button
                  onClick={() => crumb.path && navigate(crumb.path)}
                  style={{
                    ...crumbBtnStyle,
                    cursor: crumb.path ? 'pointer' : 'default',
                  }}
                  onMouseEnter={(e) => {
                    if (crumb.path) {
                      e.currentTarget.style.background = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.06)';
                      e.currentTarget.style.color = 'var(--tact-cyan-bright, #66F7FF)';
                      e.currentTarget.style.borderColor = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#7d9fa6';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  {CrumbIcon && <CrumbIcon size={12} strokeWidth={1.75} />}
                  <span>{crumb.label}</span>
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Right cluster: status pills + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {!isMobile && (
          <>
            {/* SYS status chip */}
            <div
              className="tact-brackets-4"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '28px',
                padding: '0 12px',
                background: 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.04)',
                border: '1px solid rgba(0, 95, 115, 0.4)',
              }}
            >
              <span className="tact-corner tact-corner-tl" />
              <span className="tact-corner tact-corner-tr" />
              <span className="tact-corner tact-corner-bl" />
              <span className="tact-corner tact-corner-br" />
              <span className="tact-dot tact-dot--cyan" style={{ width: '6px', height: '6px' }} />
              <span
                className="tact-mono"
                style={{
                  fontSize: '9.5px',
                  color: 'var(--tact-cyan-bright, #66F7FF)',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}
              >
                SYS · OK
              </span>
            </div>
          </>
        )}

        {([
          { Icon: Bell, label: 'Notifications', path: '/alerts', action: 'nav' as const, dot: true },
          { Icon: theme === 'dark' ? Sun : Moon, label: 'Toggle theme', path: '', action: 'theme' as const, dot: false },
        ] as const).map((item, idx) => {
          const Icon = item.Icon;
          return (
            <button
              key={idx}
              aria-label={item.label}
              onClick={() => item.action === 'theme' ? toggleTheme() : navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                border: '1px solid rgba(0, 95, 115, 0.4)',
                background: 'rgba(0, 240, 255, 0.03)',
                color: '#7d9fa6',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.1)';
                e.currentTarget.style.borderColor = 'var(--tact-cyan, #00F0FF)';
                e.currentTarget.style.color = 'var(--tact-cyan-bright, #66F7FF)';
                e.currentTarget.style.boxShadow = '0 0 16px -6px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 240, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(0, 95, 115, 0.4)';
                e.currentTarget.style.color = '#7d9fa6';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Icon size={15} strokeWidth={1.75} />
              {item.dot && (
                <span
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#FF2A2A',
                    boxShadow: '0 0 6px rgba(255, 42, 42, 0.8)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const isHomePage = location.pathname === '/';
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Global watchlist siren — polls /api/alerts and keeps a looped
  // buzzing tone alive while any unread watchlist alert exists. Mounted
  // here so it runs across every page once the operator is logged in.
  useWatchlistSiren();

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Sound on every route change
  const isFirstRoute = useState(true);
  useEffect(() => {
    if (isFirstRoute[0]) {
      isFirstRoute[1](false);
      return;
    }
    playSound('nav-route');
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound on drawer toggle
  useEffect(() => {
    playSound(drawerOpen ? 'drawer-open' : 'drawer-close');
  }, [drawerOpen]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (drawerOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen, isMobile]);

  // ESC closes drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (isHomePage) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'linear-gradient(180deg, #04080d 0%, #020408 100%)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Sidebar — inline on desktop, drawer on mobile */}
      {!isMobile && <IRISSidebar />}

      {isMobile && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              opacity: drawerOpen ? 1 : 0,
              pointerEvents: drawerOpen ? 'auto' : 'none',
              transition: 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 90,
            }}
          />
          {/* Drawer */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: '85vw',
              maxWidth: '320px',
              transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 100,
              boxShadow: drawerOpen ? '8px 0 32px rgba(0, 0, 0, 0.5)' : 'none',
              display: 'flex',
            }}
          >
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: colors.textSecondary,
                cursor: 'pointer',
                zIndex: 1,
              }}
            >
              <X size={18} strokeWidth={1.75} />
            </button>
            <IRISSidebar />
          </div>
        </>
      )}

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <ContentHeader
          onMenuClick={() => setDrawerOpen(true)}
          showMenuButton={isMobile}
        />
        <div
          className="tact-page"
          style={{ flex: 1, overflow: 'auto', minHeight: 0, scrollbarGutter: 'stable' }}
        >
          <div className="tact-page-content">{children}</div>
        </div>
      </main>
    </div>
  );
}
