// AlertRuleForm — create/edit modal for a module's alert rule.
// One WhatsApp recipient per rule; module-specific trigger params.
// Layout: sectioned (Notify / Trigger / Cameras), switch + chip controls,
// camera picker behind progressive disclosure — per the UI/UX guidelines
// (visible labels, grouped hierarchy, ≥40px touch targets, clear close).
import { useState, type ReactNode } from 'react';
import { X, Bell, ChevronDown, MessageCircle, Crosshair, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CameraPicker } from './CameraPicker';
import {
  apiClient,
  type AlertModule,
  type AlertRule,
  type AlertRuleParams,
  type CrowdAlertParams,
  type ItmsAlertParams,
  type FrsAlertParams,
  type SearchAlertParams,
  type ForensicsAlertParams,
} from '@/lib/api';

const PHONE_RE = /^\+?[0-9]{8,15}$/;
const VIOLATION_TYPES = ['HELMET', 'SPEED', 'NO_SEATBELT', 'TRIPLE_RIDING', 'WRONG_SIDE'];
const RISK_LEVELS = ['medium', 'high', 'critical'];

const MODULE_LABELS: Record<AlertModule, string> = {
  crowd: 'Crowd',
  itms: 'ITMS',
  frs: 'FRS',
  search: 'Search',
  forensics: 'Observer',
};

interface AlertRuleFormProps {
  module: AlertModule;
  initial?: AlertRule;
  onClose: () => void;
  onSaved: () => void;
}

