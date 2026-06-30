import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Moon, Sun, Server, Shield, Bell, Palette, Monitor, Database } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@irisdrone/components/ui/card';
import { Button } from '@irisdrone/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@irisdrone/components/ui/tabs';
import { useTheme } from '@irisdrone/contexts/ThemeContext';

// ---------- Toggle Switch ----------
function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        enabled ? 'bg-amber-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ---------- General Tab ----------
function GeneralTab() {
  const [emailAlerts, setEmailAlerts] = useState(() => localStorage.getItem('iris_email_alerts') !== 'false');
  const [pushNotifs, setPushNotifs] = useState(() => localStorage.getItem('iris_push_notifs') !== 'false');
  const [soundAlerts, setSoundAlerts] = useState(() => localStorage.getItem('iris_sound_alerts') !== 'false');

  const persist = (key: string, val: boolean) => localStorage.setItem(key, String(val));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Platform Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Shield className="h-4 w-4 text-amber-400" />
            Platform Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Application</span>
            <span className="text-zinc-100 text-sm font-medium">IRIS Command Center</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Version</span>
            <span className="text-zinc-100 text-sm font-mono">2.0.0</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Build</span>
            <span className="text-zinc-100 text-sm font-mono">2026.01.31-stable</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Environment</span>
            <span className="text-emerald-400 text-sm font-mono">Production</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Server className="h-4 w-4 text-amber-400" />
            Quick Links
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link
            to="/settings/workers"
            className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 text-zinc-400 group-hover:text-amber-400 transition-colors" />
              <span className="text-zinc-100 text-sm">Edge Workers</span>
            </div>
            <span className="text-zinc-600 text-xs">/settings/workers</span>
          </Link>
          <Link
            to="/itms/devices"
            className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Monitor className="h-4 w-4 text-zinc-400 group-hover:text-amber-400 transition-colors" />
              <span className="text-zinc-100 text-sm">Device Management</span>
            </div>
            <span className="text-zinc-600 text-xs">/itms/devices</span>
          </Link>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Bell className="h-4 w-4 text-amber-400" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-zinc-100 text-sm font-medium">Email Alerts</p>
                <p className="text-zinc-500 text-xs">Receive email notifications</p>
              </div>
              <Toggle
                enabled={emailAlerts}
                onToggle={() => {
                  const next = !emailAlerts;
                  setEmailAlerts(next);
                  persist('iris_email_alerts', next);
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-zinc-100 text-sm font-medium">Push Notifications</p>
                <p className="text-zinc-500 text-xs">Browser push alerts</p>
              </div>
              <Toggle
                enabled={pushNotifs}
                onToggle={() => {
                  const next = !pushNotifs;
                  setPushNotifs(next);
                  persist('iris_push_notifs', next);
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-zinc-100 text-sm font-medium">Sound Alerts</p>
                <p className="text-zinc-500 text-xs">Audible alert sounds</p>
              </div>
              <Toggle
                enabled={soundAlerts}
                onToggle={() => {
                  const next = !soundAlerts;
                  setSoundAlerts(next);
                  persist('iris_sound_alerts', next);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Appearance Tab ----------
const ACCENT_OPTIONS: Array<{ value: 'cyan' | 'amber' | 'emerald' | 'rose' | 'violet'; label: string }> = [
  { value: 'cyan', label: 'Cyan' },
  { value: 'amber', label: 'Amber' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'rose', label: 'Rose' },
  { value: 'violet', label: 'Violet' },
];

function AppearanceTab() {
  const { theme, setTheme, accent, setAccent, accents } = useTheme();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Theme — dark/light toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Palette className="h-4 w-4" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
            Display Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'dark' as const, label: 'Dark', icon: Moon, desc: '24/7 control room' },
              { value: 'light' as const, label: 'Light', icon: Sun, desc: 'Daylight visibility' },
            ]).map((m) => {
              const Icon = m.icon;
              const isActive = theme === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setTheme(m.value)}
                  aria-pressed={isActive}
                  className="tact-brackets-4"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    background: isActive
                      ? 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.08)'
                      : 'transparent',
                    border: `1px solid ${isActive ? 'var(--tact-cyan, #00F0FF)' : 'rgba(0, 95, 115, 0.4)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? '0 0 16px -4px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.4)' : 'none',
                    textAlign: 'left',
                  }}
                >
                  <span className="tact-corner tact-corner-tl" />
                  <span className="tact-corner tact-corner-tr" />
                  <span className="tact-corner tact-corner-bl" />
                  <span className="tact-corner tact-corner-br" />
                  <Icon className="h-5 w-5" style={{ color: isActive ? 'var(--tact-cyan-bright, #66F7FF)' : '#7d9fa6' }} />
                  <div>
                    <div className="tact-display" style={{ fontSize: 11, color: isActive ? 'var(--tact-cyan-bright, #66F7FF)' : '#DCEEF1', letterSpacing: '0.14em' }}>
                      {m.label}
                    </div>
                    <div className="tact-mono mt-0.5" style={{ fontSize: 9, color: '#7d9fa6', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {m.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Accent Color — wired */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Palette className="h-4 w-4" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
            Accent Color
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {ACCENT_OPTIONS.map((c) => {
              const spec = accents[c.value];
              const isActive = accent === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setAccent(c.value)}
                  aria-label={c.label}
                  aria-pressed={isActive}
                  className="tact-brackets-4"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 14px',
                    background: isActive ? `rgba(${spec.rgb}, 0.08)` : 'transparent',
                    border: `1px solid ${isActive ? spec.base : 'rgba(0,95,115,0.4)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? `0 0 16px -4px rgba(${spec.rgb}, 0.5)` : 'none',
                  }}
                >
                  <span className="tact-corner tact-corner-tl" style={isActive ? { borderColor: spec.base } : undefined} />
                  <span className="tact-corner tact-corner-tr" style={isActive ? { borderColor: spec.base } : undefined} />
                  <span className="tact-corner tact-corner-bl" style={isActive ? { borderColor: spec.base } : undefined} />
                  <span className="tact-corner tact-corner-br" style={isActive ? { borderColor: spec.base } : undefined} />
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: `radial-gradient(circle at 30% 30%, ${spec.bright}, ${spec.base} 60%, ${spec.dim} 100%)`,
                      boxShadow: `0 0 12px -2px ${spec.base}, inset 0 -2px 4px rgba(0,0,0,0.3)`,
                      border: `1px solid rgba(${spec.rgb}, 0.6)`,
                    }}
                  />
                  <span
                    className="tact-mono"
                    style={{
                      fontSize: 9,
                      color: isActive ? spec.bright : '#9FC0C7',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="tact-mono mt-4" style={{ fontSize: 10, color: '#7d9fa6', letterSpacing: '0.04em' }}>
            Active accent applies live across the entire OVERSIGHT interface.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- System Tab ----------
function SystemTab() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [storageUsage, setStorageUsage] = useState('');
  const [cacheCleared, setCacheCleared] = useState(false);

  const checkApiStatus = useCallback(async () => {
    setApiStatus('checking');
    try {
      const res = await fetch('/api/devices?limit=1');
      setApiStatus(res.ok ? 'connected' : 'disconnected');
    } catch {
      setApiStatus('disconnected');
    }
  }, []);

  const calculateStorage = useCallback(() => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        total += localStorage.getItem(key)?.length || 0;
      }
    }
    const kb = (total * 2) / 1024; // UTF-16 = 2 bytes per char
    setStorageUsage(kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`);
  }, []);

  useEffect(() => {
    checkApiStatus();
    calculateStorage();
  }, [checkApiStatus, calculateStorage]);

  const handleClearCache = () => {
    localStorage.clear();
    setCacheCleared(true);
    calculateStorage();
    setTimeout(() => setCacheCleared(false), 3000);
  };

  const statusColor =
    apiStatus === 'connected'
      ? 'text-emerald-400'
      : apiStatus === 'disconnected'
      ? 'text-red-400'
      : 'text-amber-400';

  const statusDot =
    apiStatus === 'connected'
      ? 'bg-emerald-400'
      : apiStatus === 'disconnected'
      ? 'bg-red-400'
      : 'bg-amber-400 animate-pulse';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* API Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Server className="h-4 w-4 text-amber-400" />
            Api Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Connection</span>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${statusDot}`} />
              <span className={`text-sm font-mono ${statusColor}`}>
                {apiStatus}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Endpoint</span>
            <span className="text-zinc-100 text-sm font-mono">/api/devices</span>
          </div>
          <Button variant="ghost" size="sm" onClick={checkApiStatus} className="w-full mt-2">
            Retry Connection
          </Button>
        </CardContent>
      </Card>

      {/* Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Database className="h-4 w-4 text-amber-400" />
            Storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">LocalStorage Used</span>
            <span className="text-zinc-100 text-sm font-mono">{storageUsage}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Keys Stored</span>
            <span className="text-zinc-100 text-sm font-mono">{localStorage.length}</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min((localStorage.length / 50) * 100, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Debug */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wider">
            <Shield className="h-4 w-4 text-amber-400" />
            Debug
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearCache}
            >
              {cacheCleared ? 'Cache Cleared!' : 'Clear Cache'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Open browser dev tools console - most browsers don't allow programmatic opening,
                // but we can log a message and use keyboard shortcut hint
                console.log('%c[IRIS DEVMODE] Console opened from Settings', 'color: #fbbf24; font-size: 14px;');
                alert('Press F12 or Ctrl+Shift+I to open Developer Console');
              }}
            >
              Open Console
            </Button>
          </div>
          {cacheCleared && (
            <p className="text-emerald-400 text-xs mt-3 animate-pulse">
              All cached data has been cleared. Some settings may reset on reload.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Settings Page ----------
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="min-h-full p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-bold text-zinc-100">
            Settings
          </h1>
        </div>
        <p className="text-zinc-500 text-sm tracking-wide">
          Devmode // Configuration & Preferences
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="system">
          <SystemTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
