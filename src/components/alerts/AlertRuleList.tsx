// AlertRuleList — rules for one module: summary rows + enable toggle, edit/delete/test.
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatIST } from '@/lib/dateUtils';
import {
  apiClient,
  type AlertModule,
  type AlertRule,
  type CrowdAlertParams,
  type ItmsAlertParams,
  type FrsAlertParams,
  type SearchAlertParams,
  type ForensicsAlertParams,
} from '@/lib/api';

interface AlertRuleListProps {
  module: AlertModule;
  onEdit: (rule: AlertRule) => void;
  refreshKey: number;
}

function summarizeParams(rule: AlertRule): string {
  switch (rule.module) {
    case 'crowd': {
      const p = rule.params as CrowdAlertParams;
      const where = p.deviceIds?.length ? p.deviceIds.join(', ') : 'all cameras';
      return `≥ ${p.threshold} people · ${where}`;
    }
    case 'itms': {
      const p = rule.params as ItmsAlertParams;
      const parts: string[] = [];
      if (p.watchlistMatch) parts.push('watchlist match');
      if (p.violationTypes?.length) parts.push(p.violationTypes.join(', '));
      if (p.deviceIds?.length) parts.push(p.deviceIds.join(', '));
      return parts.length ? parts.join(' · ') : 'any violation';
    }
    case 'frs': {
      const p = rule.params as FrsAlertParams;
      const who = p.personIds?.length ? `${p.personIds.length} person(s)` : 'any known face';
      return `${who} · score ≥ ${p.minMatchScore}`;
    }
    case 'search': {
      const p = rule.params as SearchAlertParams;
      return `prompt: "${p.prompt}" ≥ ${p.minScore} · top ${p.topK}`;
    }
    case 'forensics': {
      const p = rule.params as ForensicsAlertParams;
      const parts: string[] = [];
      if (p.riskLevels?.length) parts.push(p.riskLevels.join(', '));
      if (p.keywords?.length) parts.push(`keywords: ${p.keywords.join(', ')}`);
      return parts.length ? parts.join(' · ') : 'any finding';
    }
    default:
      return '';
  }
}

type TestResult = { ok: boolean; message: string };

export function AlertRuleList({ module, onEdit, refreshKey }: AlertRuleListProps) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const [testingId, setTestingId] = useState<number | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getAlertRules(module);
      setRules(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    setLoading(true);
    fetchRules();
  }, [fetchRules, refreshKey]);

  const handleToggle = async (rule: AlertRule) => {
    // Optimistic flip; revert on failure.
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await apiClient.updateAlertRule(rule.id, { enabled: !rule.enabled });
    } catch {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
    }
  };

  const handleDelete = async (rule: AlertRule) => {
    if (!window.confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.deleteAlertRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete rule');
    }
  };

  const handleTest = async (rule: AlertRule) => {
    setTestingId(rule.id);
    try {
      const res = await apiClient.testAlertRule(rule.id);
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: res.ok
          ? { ok: true, message: 'sent ✓' }
          : { ok: false, message: `failed: ${res.error || 'unknown error'}` },
      }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: { ok: false, message: `failed: ${e instanceof Error ? e.message : 'request error'}` },
      }));
    } finally {
      setTestingId(null);
      // Clear the transient result after a few seconds.
      const id = rule.id;
      setTimeout(() => {
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 6000);
    }
  };

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading rules…</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {rules.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">No rules yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first rule with the <span className="text-amber-400">New Rule</span> button.
          </p>
        </div>
      )}

      {rules.map((rule) => {
        const test = testResults[rule.id];
        return (
          <div
            key={rule.id}
            className="rounded-lg border border-border bg-background/50 p-3 transition-colors hover:border-amber-500/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{rule.name}</span>
                  {!rule.enabled && (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      disabled
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{summarizeParams(rule)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  <span className="text-amber-400/80">WhatsApp</span>{' '}
                  <span className="tabular-nums">{rule.whatsappTo}</span>
                  {' · cooldown '}
                  <span className="tabular-nums">{rule.cooldownSec}s</span>
                  {' · last fired '}
                  {rule.lastFiredAt ? formatIST(rule.lastFiredAt, 'relative') : 'never'}
                </p>
              </div>

              {/* Enabled toggle */}
              <button
                role="switch"
                aria-checked={rule.enabled}
                onClick={() => handleToggle(rule)}
                className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
                  rule.enabled ? 'bg-amber-500' : 'bg-muted'
                }`}
                title={rule.enabled ? 'Disable rule' : 'Enable rule'}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    rule.enabled ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => onEdit(rule)} className="h-7 px-2 text-xs">
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(rule)}
                className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTest(rule)}
                disabled={testingId === rule.id}
                className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
              >
                <Send className="h-3 w-3" /> {testingId === rule.id ? 'Testing…' : 'Test'}
              </Button>
              {test && (
                <span className={`text-xs ${test.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {test.message}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
