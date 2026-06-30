import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Zap, ArrowRight, X } from 'lucide-react';
import { playSound } from '@irisdrone/hooks/useSound';
import type { LucideIcon } from 'lucide-react';

interface SubMenuItem {
  id: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  path: string;
}

interface ModuleInfo {
  brief: string;
  color: string;
  stats: { val: string; label: string }[];
  features: string[];
  status: string;
  highlights: string[];
}

export interface MainModule {
  id: string;
  icon: LucideIcon;
  label: string;
  sub: string;
  side: 'left' | 'right';
  subItems: SubMenuItem[];
  info: ModuleInfo;
}

interface ModuleSelectorWidgetProps {
  modules: MainModule[];
}

export function ModuleSelectorWidget({ modules }: ModuleSelectorWidgetProps) {
  const navigate = useNavigate();
  const [selectedModule, setSelectedModule] = useState<MainModule | null>(null);

  const leftModules = modules.filter((m) => m.side === 'left');
  const rightModules = modules.filter((m) => m.side === 'right');

  const closePanel = () => {
    playSound('drawer-close');
    setSelectedModule(null);
  };

  const renderModuleCard = (mod: MainModule, index: number, side: 'left' | 'right') => {
    const Icon = mod.icon;
    const isSelected = selectedModule?.id === mod.id;
    const isOtherSelected = selectedModule && selectedModule.id !== mod.id;
    return (
      <div
        key={mod.id}
        className={`nx-module ${isSelected ? 'nx-selected' : ''} ${isOtherSelected ? 'nx-dimmed' : ''}`}
        style={{ animationDelay: `${0.3 + index * 0.08}s` }}
      >
        <div
          className={`nx-mcard ${side === 'right' ? 'nx-mcard-right' : ''}`}
          onClick={() => {
            if (isSelected) {
              closePanel();
            } else {
              playSound('drawer-open');
              setSelectedModule(mod);
            }
          }}
        >
          <div className="nx-mcard-glow" />
          <div className="nx-mcard-icon">
            <Icon size={20} />
          </div>
          <div className={`nx-mcard-text ${side === 'right' ? 'nx-text-right' : ''}`}>
            <span className="nx-mcard-label">{mod.label}</span>
            <span className="nx-mcard-sub">{mod.sub}</span>
          </div>
          <ChevronRight size={14} className={`nx-mcard-chevron ${isSelected ? 'nx-rotated' : ''}`} />
        </div>
      </div>
    );
  };

  return (
    <div className="nx-module-selector-widget">
      <div className="nx-msw-cols">
        {/* Left column */}
        <div className="nx-col nx-col-left">
          {leftModules.map((mod, i) => renderModuleCard(mod, i, 'left'))}
        </div>

        {/* Center — IRIS card */}
        <div className="nx-center">
          <div
            className={`nx-product-info ${selectedModule ? 'nx-product-active' : ''}`}
            key={selectedModule?.id ?? 'iris'}
            style={{ '--card-accent': selectedModule?.info.color ?? '#00F0FF' } as React.CSSProperties}
          >
            <div className="nx-orbit nx-orbit-1">
              <div className="nx-orbit-dot" style={selectedModule ? { background: selectedModule.info.color, boxShadow: `0 0 8px ${selectedModule.info.color}` } : undefined} />
            </div>
            <div className="nx-orbit nx-orbit-2" />
            <div className="nx-orbit nx-orbit-3" />

            {selectedModule ? (
              (() => {
                const Icon = selectedModule.icon;
                const info = selectedModule.info;
                return (
                  <>
                    <div className="nx-product-status nx-center-reveal" style={{ color: info.color }}>
                      <div className="nx-product-status-dot" style={{ background: info.color, boxShadow: `0 0 6px ${info.color}` }} />
                      <span>{info.status}</span>
                    </div>
                    <div className="nx-product-brand nx-center-reveal" style={{ '--mod-accent': info.color, animationDelay: '0.05s' } as React.CSSProperties}>
                      <div className="nx-product-logo" style={{ color: info.color }}>
                        <div className="nx-product-logo-glow" style={{ background: `radial-gradient(circle, ${info.color}22, transparent 70%)` }} />
                        <Icon size={36} />
                      </div>
                      <span className="nx-product-name" style={{ color: info.color }}>{selectedModule.label}</span>
                      <span className="nx-product-tagline">{selectedModule.sub}</span>
                    </div>
                    <div className="nx-product-brief nx-center-reveal" style={{ animationDelay: '0.1s' }}>
                      <p className="nx-product-desc">{info.brief}</p>
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                <div className="nx-product-brand nx-center-reveal">
                  <div className="nx-product-logo">
                    <div className="nx-product-logo-glow" />
                    <svg viewBox="0 0 32 32" fill="none" stroke="#38bdba" strokeWidth="1.2">
                      <polygon points="16,3 29,11 29,21 16,29 3,21 3,11" />
                      <circle cx="16" cy="16" r="5" />
                    </svg>
                  </div>
                  <span className="nx-product-name">IRIS</span>
                  <span className="nx-product-tagline">Intelligent Response & Integrated Surveillance</span>
                </div>
                <div className="nx-product-brief nx-center-reveal" style={{ animationDelay: '0.08s' }}>
                  <p className="nx-product-desc">
                    Unified command center for real-time video management, traffic intelligence, crowd analytics, and automated threat detection.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="nx-col nx-col-right">
          {rightModules.map((mod, i) => renderModuleCard(mod, i, 'right'))}
        </div>
      </div>

      {/* Subsystems flyout — fixed to the viewport edge, never overlaps the central tab */}
      {selectedModule && (
        <>
          <div className="nx-xpanel-backdrop" onClick={closePanel} />
          <div
            key={selectedModule.id}
            className={`nx-xpanel ${selectedModule.side === 'right' ? 'nx-xpanel-right' : 'nx-xpanel-left'}`}
            style={{
              '--mod-color': selectedModule.info.color,
              '--mod-glow': `color-mix(in srgb, ${selectedModule.info.color} 22%, transparent)`,
            } as React.CSSProperties}
          >
            <div className="nx-xpanel-scanner" />
            <div className="nx-xpanel-edge" />

            <div className="nx-xpanel-head">
              <Zap size={10} className="nx-xpanel-zap" />
              <span className="nx-xpanel-sys">{selectedModule.label}</span>
              <span className="nx-xpanel-sep">//</span>
              <span className="nx-xpanel-sysname">SUBSYSTEMS</span>
              <span className="nx-xpanel-cnt">{selectedModule.subItems.length}</span>
              <button className="nx-xpanel-close" onClick={closePanel} aria-label="Close panel">
                <X size={13} />
              </button>
            </div>

            <div className="nx-xpanel-div">
              <div className="nx-xpanel-div-line" />
              <div className="nx-xpanel-div-dot" />
            </div>

            <div className="nx-xpanel-items">
              {selectedModule.subItems.map((item, j) => {
                const SubIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="nx-xitem"
                    style={{ animationDelay: `${0.06 + j * 0.045}s` }}
                    onClick={() => navigate(item.path)}
                  >
                    <div className="nx-xitem-bar" />
                    <div className="nx-xitem-icon">
                      <SubIcon size={16} />
                    </div>
                    <div className="nx-xitem-body">
                      <span className="nx-xitem-name">{item.label}</span>
                      <span className="nx-xitem-desc">{item.desc}</span>
                    </div>
                    <div className="nx-xitem-go">
                      <ArrowRight size={14} />
                    </div>
                    <div className="nx-xitem-hover-scan" />
                  </div>
                );
              })}
            </div>

            <div className="nx-xpanel-foot">
              <div className="nx-xpanel-foot-line" />
              <span className="nx-xpanel-foot-text">SYS.OK</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
