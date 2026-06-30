// ModuleAlertsPanel — the rules + recent-alerts body for a single module.
// Shared by the central AlertsHubPage (per tab) and the per-module alert pages
// so they render identical markup from one source of truth.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertRuleForm } from './AlertRuleForm';
import { AlertRuleList } from './AlertRuleList';
import { AlertEventsFeed } from './AlertEventsFeed';
import type { AlertModule, AlertRule } from '@/lib/api';

interface ModuleAlertsPanelProps {
  module: AlertModule;
}

export function ModuleAlertsPanel({ module }: ModuleAlertsPanelProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rules
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setEditingRule(undefined);
                setFormOpen(true);
              }}
              className="bg-amber-500 text-black hover:bg-amber-400"
            >
              <Plus className="h-4 w-4" /> New Rule
            </Button>
          </CardHeader>
          <CardContent>
            <AlertRuleList
              module={module}
              onEdit={(rule) => {
                setEditingRule(rule);
                setFormOpen(true);
              }}
              refreshKey={refreshKey}
            />
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertEventsFeed module={module} />
          </CardContent>
        </Card>
      </div>

      {formOpen && (
        <AlertRuleForm
          module={module}
          initial={editingRule}
          onClose={() => {
            setFormOpen(false);
            setEditingRule(undefined);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditingRule(undefined);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}
