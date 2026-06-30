import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeft } from 'lucide-react';
import { menuSections } from './constants';
import { SidebarHeader } from './SidebarHeader';
import { SidebarFooter } from './SidebarFooter';
import type { MenuItem as MenuItemType } from './constants';
import { useIsMobile } from '@irisdrone/hooks/use-mobile';

interface MenuItemProps {
  item: MenuItemType;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function MenuItem({ item, isActive, collapsed, onClick }: MenuItemProps) {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: collapsed ? 'column' : 'row',
        alignItems: 'center',
        gap: collapsed ? '4px' : '12px',
        width: '100%',
        height: collapsed ? 'auto' : '44px',
        padding: collapsed ? '10px 4px' : '0 12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        justifyContent: collapsed ? 'center' : 'flex-start',
        backgroundColor: isActive ? 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.08)' : 'transparent',
        color: isActive ? 'var(--tact-cyan-bright, #66F7FF)' : '#AFCDD4',
        border: isActive ? '1px solid rgba(var(--tact-accent-rgb, 0, 240, 255), 0.35)' : '1px solid transparent',
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontSize: '13px',
        fontWeight: 600,
        letterSpacing: '0.035em',
        textTransform: 'uppercase',
        boxShadow: isActive ? 'inset 2px 0 0 0 var(--tact-cyan, #00F0FF), 0 0 16px -8px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.04)';
          e.currentTarget.style.color = '#B8D4D9';
          e.currentTarget.style.borderColor = 'rgba(0, 95, 115, 0.4)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = '#AFCDD4';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: collapsed ? '28px' : '24px',
          height: collapsed ? '28px' : '24px',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <Icon
          size={collapsed ? 16 : 16}
          strokeWidth={1.75}
          style={{
            color: 'currentColor',
            transition: 'all 0.2s ease',
            filter: isActive ? 'drop-shadow(0 0 4px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.6))' : 'none',
          }}
        />
        {item.badge && collapsed && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '14px',
              height: '14px',
              padding: '0 3px',
              fontSize: '8px',
              fontWeight: 700,
              fontFamily: "'Share Tech Mono', monospace",
              background: '#FF2A2A',
              color: '#fff',
              borderRadius: '7px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 6px rgba(255, 42, 42, 0.6)',
              border: '1px solid #020408',
            }}
          >
            {item.badge}
          </span>
        )}
      </div>

      <span
        style={{
          fontSize: collapsed ? '9.5px' : '13px',
          letterSpacing: collapsed ? '0.04em' : '0.035em',
          textAlign: collapsed ? 'center' : 'left',
          lineHeight: 1.2,
          maxWidth: collapsed ? '60px' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: collapsed ? 'normal' : 'nowrap',
          flex: collapsed ? 'none' : 1,
        }}
      >
        {item.label}
      </span>

      {item.badge && !collapsed && (
        <span
          className="tact-mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '20px',
            height: '18px',
            padding: '0 6px',
            fontSize: '9px',
            fontWeight: 700,
            color: '#fca5a5',
            background: 'rgba(255, 42, 42, 0.12)',
            border: '1px solid rgba(255, 42, 42, 0.35)',
            letterSpacing: '0.05em',
            lineHeight: 1,
          }}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}

interface SectionProps {
  section: typeof menuSections[number];
  collapsed: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  activeItemPath: string;
  onNavigate: (path: string) => void;
}

function Section({ section, collapsed, isExpanded, onToggle, activeItemPath, onNavigate }: SectionProps) {
  const isItemActive = (item: MenuItemType) => {
    if (item.path === '/itms') return activeItemPath === '/itms';
    if (item.path === '/settings') return activeItemPath === '/settings';
    return activeItemPath === item.path || activeItemPath.startsWith(item.path + '/');
  };

  // Section header click: navigate to first item AND expand
  const handleSectionClick = () => {
    const firstItem = section.items[0];
    if (firstItem) {
      onNavigate(firstItem.path);
    }
    onToggle();
  };

  return (
    <div style={{ marginBottom: '6px' }}>
      {!collapsed && (
        <button
          onClick={handleSectionClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 12px 8px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="tact-dot tact-dot--cyan" style={{ width: '5px', height: '5px' }} />
            <span
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.13em',
                fontWeight: 700,
                color: '#8FB3BB',
                fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
              }}
            >
              {section.label}
            </span>
          </div>
          <ChevronDown
            size={11}
            style={{
              color: '#4a6b73',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        </button>
      )}

      {collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <div
            style={{
              width: '24px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.4), transparent)',
            }}
          />
        </div>
      )}

      <div
        style={{
          overflow: 'hidden',
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          maxHeight: !collapsed && !isExpanded ? 0 : '800px',
          opacity: !collapsed && !isExpanded ? 0 : 1,
          padding: collapsed ? '0' : '0 6px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {section.items.map((item) => (
            <MenuItem
              key={item.id}
              item={item}
              isActive={isItemActive(item)}
              collapsed={collapsed}
              onClick={() => onNavigate(item.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function IRISSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const isMobile = useIsMobile();

  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  const effectiveCollapsed = isMobile ? false : collapsed;

  const [expandedSections, setExpandedSections] = useState<string[]>(() => {
    const active: string[] = [];
    for (const section of menuSections) {
      const hasMatch = section.items.some(
        (item) => pathname === item.path || pathname.startsWith(item.path + '/')
      );
      if (hasMatch) active.push(section.id);
    }
    return active.length > 0 ? active : ['traffic'];
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  };

  return (
    <aside
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: isMobile ? '100%' : effectiveCollapsed ? '76px' : '256px',
        minWidth: isMobile ? '100%' : effectiveCollapsed ? '76px' : '256px',
        background: 'linear-gradient(180deg, #04080d 0%, #020408 100%)',
        borderRight: isMobile ? 'none' : '1px solid rgba(0, 95, 115, 0.25)',
        transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        overflow: 'visible',
        zIndex: 60,
      }}
    >
      {/* Decorative scanline overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, rgba(var(--tact-accent-rgb, 0, 240, 255), 0.015) 0, rgba(var(--tact-accent-rgb, 0, 240, 255), 0.015) 1px, transparent 1px, transparent 3px)',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <SidebarHeader collapsed={effectiveCollapsed} />

        <nav
          className="scroll-hidden"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '14px 8px',
          }}
        >
          {menuSections.map((section, idx) => (
            <React.Fragment key={section.id}>
              {idx > 0 && !effectiveCollapsed && (
                <div
                  style={{
                    height: '1px',
                    margin: '10px 12px',
                    background: 'linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.18), transparent)',
                  }}
                />
              )}
              <Section
                section={section}
                collapsed={effectiveCollapsed}
                isExpanded={expandedSections.includes(section.id)}
                onToggle={() => toggleSection(section.id)}
                activeItemPath={pathname}
                onNavigate={(path) => navigate(path)}
              />
            </React.Fragment>
          ))}
        </nav>

        <SidebarFooter collapsed={effectiveCollapsed} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} />
      </div>

      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="iris-sidebar-toggle"
        >
          {collapsed ? <PanelLeft size={13} strokeWidth={1.75} /> : <PanelLeftClose size={13} strokeWidth={1.75} />}
        </button>
      )}
    </aside>
  );
}
