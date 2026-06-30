// AlertsHubPage — central alerts hub: per-module WhatsApp alert rules + fired-alert
// feeds, plus the legacy sringeri "All Alerts" incident view as the last tab.
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { ModuleAlertsPanel } from '@/components/alerts/ModuleAlertsPanel';
import { AlertsPage as SringeriAlertsPage } from '@sringeri/components/itms/AlertsPage';
import type { AlertModule } from '@/lib/api';

type HubTab = AlertModule | 'all';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'crowd', label: 'Crowd' },
  { id: 'itms', label: 'ITMS' },
  { id: 'frs', label: 'FRS' },
  { id: 'search', label: 'Search' },
  { id: 'forensics', label: 'Observer' },
  { id: 'all', label: 'All Alerts' },
];

const MODULE_SUBTITLES: Record<AlertModule, string> = {
  crowd: 'Fire WhatsApp alerts when crowd counts cross a threshold.',
  itms: 'Watchlist plate matches and traffic violations.',
  frs: 'Known-face sightings from facial recognition.',
  search: 'CLIP semantic search hits against live footage.',
  forensics: 'Risk findings from Observer’s frame-by-frame scene analysis.',
};

export function AlertsHubPage() {
  const [activeTab, setActiveTab] = useState<HubTab>('crowd');

  const isModuleTab = activeTab !== 'all';
  const module = isModuleTab ? (activeTab as AlertModule) : null;

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[1600px] p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
            <Bell className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
            <p className="text-sm text-muted-foreground">
              WhatsApp alert rules and fired alerts across every IRIS module
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Module tabs: rules + recent alerts */}
        {module && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">{MODULE_SUBTITLES[module]}</p>
            <ModuleAlertsPanel key={module} module={module} />
          </>
        )}

        {/* Legacy combined alerts view (iris-sringeri) */}
        {activeTab === 'all' && (
          <div className="-mx-6 -mb-6">
            <SringeriAlertsPage />
          </div>
        )}
      </div>
    </div>
  );
}