function parseCsv(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ── small presentation helpers ────────────────────────────── */

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="px-6 py-5">
      <div className="mb-3.5 flex items-center gap-2">
        <span className="text-amber-500">{icon}</span>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h4>
        {hint && <span className="text-[11px] text-muted-foreground">— {hint}</span>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

function SwitchRow({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-lg border border-border bg-background/60 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50"
    >
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch on={on} onChange={onChange} label={label} />
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
        on
          ? 'border-amber-500 bg-amber-500 text-black'
          : 'border-border bg-background/60 text-muted-foreground hover:border-amber-500/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SliderRow({ id, label, value, display, min, max, step, onChange }: {
  id: string; label: string; value: number; display: string;
  min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-500">{display}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500"
      />
    </div>
  );
}

function Field({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ── the form ──────────────────────────────────────────────── */

export function AlertRuleForm({ module, initial, onClose, onSaved }: AlertRuleFormProps) {
  const p = initial?.params as Partial<
    CrowdAlertParams & ItmsAlertParams & FrsAlertParams & SearchAlertParams & ForensicsAlertParams
  > | undefined;

  // Common fields
  const [name, setName] = useState(initial?.name ?? '');
  const [whatsappTo, setWhatsappTo] = useState(initial?.whatsappTo ?? '');
  const [cooldownSec, setCooldownSec] = useState<number>(initial?.cooldownSec ?? 300);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  // crowd
  const [threshold, setThreshold] = useState<number>(p?.threshold ?? 50);
  // crowd / itms / frs — cameras the rule is scoped to (empty = all)
  const [deviceIds, setDeviceIds] = useState<string[]>(p?.deviceIds ?? []);
  const [camsOpen, setCamsOpen] = useState((p?.deviceIds ?? []).length > 0);
  // itms
  const [watchlistMatch, setWatchlistMatch] = useState(p?.watchlistMatch ?? false);
  const [violationTypes, setViolationTypes] = useState<string[]>(p?.violationTypes ?? []);
  const [platesText, setPlatesText] = useState((p?.plates ?? []).join(', '));
  // frs
  const [personIdsText, setPersonIdsText] = useState((p?.personIds ?? []).join(', '));
  const [minMatchScore, setMinMatchScore] = useState<number>(p?.minMatchScore ?? 0.6);
  // search
  const [prompt, setPrompt] = useState(p?.prompt ?? '');
  const [minScore, setMinScore] = useState<number>(p?.minScore ?? 0.28);
  const [topK, setTopK] = useState<number>(p?.topK ?? 8);
  // forensics
  const [riskLevels, setRiskLevels] = useState<string[]>(p?.riskLevels ?? []);
  const [keywordsText, setKeywordsText] = useState((p?.keywords ?? []).join(', '));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleInList = (list: string[], item: string, set: (v: string[]) => void) => {
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const buildParams = (): AlertRuleParams => {
    switch (module) {
      case 'crowd':
        return { threshold, deviceIds };
      case 'itms':
        return { watchlistMatch, violationTypes, deviceIds, plates: parseCsv(platesText) };
      case 'frs':
        return { personIds: parseCsv(personIdsText), minMatchScore, deviceIds };
      case 'search':
        return { prompt: prompt.trim(), minScore, topK };
      case 'forensics':
        return { riskLevels, keywords: parseCsv(keywordsText) };
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Rule name is required.');
      return;
    }
    if (!PHONE_RE.test(whatsappTo.trim())) {
      setError('WhatsApp number must be 8–15 digits with country code (e.g. +919876543210).');
      return;
    }
    if (module === 'search' && !prompt.trim()) {
      setError('Search prompt is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        module,
        name: name.trim(),
        enabled,
        params: buildParams(),
        whatsappTo: whatsappTo.trim(),
        cooldownSec: Number.isFinite(cooldownSec) ? cooldownSec : 300,
      };
      if (initial) {
        await apiClient.updateAlertRule(initial.id, payload);
      } else {
        await apiClient.createAlertRule(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const hasCameras = module === 'crowd' || module === 'itms' || module === 'frs';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-xl max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — title, module chip, Enabled switch, close */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
            <Bell className="h-4 w-4 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-none">
              {initial ? 'Edit rule' : 'New rule'}
              <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                {MODULE_LABELS[module]}
              </span>
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">Fires a WhatsApp when the trigger matches.</p>
          </div>
          <label className="mr-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {enabled ? 'Active' : 'Paused'}
            <Switch on={enabled} onChange={setEnabled} label="Rule enabled" />
          </label>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {/* 1 — notify */}
          <Section icon={<MessageCircle className="h-3.5 w-3.5" />} title="Notify">
            <Field id="rule-name" label="Rule name">
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Temple gate overcrowding"
                autoFocus={!initial}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="rule-whatsapp" label="WhatsApp number" hint="With country code, e.g. +919876543210">
                <Input
                  id="rule-whatsapp"
                  type="tel"
                  inputMode="tel"
                  value={whatsappTo}
                  onChange={(e) => setWhatsappTo(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                />
              </Field>
              <Field id="rule-cooldown" label="Cooldown" hint="Seconds between repeat alerts">
                <Input
                  id="rule-cooldown"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={cooldownSec}
                  onChange={(e) => setCooldownSec(parseInt(e.target.value, 10) || 0)}
                  className="tabular-nums"
                />
              </Field>
            </div>
          </Section>

          {/* 2 — trigger */}
          <Section icon={<Crosshair className="h-3.5 w-3.5" />} title="Trigger">
            {module === 'crowd' && (
              <Field id="crowd-threshold" label="People threshold" hint="Alert when the live people count reaches this number.">
                <Input
                  id="crowd-threshold"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)}
                  className="tabular-nums sm:w-40"
                />
              </Field>
            )}

            {module === 'itms' && (
              <>
                <SwitchRow
                  on={watchlistMatch}
                  onChange={setWatchlistMatch}
                  label="Watchlist plate match"
                  hint="Fire when any watchlisted vehicle is detected"
                />
                <div className="space-y-1.5">
                  <Label>Violation types</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {VIOLATION_TYPES.map((vt) => (
                      <Chip key={vt} on={violationTypes.includes(vt)} onClick={() => toggleInList(violationTypes, vt, setViolationTypes)}>
                        {vt.replace(/_/g, ' ')}
                      </Chip>
                    ))}
                  </div>
                </div>
                <Field id="itms-plates" label="Track plate numbers" hint="Optional, comma-separated. Fires whenever a listed plate is detected (case/spacing ignored).">
                  <Input
                    id="itms-plates"
                    value={platesText}
                    onChange={(e) => setPlatesText(e.target.value)}
                    placeholder="KA01AB1234, AP16XY9999"
                  />
                </Field>
              </>
            )}

            {module === 'frs' && (
              <>
                <Field id="frs-persons" label="Person IDs" hint="Optional, comma-separated. Empty = any known face.">
                  <Input
                    id="frs-persons"
                    value={personIdsText}
                    onChange={(e) => setPersonIdsText(e.target.value)}
                    placeholder="empty = any known face"
                  />
                </Field>
                <SliderRow
                  id="frs-score" label="Min match score" value={minMatchScore} display={minMatchScore.toFixed(2)}
                  min={0} max={1} step={0.05} onChange={setMinMatchScore}
                />
              </>
            )}

            {module === 'search' && (
              <>
                <Field id="search-prompt" label="Prompt" hint="Plain-language description CLIP matches against live footage.">
                  <Input
                    id="search-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. pink car"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
                  <SliderRow
                    id="search-score" label="Min score" value={minScore} display={minScore.toFixed(2)}
                    min={0} max={1} step={0.01} onChange={setMinScore}
                  />
                  <Field id="search-topk" label="Top K">
                    <Input
                      id="search-topk"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={topK}
                      onChange={(e) => setTopK(parseInt(e.target.value, 10) || 1)}
                      className="tabular-nums"
                    />
                  </Field>
                </div>
              </>
            )}

            {module === 'forensics' && (
              <>
                <div className="space-y-1.5">
                  <Label>Risk levels</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {RISK_LEVELS.map((rl) => (
                      <Chip key={rl} on={riskLevels.includes(rl)} onClick={() => toggleInList(riskLevels, rl, setRiskLevels)}>
                        <span className="capitalize">{rl}</span>
                      </Chip>
                    ))}
                  </div>
                </div>
                <Field id="forensics-keywords" label="Keywords" hint="Comma-separated. Matches against behaviour/summary text.">
                  <Input
                    id="forensics-keywords"
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    placeholder="fighting, panic, stampede"
                  />
                </Field>
              </>
            )}
          </Section>

          {/* 3 — cameras (progressive disclosure; default = all cameras) */}
          {hasCameras && (
            <Section icon={<Video className="h-3.5 w-3.5" />} title="Cameras">
              <button
                type="button"
                onClick={() => setCamsOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-background/60 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50"
                aria-expanded={camsOpen}
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {deviceIds.length === 0 ? 'All cameras' : `${deviceIds.length} camera${deviceIds.length > 1 ? 's' : ''} selected`}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {deviceIds.length === 0 ? 'Rule applies everywhere — narrow it to specific cameras if needed' : 'Rule fires only for the selected cameras'}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${camsOpen ? 'rotate-180' : ''}`} />
              </button>
              {camsOpen && <CameraPicker selected={deviceIds} onChange={setDeviceIds} />}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-6 py-4">
          {error && <p className="min-w-0 flex-1 truncate text-xs text-red-500" title={error}>{error}</p>}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 text-black hover:bg-amber-400"
            >
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Create rule'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
