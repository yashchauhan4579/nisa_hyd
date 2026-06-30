import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@irisdrone/components/ui/button';
import { cn } from '@irisdrone/lib/utils';
import { LayoutDashboard, Car, TrendingUp, AlertTriangle, Eye, Bell, CheckSquare, FileSearch, LineChart, Filter } from 'lucide-react';

const ITMS_ROUTES = [
  { path: '/itms', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/itms/anpr', label: 'ANPR', icon: Car },
  { path: '/itms/vcc', label: 'VCC', icon: TrendingUp },
  { path: '/itms/violations', label: 'Violations', icon: AlertTriangle },
  { path: '/itms/watchlist', label: 'Watchlist', icon: Eye },
  { path: '/itms/alerts', label: 'Alerts', icon: Bell },
  { path: '/itms/review', label: 'Review', icon: CheckSquare },
  { path: '/itms/investigation', label: 'Investigation', icon: FileSearch },
  { path: '/itms/analytics', label: 'Analytics', icon: LineChart },
  { path: '/itms/watchlist/rules', label: 'Rules', icon: Filter },
];


function getHeading(pathname: string): string {
  if (pathname.startsWith('/itms/anpr')) return 'ITMS / ANPR';
  if (pathname.startsWith('/itms/vcc')) return 'ITMS / VCC';
  if (pathname.startsWith('/itms/violations')) return 'ITMS / Violations';
  if (pathname.startsWith('/itms/watchlist/rules')) return 'ITMS / Watchlist Rules';
  if (pathname.startsWith('/itms/watchlist')) return 'ITMS / Watchlist';
  if (pathname.startsWith('/itms/alerts')) return 'ITMS / Alerts';
  if (pathname.startsWith('/itms/review')) return 'ITMS / Review Center';
  if (pathname.startsWith('/itms/investigation')) return 'ITMS / Investigation';
  if (pathname.startsWith('/itms/analytics')) return 'ITMS / Analytics';
  return 'Intelligent Traffic Management';
}

export function ITMSTopBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const pathname = location.pathname;

  const activeMain = useMemo(
    () => ITMS_ROUTES.find((r) => pathname === r.path || pathname.startsWith(r.path + '/'))?.path,
    [pathname]
  );


  const heading = useMemo(() => getHeading(pathname), [pathname]);

  return (
    <div className="w-full h-14 flex items-center justify-between px-6 border-b border-white/5 bg-[#050505]/90 backdrop-blur-sm">
      {/* Left: Heading */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">ITMS</span>
        <h1 className="text-sm md:text-lg font-semibold text-zinc-100 ">
          {heading}
        </h1>
      </div>

      {/* Right: Submenu */}
      <div className="flex items-center gap-4">
        {/* Main views */}
        <div className="hidden lg:flex items-center gap-1 bg-zinc-900/50 border border-white/5 rounded-full px-1 py-1">
          {ITMS_ROUTES.map((route) => {
            const Icon = route.icon;
            const isActive = activeMain === route.path;
            return (
              <Button
                key={route.path}
                variant="ghost"
                size="sm"
                onClick={() => navigate(route.path)}
                className={cn(
                  'h-8 px-3 rounded-full text-[11px] flex items-center gap-1 border transition-all',
                  isActive
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                )}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden xl:inline">{route.label}</span>
              </Button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
