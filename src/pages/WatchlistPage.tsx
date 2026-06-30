import { useState, useEffect, useCallback } from 'react';
import { apiClient, type Watchlist, type WatchlistAlert, type AlertStats } from '@/lib/api';
import { Star, Plus, Trash2, Loader2, Bell, Car, ShieldAlert, Clock, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Watchlist management — add plate numbers to the ANPR watchlist so future
// (and retroactive 48 h) detections raise WatchlistAlerts. Route: /itms/watchlist.

const timeAgo = (s: string) => {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (isNaN(d) || d < 0) return '';
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};
const fmtDate = (s: string) => { try { return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }); } catch { return s; } };

export function WatchlistPage() {
  const [entries, setEntries] = useState<Watchlist[]>([]);
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFrs, setShowFrs] = useState(false);
  const [form, setForm] = useState({ plate: '', reason: '', alertOnDetection: true, alertOnViolation: false, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | number | null>(null);

  const load = useCallback(async () => {
    const [e, a, s] = await Promise.allSettled([
      apiClient.getWatchlist(),
      apiClient.getWatchlistAlerts({ limit: 50 }),
      apiClient.getAlertStats(),
    ]);
    if (e.status === 'fulfilled') setEntries(e.value ?? []);
    if (a.status === 'fulfilled') setAlerts(a.value?.alerts ?? []);
    if (s.status === 'fulfilled') setStats(s.value ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  const add = async () => {
    const plate = form.plate.trim().toUpperCase();
    if (!plate) { setError('Plate number required'); return; }
    if (!form.reason.trim()) { setError('Reason required'); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.addWatchlistPlate({
        plateNumber: plate,
        reason: form.reason.trim(),
        addedBy: localStorage.getItem('username') || 'operator',
        alertOnDetection: form.alertOnDetection,
        alertOnViolation: form.alertOnViolation,
        notes: form.notes.trim() || undefined,
      });
      setForm({ plate: '', reason: '', alertOnDetection: true, alertOnViolation: false, notes: '' });
      await load();
    } catch (e: any) {
      setError(e?.message?.includes('409') || /already/i.test(e?.message || '') ? 'This plate is already on the watchlist.' : (e?.message || 'Failed to add'));
    } finally { setSubmitting(false); }
  };

  const remove = async (entry: Watchlist) => {
    try {
      await apiClient.removeFromWatchlist(String(entry.vehicleId));
      setConfirmRemove(null);
      await load();
    } catch (e: any) { setError(e?.message || 'Failed to remove'); }
  };

  const visibleAlerts = alerts.filter(a => showFrs || a.alertType !== 'FRS_KNOWN_FACE');

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-amber-400">
          <Star className="w-10 h-10 animate-pulse" />
          <p className="text-sm text-zinc-400">Loading watchlist…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto scroll-on-hover bg-zinc-950 text-zinc-100">
      <div className="p-5 space-y-5 max-w-[1500px] mx-auto">

        {/* Header */}
        <div className="rounded-2xl border border-white/10 relative bg-card">
          <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg,var(--brand-accent) 0 1px,transparent 1px 14px)' }} />
          <div className="relative px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center shrink-0"><Star className="w-5 h-5 text-amber-300" /></div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-amber-300/80 uppercase tracking-[0.2em]">IRIS Command Center · ITMS</p>
                <h1 className="text-sm font-bold text-white tracking-tight truncate">Vehicle Watchlist</h1>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <div className="text-center"><div className="text-lg font-black tabular-nums text-amber-300">{entries.length}</div><div className="text-[8px] text-zinc-600 uppercase tracking-wider">Plates</div></div>
              <div className="text-center"><div className="text-lg font-black tabular-nums text-red-400">{stats?.unread ?? 0}</div><div className="text-[8px] text-zinc-600 uppercase tracking-wider">Unread</div></div>
              <div className="text-center"><div className="text-lg font-black tabular-nums text-zinc-300">{stats?.today ?? 0}</div><div className="text-[8px] text-zinc-600 uppercase tracking-wider">Today</div></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          {/* Left — add form + entries */}
          <div className="xl:col-span-3 space-y-5">
            {/* Add by plate */}
            <div className="rounded-2xl border border-amber-500/15 bg-zinc-900/60 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10"><Plus className="w-4 h-4 text-amber-300" /></div>
                <p className="text-sm font-semibold text-zinc-100">Add Plate to Watchlist</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">License Plate</label>
                    <Input value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                      placeholder="AP16 AB 1234" className="font-mono uppercase tracking-wider" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Reason</label>
                    <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Stolen vehicle / repeat violator…" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Notes (optional)</label>
                  <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Case ref, description…" />
                </div>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 text-[11px] text-zinc-400">
                    <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={form.alertOnDetection} onChange={e => setForm({ ...form, alertOnDetection: e.target.checked })} /> Alert on detection</label>
                    <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={form.alertOnViolation} onChange={e => setForm({ ...form, alertOnViolation: e.target.checked })} /> Alert on violation</label>
                  </div>
                  <Button onClick={add} disabled={submitting} className="bg-amber-500 text-black hover:bg-amber-400 font-bold">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add to Watchlist
                  </Button>
                </div>
                {error && <p className="text-[11px] text-red-400">{error}</p>}
                <p className="text-[10px] text-zinc-600">Adding a plate also raises alerts for its detections from the last 48 hours.</p>
              </div>
            </div>

            {/* Entries table */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10"><ShieldAlert className="w-4 h-4 text-amber-300" /></div>
                <p className="text-sm font-semibold text-zinc-100">Watchlisted Plates · {entries.length}</p>
              </div>
              {entries.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-600">No plates on the watchlist yet — add one above.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {entries.map(e => (
                    <div key={String(e.id)} className="px-5 py-3 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-white/10 grid place-items-center shrink-0"><Car className="w-4 h-4 text-amber-300" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-white tracking-wider">{e.vehicle?.plateNumber || `#${e.vehicleId}`}</span>
                          {e.alertOnDetection && <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] px-1.5 py-0">DET</Badge>}
                          {e.alertOnViolation && <Badge className="bg-red-500/15 text-red-300 border border-red-500/30 text-[9px] px-1.5 py-0">VIO</Badge>}
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">{e.reason}{e.notes ? ` — ${e.notes}` : ''}</p>
                        <p className="text-[10px] text-zinc-600">by {e.addedBy} · {fmtDate(e.addedAt)}</p>
                      </div>
                      {confirmRemove === e.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="destructive" onClick={() => remove(e)} className="h-7 text-[11px]">Remove</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)} className="h-7 text-[11px]">Cancel</Button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemove(e.id)} title="Remove from watchlist"
                          className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right — recent watchlist alerts */}
          <div className="xl:col-span-2">
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10"><Bell className="w-4 h-4 text-amber-300" /></div>
                <p className="text-sm font-semibold text-zinc-100">Recent Alerts</p>
                <label className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer">
                  <input type="checkbox" checked={showFrs} onChange={e => setShowFrs(e.target.checked)} /> show FRS
                </label>
              </div>
              <div className="max-h-[70vh] overflow-y-auto scroll-on-hover divide-y divide-white/5">
                {visibleAlerts.length === 0 ? (
                  <div className="py-12 text-center text-sm text-zinc-600">No watchlist alerts yet.<br /><span className="text-[11px]">Alerts appear when a watchlisted plate is detected.</span></div>
                ) : visibleAlerts.map(a => {
                  const thumb = a.detection?.plateImageUrl || a.detection?.fullImageUrl || (a.metadata?.plateImageUrl as string) || (a.metadata?.fullImageUrl as string) || null;
                  const isHistorical = !!a.metadata?.historical;
                  return (
                    <div key={String(a.id)} className={`px-4 py-3 flex items-start gap-3 ${a.isRead ? 'opacity-60' : ''}`}>
                      <div className="w-14 h-11 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 grid place-items-center shrink-0">
                        {thumb ? <img src={thumb} className="w-full h-full object-cover" alt="" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <ImageOff className="w-4 h-4 text-zinc-700" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className={`text-[8px] px-1.5 py-0 border ${a.alertType === 'VIOLATION' ? 'bg-red-500/15 text-red-300 border-red-500/30' : a.alertType === 'FRS_KNOWN_FACE' ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}`}>{a.alertType}</Badge>
                          {isHistorical && <Badge className="bg-zinc-700/40 text-zinc-400 border border-white/10 text-[8px] px-1.5 py-0">HISTORICAL</Badge>}
                          {!a.isRead && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                        </div>
                        <p className="text-[12px] text-zinc-200 mt-0.5 leading-snug">{a.message}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{a.device?.name || a.deviceId} · {timeAgo(a.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WatchlistPage;
