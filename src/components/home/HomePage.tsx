import { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Map, Camera, Users, Car, TrendingUp, AlertTriangle,
  BarChart3, Bell, Settings, Monitor, Shield,
  Video, Activity, FileText, Cog, ChevronLeft, ChevronRight, Server, LogOut,
  Search, Sparkles, ScanSearch, Siren, Star, Crosshair
} from 'lucide-react';
import { TypeAnimation } from 'react-type-animation';
import { Background3D } from './Background3D';
import { IRISEye3D } from './IRISEye3D';
import { getHubPalette, type HubTheme } from './homeTheme';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useDataCache } from '@/contexts/DataCacheContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useTheme } from '@/contexts/ThemeContext';

interface SubMenuItem {
  id: string;
  icon: typeof Map;
  label: string;
  path: string;
}

interface MainModule {
  id: string;
  icon: typeof Map;
  label: string;
  color: string;
  side: 'left' | 'right';
  subItems: SubMenuItem[];
}

const mainModules: MainModule[] = [
  {
    id: 'crowd', icon: Users, label: 'CROWD', color: '#f59e0b', side: 'left',
    subItems: [{ id: 'crowd', icon: Users, label: 'CROWD', path: '/analytics/crowd' }],
  },
  {
    id: 'frs', icon: Shield, label: 'FRS', color: '#f59e0b', side: 'left',
    subItems: [{ id: 'frs', icon: Shield, label: 'FRS', path: '/analytics/frs' }],
  },
  {
    id: 'vms', icon: Monitor, label: 'VMS', color: '#3b82f6', side: 'left',
    subItems: [
      { id: 'liveview', icon: Video, label: 'LIVE VIEW', path: '/vms/liveview' },
      { id: 'devices', icon: Camera, label: 'DEVICES', path: '/vms/devices' },
      { id: 'cameras', icon: Camera, label: 'CAMERAS', path: '/vms/cameras' },
      { id: 'recording', icon: Video, label: 'RECORDING', path: '/vms/recording' },
    ],
  },
  {
    id: 'observer', icon: ScanSearch, label: 'IRIS OBSERVER', color: '#f59e0b', side: 'right',
    subItems: [{ id: 'observer', icon: ScanSearch, label: 'IRIS OBSERVER', path: '/forensics' }],
  },
  {
    id: 'perimeter', icon: Siren, label: 'PERIMETER', color: '#ef4444', side: 'right',
    subItems: [{ id: 'perimeter', icon: Siren, label: 'PERIMETER INTRUSION', path: '/perimeter' }],
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { prefetchAll } = useDataCache();
  const { isEnabled } = useFeatureFlags();
  const { themeFamily } = useTheme();
  // The 3D hub is the IRIS identity scene — always dark, regardless of the
  // global light/dark setting. The theme FAMILY (amber/cyberpunk) still applies.
  // Typed HubTheme (not a literal) so the light-branch helpers below still compile.
  const theme: HubTheme = 'dark';
  const pal = getHubPalette(theme, themeFamily);
  // Bright accents read fine on the dark scene, but as *text* on a light
  // surface they fail contrast — deepen via the palette's remap.
  const inkAccent = (c: string) =>
    theme === 'light' ? pal.lightModuleRemap[c] || c : c;
  // Neon text-glow reads as a smudge on light; suppress it there.
  const glow = (c: string, px: number) => (theme === 'light' ? 'none' : `0 0 ${px}px ${c}`);
  const [selectedModule, setSelectedModule] = useState<MainModule | null>(null);
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [hoveredSubItem, setHoveredSubItem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineCamerasCount, setOnlineCamerasCount] = useState<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedModule) {
        setSelectedModule(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedModule]);

  // Fetch camera health data and trigger prefetch on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch camera health data (same as health page)
        const token = localStorage.getItem('token');
        const res = await fetch('/api/camera-health', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const healthData: Array<{ status: string }> = await res.json();
          const onlineCount = healthData.filter(h => h.status === 'online').length;
          setOnlineCamerasCount(onlineCount);
        } else {
          console.error('Failed to fetch camera health, status:', res.status);
        }

        // Start prefetching all data in background
        prefetchAll();
      } catch (err) {
        console.error("Failed to fetch camera health stats", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    // Refresh camera health every 30s
    const interval = setInterval(() => {
      const tok = localStorage.getItem('token');
      fetch('/api/camera-health', {
        headers: tok ? { 'Authorization': `Bearer ${tok}` } : {}
      })
        .then(res => {
          if (!res.ok) {
            console.error('Failed to refresh camera health, status:', res.status);
            return [];
          }
          return res.json();
        })
        .then((healthData: Array<{ status: string }>) => {
          if (healthData && Array.isArray(healthData)) {
            const onlineCount = healthData.filter(h => h.status === 'online').length;
            setOnlineCamerasCount(onlineCount);
          }
        })
        .catch(err => console.error("Failed to refresh camera health", err));
    }, 30000);

    return () => clearInterval(interval);
  }, [prefetchAll]);

  const activeColor = selectedModule?.color || pal.moduleAccentAlt;
  // Apply platform feature flags: hide disabled modules and sub-items.
  // Settings + the Platform page are never hidden (avoid config lock-out).
  // The amber literal in mainModules resolves to the theme family's accent.
  const visibleModules = mainModules;
  const leftModules = visibleModules.filter(m => m.side === 'left');
  const rightModules = visibleModules.filter(m => m.side === 'right');

  const handleModuleClick = (module: MainModule) => {
    if (selectedModule?.id === module.id) {
      setSelectedModule(null);
    } else {
      setSelectedModule(module);
    }
  };

  const getSubItemPosition = (index: number, total: number, side: 'left' | 'right') => {
    const startAngle = side === 'left' ? -60 : 60;
    const spread = 40;
    const startOffset = -((total - 1) * spread) / 2;
    const angle = startAngle + startOffset + index * spread;
    const radius = 150;
    const x = Math.cos((angle * Math.PI) / 180) * radius;
    const y = Math.sin((angle * Math.PI) / 180) * radius;
    return { x, y };
  };

  return (
    <div
      // Local `.dark` scope: any dark: utilities inside the hub resolve dark
      // even when the global theme is light (the hub never renders light).
      className="dark"
      style={{
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 3D Background */}
      <Suspense fallback={
        <div style={{
          position: 'absolute',
          inset: 0,
          background: pal.fallbackBg
        }} />
      }>
        <Background3D color={activeColor} theme={theme} family={themeFamily} />
      </Suspense>

      {/* UI Layer */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Main container */}
        <div
          style={{
            position: 'relative',
            width: '90%',
            maxWidth: 1000,
            height: '80%',
            maxHeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Outer ellipse ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `2px dashed ${activeColor}30`,
              pointerEvents: 'none',
            }}
          />

          {/* Inner ellipse ring */}
          <div
            style={{
              position: 'absolute',
              inset: '15%',
              borderRadius: '50%',
              border: `1px solid ${activeColor}20`,
              pointerEvents: 'none',
            }}
          />

          {/* Left side modules */}
          <div
            style={{
              position: 'absolute',
              left: '3%',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              zIndex: 30,
            }}
          >
            {leftModules.map((module) => {
              const Icon = module.icon;
              const isSelected = selectedModule?.id === module.id;
              const isHovered = hoveredModule === module.id;

              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => handleModuleClick(module)}
                  onMouseEnter={() => setHoveredModule(module.id)}
                  onMouseLeave={() => setHoveredModule(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    borderRadius: 12,
                    background: isSelected
                      ? `linear-gradient(90deg, ${module.color}40 0%, transparent 100%)`
                      : isHovered
                        ? `linear-gradient(90deg, ${module.color}20 0%, transparent 100%)`
                        : `linear-gradient(90deg, ${pal.surfaceHoverFallback} 0%, transparent 100%)`,
                    border: `1px solid ${isSelected ? module.color + '60' : pal.tileBorder}`,
                    boxShadow: isSelected ? `0 0 24px ${module.color}28` : pal.tileShadow,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    transform: isSelected ? 'scale(1.05) translateX(5px)' : isHovered ? 'translateX(8px)' : 'none',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: isSelected || isHovered ? module.color + '30' : pal.iconIdleBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s',
                      boxShadow: isSelected ? `0 0 20px ${module.color}50` : 'none',
                    }}
                  >
                    <Icon
                      style={{
                        width: 20,
                        height: 20,
                        color: isSelected || isHovered ? module.color : pal.idleText,
                        transition: 'color 0.2s',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: isSelected || isHovered ? inkAccent(module.color) : pal.idleText,
                      transition: 'color 0.2s',
                      minWidth: 65,
                      textAlign: 'left',
                      textShadow: isSelected ? glow(module.color, 10) : 'none',
                    }}
                  >
                    {module.label}
                  </span>
                  {/* Active bar */}
                  <div
                    style={{
                      width: 3,
                      height: 28,
                      borderRadius: 2,
                      backgroundColor: isSelected ? module.color : isHovered ? module.color + '60' : 'transparent',
                      marginLeft: 4,
                      transition: 'all 0.3s',
                      boxShadow: isSelected ? `0 0 10px ${module.color}` : 'none',
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Right side modules */}
          <div
            style={{
              position: 'absolute',
              right: '3%',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              zIndex: 30,
            }}
          >
            {rightModules.map((module) => {
              const Icon = module.icon;
              const isSelected = selectedModule?.id === module.id;
              const isHovered = hoveredModule === module.id;

              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => handleModuleClick(module)}
                  onMouseEnter={() => setHoveredModule(module.id)}
                  onMouseLeave={() => setHoveredModule(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexDirection: 'row-reverse',
                    gap: 12,
                    padding: '10px 16px',
                    borderRadius: 12,
                    background: isSelected
                      ? `linear-gradient(270deg, ${module.color}40 0%, transparent 100%)`
                      : isHovered
                        ? `linear-gradient(270deg, ${module.color}20 0%, transparent 100%)`
                        : `linear-gradient(270deg, ${pal.surfaceHoverFallback} 0%, transparent 100%)`,
                    border: `1px solid ${isSelected ? module.color + '60' : pal.tileBorder}`,
                    boxShadow: isSelected ? `0 0 24px ${module.color}28` : pal.tileShadow,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    transform: isSelected ? 'scale(1.05) translateX(-5px)' : isHovered ? 'translateX(-8px)' : 'none',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: isSelected || isHovered ? module.color + '30' : pal.iconIdleBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s',
                      boxShadow: isSelected ? `0 0 20px ${module.color}50` : 'none',
                    }}
                  >
                    <Icon
                      style={{
                        width: 20,
                        height: 20,
                        color: isSelected || isHovered ? module.color : pal.idleText,
                        transition: 'color 0.2s',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: isSelected || isHovered ? inkAccent(module.color) : pal.idleText,
                      transition: 'color 0.2s',
                      minWidth: 75,
                      textAlign: 'right',
                      textShadow: isSelected ? glow(module.color, 10) : 'none',
                    }}
                  >
                    {module.label}
                  </span>
                  {/* Active bar */}
                  <div
                    style={{
                      width: 3,
                      height: 28,
                      borderRadius: 2,
                      backgroundColor: isSelected ? module.color : isHovered ? module.color + '60' : 'transparent',
                      marginRight: 4,
                      transition: 'all 0.3s',
                      boxShadow: isSelected ? `0 0 10px ${module.color}` : 'none',
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Center hub with 3D eye and submenu */}
          <div
            style={{
              position: 'relative',
              zIndex: 40,
            }}
          >
            {/* Submenu items */}
            {selectedModule && selectedModule.subItems.map((item, index) => {
              const Icon = item.icon;
              const { x, y } = getSubItemPosition(index, selectedModule.subItems.length, selectedModule.side);
              const isHovered = hoveredSubItem === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                    zIndex: 35,
                    transition: 'all 0.4s ease',
                    transitionDelay: `${index * 80}ms`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      navigate(item.path);
                    }}
                    onMouseEnter={() => setHoveredSubItem(item.id)}
                    onMouseLeave={() => setHoveredSubItem(null)}
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 16,
                      background: pal.surfaceStrong,
                      border: `1px solid ${isHovered ? selectedModule.color + '80' : pal.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: isHovered
                        ? `0 0 40px ${selectedModule.color}50, 0 0 60px ${selectedModule.color}20`
                        : theme === 'light' ? pal.tileShadow : '0 4px 20px rgba(0,0,0,0.4)',
                      transition: 'all 0.25s ease',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <Icon
                      style={{
                        width: 24,
                        height: 24,
                        color: isHovered ? selectedModule.color : pal.idleText,
                        transition: 'all 0.2s',
                        filter: isHovered ? `drop-shadow(0 0 8px ${selectedModule.color})` : 'none',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: isHovered ? inkAccent(selectedModule.color) : pal.mutedText,
                        transition: 'color 0.2s',
                        textShadow: isHovered ? glow(selectedModule.color, 10) : 'none',
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                </div>
              );
            })}

            {/* Center circle with 3D Eye */}
            <button
              type="button"
              onClick={() => selectedModule && setSelectedModule(null)}
              style={{
                width: 160,
                height: 160,
                borderRadius: '50%',
                background: pal.centerGrad,
                border: `2px solid ${selectedModule ? activeColor + '60' : pal.centerBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: selectedModule ? 'pointer' : 'default',
                boxShadow: `0 0 80px ${activeColor}30, ${pal.centerInset}`,
                transition: 'all 0.4s ease',
                overflow: 'hidden',
                padding: 0,
              }}
            >
              {selectedModule ? (
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      margin: '0 auto 8px',
                      borderRadius: '50%',
                      backgroundColor: selectedModule.color + '25',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 0 30px ${selectedModule.color}40`,
                    }}
                  >
                    <selectedModule.icon
                      style={{
                        width: 28,
                        height: 28,
                        color: selectedModule.color,
                        filter: `drop-shadow(0 0 10px ${selectedModule.color})`,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: inkAccent(selectedModule.color),
                      textShadow: glow(selectedModule.color, 15),
                    }}
                  >
                    {selectedModule.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                    {selectedModule.side === 'left' ? (
                      <ChevronLeft style={{ width: 14, height: 14, color: pal.mutedText }} />
                    ) : (
                      <ChevronRight style={{ width: 14, height: 14, color: pal.mutedText }} />
                    )}
                    <span style={{ fontSize: 9, color: pal.mutedText, letterSpacing: '0.1em' }}>BACK</span>
                  </div>
                </div>
              ) : (
                <Suspense fallback={
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      backgroundColor: activeColor + '30',
                      margin: '0 auto 8px',
                    }} />
                    <span style={{ fontSize: 12, color: pal.idleText }}>IRIS</span>
                  </div>
                }>
                  <IRISEye3D color={activeColor} isActive={!!hoveredModule} size={156} />
                </Suspense>
              )}
            </button>
          </div>

          {/* Decorative side dots */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: activeColor,
              boxShadow: `0 0 15px ${activeColor}, 0 0 30px ${activeColor}50`,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: activeColor,
              boxShadow: `0 0 15px ${activeColor}, 0 0 30px ${activeColor}50`,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Top info bar */}
      <div
        className="text-gray-900 dark:text-gray-400"
        style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 40,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
          <Bell style={{ width: 18, height: 18, color: activeColor, filter: `drop-shadow(0 0 5px ${activeColor})` }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>3 Alerts</span>
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 200,
            letterSpacing: '0.15em',
            color: pal.clockText,
            textShadow: pal.clockShadow,
          }}
        >
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
          <Camera style={{ width: 18, height: 18, color: activeColor, filter: `drop-shadow(0 0 5px ${activeColor})` }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {loading ? '...' : `${onlineCamerasCount} Online`}
          </span>
        </div>
      </div>

      {/* Bottom status bar with typing animation */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 20,
        }}
      >
        {/* Typing animation - shows when no module selected */}
        {!selectedModule && (
          <div
            style={{
              height: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 450,
            }}
          >
            <TypeAnimation
              sequence={[
                'IRIS',
                2500,
                '',
                600,
                'Integrated Realtime Intelligence System',
                4000,
                '',
                800,
              ]}
              speed={45}
              deletionSpeed={65}
              cursor={true}
              repeat={Infinity}
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: pal.typeText,
                letterSpacing: '0.12em',
                textShadow: `0 0 25px ${activeColor}60`,
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            />
          </div>
        )}

        {/* Status text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#22c55e',
              boxShadow: '0 0 8px #22c55e',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: pal.mutedText,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            {selectedModule ? selectedModule.label + ' Module' : 'IRIS Command Center'}
          </span>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#22c55e',
              boxShadow: '0 0 8px #22c55e',
            }}
          />
        </div>
      </div>

      {/* Keyboard hint */}
      <div style={{ position: 'absolute', bottom: 24, right: 24, fontSize: 10, color: pal.faintText, zIndex: 20 }}>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: 4,
            backgroundColor: pal.chipBg,
            border: `1px solid ${pal.chipBorder}`,
            backdropFilter: 'blur(5px)',
          }}
        >
          ESC
        </span>
        <span style={{ marginLeft: 8 }}>to go back</span>
      </div>

      {/* Logout Button */}
      <button
        onClick={logout}
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderRadius: 12,
          backgroundColor: pal.logoutBg,
          border: `1px solid ${pal.logoutBorder}`,
          color: pal.idleText,
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
          e.currentTarget.style.color = '#ef4444';
          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = pal.logoutBg;
          e.currentTarget.style.color = pal.idleText;
          e.currentTarget.style.borderColor = pal.logoutBorder;
        }}
      >
        <LogOut size={16} />
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>LOGOUT</span>
      </button>
    </div>
  );
}
