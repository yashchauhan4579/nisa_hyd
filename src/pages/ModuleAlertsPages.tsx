// Per-module alert pages — each module's own Alerts page, reachable from inside
// that module's sidebar flyout. They share ModuleAlertsPanel with the central
// AlertsHubPage, so rules/feeds render identically; only the header differs.
import { Bell } from 'lucide-react';
import { ModuleAlertsPanel } from '@/components/alerts/ModuleAlertsPanel';
import type { AlertModule } from '@/lib/api';

const META: Record<AlertModule, { title: string; subtitle: string }> = {
  crowd: {
    title: 'Crowd Alerts',
    subtitle: 'Fire a WhatsApp when people-count crosses a threshold at chosen cameras/locations.',
  },
  itms: {
    title: 'ITMS Alerts',
    subtitle: 'Track specific plate numbers, watchlist matches, and traffic violations.',
  },
  frs: {
    title: 'FRS Alerts',
    subtitle: 'Get notified when a known/watchlisted face is detected.',
  },
  search: {
    title: 'Search Alerts',
    subtitle: 'Fire on CLIP semantic-search hits against live footage (e.g. "pink car").',
  },
  forensics: {
    title: 'Observer Alerts',
    subtitle: 'Fire on high-risk findings from Observer’s frame-by-frame scene analysis.',
  },
};

function ModuleAlertsPage({ module }: { module: AlertModule }) {
  const meta = META[module];
  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[1600px] p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
            <Bell className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
            <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
          </div>
        </div>
        <ModuleAlertsPanel module={module} />
      </div>
    </div>
  );
}

// ITMS keeps a dedicated Alerts sub-page (it's a multi-section module: ANPR /
// Violations / VCC / Alerts). Crowd / FRS / Search / Forensics surface alerts
// in-module via ModuleAlertsLayer instead of a standalone page.
export const ItmsAlertsPage = () => <ModuleAlertsPage module="itms" />;
