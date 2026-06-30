import {
  Settings,
  Users, Shield, ScanSearch, Siren, Monitor, Video, Camera, Car,
  Home, Sun, Moon, LogOut, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

interface SubItem { route: string; label: string; icon: LucideIcon; }
interface Module { id: string; label: string; icon: LucideIcon; items: SubItem[]; }

// NISA demo rail — exactly four modules. Each icon links straight to its page.
// Crowd + FRS are live via the 206 pipeline, IRIS Observer is the Qwen forensics
// view, Perimeter Intrusion is the dedicated breach/loiter module.
const MODULES: Module[] = [
  { id: 'crowd', label: 'Crowd', icon: Users, items: [
    { route: 'analytics/crowd', label: 'Crowd Monitoring', icon: Users },
  ] },
  { id: 'observer', label: 'IRIS Observer', icon: ScanSearch, items: [
    { route: 'forensics', label: 'IRIS Observer', icon: ScanSearch },
  ] },
  { id: 'frs', label: 'FRS', icon: Shield, items: [
    { route: 'analytics/frs', label: 'Facial Recognition', icon: Shield },
  ] },
  { id: 'perimeter', label: 'Perimeter Intrusion', icon: Siren, items: [
    { route: 'perimeter', label: 'Perimeter Intrusion', icon: Siren },
  ] },
  { id: 'itms', label: 'ITMS', icon: Car, items: [
    { route: 'itms/anpr-vcc', label: 'ANPR · VCC', icon: Car },
  ] },
  { id: 'vms', label: 'VMS', icon: Monitor, items: [
    { route: 'vms/liveview', label: 'Live View', icon: Video },
    { route: 'vms/devices', label: 'Devices', icon: Camera },
    { route: 'vms/cameras', label: 'Cameras', icon: Camera },
    { route: 'vms/recording', label: 'Recording', icon: Video },
  ] },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  const modules = MODULES;
  const isItemActive = (route: string) => activeView === route;
  const isModuleActive = (m: Module) => m.items.some((s) => isItemActive(s.route));

  return (
    <div className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-16 glass border-r border-white/10 dark:border-white/5 z-[120] flex flex-col items-center py-6 gap-3">
      {/* Home */}
      <button
        onClick={() => onViewChange('home')}
        className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-2 shadow-lg shadow-amber-500/20 hover:scale-105 transition-transform active:scale-95 shrink-0"
        title="Home"
      >
        <Home className="w-6 h-6 text-white" />
      </button>

      {/* Module rail — each opens a hover flyout of its sub-sections */}
      <nav className="flex-1 flex flex-col gap-1.5 w-full px-2 items-center">
        {modules.map((m) => {
          const Icon = m.icon;
          const moduleActive = isModuleActive(m);
          return (
            <div key={m.id} className="relative group w-12">
              <button
                onClick={() => onViewChange(m.items[0].route)}
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95',
                  moduleActive
                    ? 'bg-amber-500 shadow-lg shadow-amber-500/30'
                    : 'hover:bg-white/10 dark:hover:bg-white/5',
                )}
                title={m.label}
              >
                <Icon className={cn('w-6 h-6 transition-colors', moduleActive ? 'text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-amber-500')} />
              </button>

              {/* Flyout: sub-sections, appears on hover to the right */}
              <div className="absolute left-full top-0 pl-3 hidden group-hover:block z-[200] pointer-events-auto">
                <div className="min-w-[200px] rounded-xl border border-white/10 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.7)] p-2">
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-500">
                    {m.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {m.items.map((s) => {
                      const SubIcon = s.icon;
                      const active = isItemActive(s.route);
                      return (
                        <button
                          key={s.route}
                          onClick={() => onViewChange(s.route)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors text-left',
                            active
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'text-zinc-300 hover:bg-white/5 hover:text-white',
                          )}
                        >
                          <SubIcon className="w-4 h-4 shrink-0" />
                          <span className="flex-1 truncate">{s.label}</span>
                          {active && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 hover:bg-white/10 dark:hover:bg-white/5 active:scale-95 shrink-0"
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? <Moon className="w-5 h-5 text-gray-600" /> : <Sun className="w-5 h-5 text-yellow-400" />}
      </button>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 hover:bg-red-500/10 active:scale-95 group shrink-0"
        title="Sign Out"
      >
        <LogOut className="w-5 h-5 text-gray-500 group-hover:text-red-500 transition-colors" />
      </button>

      {/* User */}
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center shadow-lg ring-2 ring-white/10 shrink-0">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">OP</span>
      </div>
    </div>
  );
}
