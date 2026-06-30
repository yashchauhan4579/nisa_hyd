import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor, Car, BarChart3, Search, Settings as SettingsIcon,
  Server, Radio, Save, Check, Globe, ChevronRight,
} from 'lucide-react';
import { useFeatureFlags, type PlatformConfig } from '@/contexts/FeatureFlagsContext';
import { FEATURE_TREE, type FeatureNode } from '@/lib/featureTree';
import { GlassCard, GradientPill, MotionStagger, MotionItem, spring } from '@/components/premium';

const MODULE_ICON: Record<string, typeof Monitor> = {
  vms: Monitor, itms: Car, analytics: BarChart3, search: Search, settings: SettingsIcon,
};

export function PlatformSettingsPage() {
  const { config, updateConfig, loading } = useFeatureFlags();
  const [draft, setDraft] = useState<PlatformConfig>(config);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(config); }, [config, loading]);

  const on = (key: string) => draft.features[key] !== false; // fail-open
  const setFeature = (key: string, val: boolean) =>
    setDraft(d => ({ ...d, features: { ...d.features, [key]: val } }));

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);
  const enabledCount = useMemo(() => Object.values(draft.features).filter(v => v !== false).length, [draft.features]);

  const save = async () => {
    setSaving(true);
    try {
      await updateConfig({
        siteName: draft.siteName, features: draft.features,
        deploymentMode: draft.deploymentMode, centralServerUrl: draft.centralServerUrl,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SettingsIcon className="h-5 w-5 text-zinc-400" />
              <h1 className="text-xl font-black tracking-tight">Platform Configuration</h1>
            </div>
            <p className="text-sm text-zinc-500">Tune which features — down to individual violation types — appear in this deployment.</p>
          </div>
          <motion.button
            onClick={save} disabled={!dirty || saving}
            whileHover={dirty && !saving ? { scale: 1.03, transition: spring } : undefined}
            whileTap={dirty && !saving ? { scale: 0.97 } : undefined}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold text-black bg-orange-400 disabled:opacity-40
                       flex items-center gap-2 shadow-[0_8px_30px_-10px_rgba(249,115,22,0.6)]">
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save changes'}
          </motion.button>
        </div>

        {/* deployment mode */}
        <GlassCard className="p-5 mb-6" accent="#22c55e">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Deployment Mode</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModeCard active={draft.deploymentMode === 'server'} icon={<Server className="h-5 w-5" />}
              title="Central Server" desc="Receives detection events from edge devices via /api/events/ingest and stores them."
              onClick={() => setDraft(d => ({ ...d, deploymentMode: 'server' }))} />
            <ModeCard active={draft.deploymentMode === 'edge'} icon={<Radio className="h-5 w-5" />}
              title="Edge Node" desc="Processes camera feeds locally and forwards detections to a central server."
              onClick={() => setDraft(d => ({ ...d, deploymentMode: 'edge' }))} />
          </div>
          {draft.deploymentMode === 'edge' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Central server URL</label>
              <input value={draft.centralServerUrl} onChange={e => setDraft(d => ({ ...d, centralServerUrl: e.target.value }))}
                placeholder="https://central.iris.local:3001"
                className="mt-1.5 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" />
            </motion.div>
          )}
        </GlassCard>

        {/* feature tree */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Visible Features</h2>
          <GradientPill color="#f59e0b">{enabledCount} enabled</GradientPill>
        </div>
        <MotionStagger className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {FEATURE_TREE.map(m => {
            const Icon = MODULE_ICON[m.module] ?? SettingsIcon;
            const moduleOn = on(m.module);
            return (
              <MotionItem key={m.module}>
                <GlassCard accent={m.accent} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2" style={{ color: m.accent }}>
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-bold uppercase tracking-widest">{m.label}</span>
                    </div>
                    <Switch on={moduleOn} accent={m.accent} onChange={v => setFeature(m.module, v)} />
                  </div>
                  <div className={`transition-opacity ${moduleOn ? '' : 'opacity-40 pointer-events-none'}`}>
                    {m.children.map(node => (
                      <FeatureRow key={node.key} node={node} accent={m.accent} on={on} setFeature={setFeature} depth={0} />
                    ))}
                    {m.children.length === 1 && m.children[0].key === m.module && (
                      <p className="text-[11px] text-zinc-600">Toggle the module switch above to show/hide.</p>
                    )}
                  </div>
                </GlassCard>
              </MotionItem>
            );
          })}
        </MotionStagger>

        <p className="text-[11px] text-zinc-600 mt-6">
          Changes apply across the deployment. Disabled features are hidden from the 3D hub, sidebar, routes, and lists (e.g. a
          disabled violation type won't appear in the Violations queue) for every operator.
        </p>
      </div>
    </div>
  );
}

// Recursive row: a leaf is a toggle; a branch is a collapsible group with its own toggle + nested rows.
function FeatureRow({ node, accent, on, setFeature, depth }:
  { node: FeatureNode; accent: string; on: (k: string) => boolean; setFeature: (k: string, v: boolean) => void; depth: number }) {
  const hasChildren = !!node.children?.length;
  const [open, setOpen] = useState(depth === 0 && node.children && node.children.length <= 4 ? true : false);
  const enabled = on(node.key);

  if (!hasChildren) {
    return (
      <div className="flex items-center justify-between py-1.5" style={{ paddingLeft: depth * 12 }}>
        <span className="text-sm text-zinc-300">{node.label}</span>
        <Switch on={enabled} accent={accent} onChange={v => setFeature(node.key, v)} small />
      </div>
    );
  }
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <div className="flex items-center justify-between py-1.5">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-sm font-semibold text-zinc-200">
          <ChevronRight className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`} />
          {node.label}
          <span className="text-[10px] text-zinc-600 ml-1">{node.children!.length}</span>
        </button>
        <Switch on={enabled} accent={accent} onChange={v => setFeature(node.key, v)} small />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className={`overflow-hidden border-l border-white/5 ml-1.5 transition-opacity ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            {node.children!.map(child => (
              <FeatureRow key={child.key} node={child} accent={accent} on={on} setFeature={setFeature} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModeCard({ active, icon, title, desc, onClick }:
  { active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-xl border p-4 transition ${active ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}>
      <div className="flex items-center gap-2 mb-1.5" style={{ color: active ? '#22c55e' : '#a1a1aa' }}>
        {icon}<span className="text-sm font-bold">{title}</span>
        {active && <Check className="h-4 w-4 ml-auto" />}
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">{desc}</p>
    </button>
  );
}

function Switch({ on, accent, onChange, small }: { on: boolean; accent: string; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      className={`relative shrink-0 ${small ? 'w-8 h-[18px]' : 'w-10 h-5'} rounded-full transition-colors ${on ? '' : 'bg-zinc-700'}`}
      style={on ? { background: accent } : undefined}>
      <motion.span layout transition={spring}
        className={`absolute top-0.5 ${small ? 'h-3.5 w-3.5' : 'h-4 w-4'} rounded-full bg-white`}
        style={{ left: on ? 'calc(100% - 2px)' : '2px', transform: on ? 'translateX(-100%)' : 'none' }} />
    </button>
  );
}
