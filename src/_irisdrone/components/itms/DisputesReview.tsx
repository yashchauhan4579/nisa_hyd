import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gavel,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient as api, type DisputeReason, type DisputeStatus, type ViolationDispute } from '@irisdrone/lib/api';

const REASON_LABEL: Record<DisputeReason, string> = {
  WRONG_PLATE:  'Plate number is wrong',
  NOT_OWNER:    'Not the citizen\'s vehicle',
  WRONG_PERSON: 'Person in photo is not them',
  ALREADY_PAID: 'Already paid (claimed)',
  NO_VIOLATION: 'No violation occurred',
  DUPLICATE:    'Duplicate of another challan',
  OTHER:        'Other',
};

const STATUS_TABS: Array<{ key: DisputeStatus | 'ALL'; label: string }> = [
  { key: 'PENDING',      label: 'Pending' },
  { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'ACCEPTED',     label: 'Accepted' },
  { key: 'REJECTED',     label: 'Rejected' },
  { key: 'ALL',          label: 'All' },
];

export function DisputesReview() {
  const [tab, setTab] = useState<DisputeStatus | 'ALL'>('PENDING');
  const [rows, setRows] = useState<ViolationDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<ViolationDispute | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.listDisputes({
        status: tab === 'ALL' ? '' : tab,
        limit: 100,
      });
      setRows(res.data);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const counts = useMemo(() => {
    const c: Record<DisputeStatus, number> = { PENDING: 0, UNDER_REVIEW: 0, ACCEPTED: 0, REJECTED: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning">
            <Gavel className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Dispute Review</h1>
            <p className="text-xs text-muted-foreground">
              Citizen-raised contests of issued challans. Accepting a dispute voids the linked violation.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {STATUS_TABS.map((s) => {
          const active = tab === s.key;
          const count = s.key !== 'ALL' ? counts[s.key as DisputeStatus] : undefined;
          return (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
              {count !== undefined && count > 0 && tab !== s.key && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] text-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {err && (
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading disputes…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Raised</th>
                <th className="px-4 py-3 text-left">Plate</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tracking-wider">
                    {d.violation?.plateNumber ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">{REASON_LABEL[d.reason]}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.phone}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setActive(d)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <ReviewDrawer
          dispute={active}
          onClose={() => setActive(null)}
          onUpdated={(updated) => {
            setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
            setActive(updated);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: DisputeStatus | 'ALL' }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/40 p-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Gavel className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-semibold">No disputes</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {tab === 'PENDING'
          ? 'Nothing waiting for review right now.'
          : tab === 'ALL'
            ? 'No disputes have been raised yet.'
            : `No disputes are currently ${tab.replace('_', ' ').toLowerCase()}.`}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: DisputeStatus }) {
  const map: Record<DisputeStatus, { Icon: any; cls: string; label: string }> = {
    PENDING:      { Icon: Clock,        cls: 'bg-warning/15 text-warning',         label: 'Pending' },
    UNDER_REVIEW: { Icon: Clock,        cls: 'bg-accent/15 text-accent',           label: 'Under review' },
    ACCEPTED:     { Icon: CheckCircle2, cls: 'bg-success/15 text-success',         label: 'Accepted' },
    REJECTED:     { Icon: XCircle,      cls: 'bg-destructive/15 text-destructive', label: 'Rejected' },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      <m.Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function ReviewDrawer({
  dispute,
  onClose,
  onUpdated,
}: {
  dispute: ViolationDispute;
  onClose: () => void;
  onUpdated: (d: ViolationDispute) => void;
}) {
  const [notes, setNotes] = useState(dispute.operatorNotes ?? '');
  const [busy, setBusy] = useState<'' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED'>('');
  const [err, setErr] = useState<string | null>(null);

  const act = async (status: 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED') => {
    setBusy(status);
    setErr(null);
    try {
      const updated = await api.reviewDispute(dispute.id, { status, notes });
      onUpdated(updated);
    } catch (e: any) {
      setErr(e?.message ?? 'Action failed');
    } finally {
      setBusy('');
    }
  };

  const isFinal = dispute.status === 'ACCEPTED' || dispute.status === 'REJECTED';
  const v = dispute.violation;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Review dispute #{dispute.id}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Raised on {new Date(dispute.createdAt).toLocaleString()} by {dispute.phone}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3"><StatusPill status={dispute.status} /></div>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Citizen says</div>
          <div className="text-sm font-semibold">{REASON_LABEL[dispute.reason]}</div>
          {dispute.description && (
            <p className="whitespace-pre-line text-sm">{dispute.description}</p>
          )}
        </section>

        {v && (
          <section className="mt-4 space-y-3 rounded-xl border bg-card p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Linked violation</div>
            <Row label="Challan #">{v.fineReference ?? String(v.id)}</Row>
            <Row label="Plate">
              <span className="font-mono tracking-wider">{v.plateNumber ?? '—'}</span>
            </Row>
            <Row label="Type">{v.violationType}</Row>
            <Row label="Status">{v.status}</Row>
            <Row label="Camera">{v.deviceId}</Row>
            <Row label="At">{new Date(v.timestamp).toLocaleString()}</Row>
            <Row label="Fine">
              {v.fineAmount != null ? `₹${v.fineAmount}` : '—'}
            </Row>
            {(v.fullSnapshotUrl || v.plateImageUrl) && (
              <a
                href={v.fullSnapshotUrl ?? v.plateImageUrl ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border"
              >
                <img
                  src={v.fullSnapshotUrl ?? v.plateImageUrl ?? ''}
                  alt="Evidence"
                  className="aspect-video w-full bg-black/5 object-contain"
                />
              </a>
            )}
          </section>
        )}

        <section className="mt-4 space-y-2 rounded-xl border bg-card p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Operator notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={4000}
              disabled={isFinal}
              placeholder="Optional — what you found, why you accepted/rejected"
              className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
            />
          </label>
        </section>

        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

        {!isFinal && (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {dispute.status === 'PENDING' && (
              <button
                onClick={() => act('UNDER_REVIEW')}
                disabled={!!busy}
                className="rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                {busy === 'UNDER_REVIEW' ? 'Marking…' : 'Mark under review'}
              </button>
            )}
            <button
              onClick={() => act('REJECTED')}
              disabled={!!busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              {busy === 'REJECTED' ? 'Rejecting…' : 'Reject'}
            </button>
            <button
              onClick={() => act('ACCEPTED')}
              disabled={!!busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {busy === 'ACCEPTED' ? 'Accepting…' : 'Accept & void challan'}
            </button>
          </div>
        )}

        {isFinal && dispute.reviewedAt && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>
              This dispute is final ({dispute.status.toLowerCase()}) — reviewed on{' '}
              {new Date(dispute.reviewedAt).toLocaleString()}.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex border-b py-1.5 last:border-b-0">
      <span className="w-[35%] text-xs text-muted-foreground">{label}</span>
      <span className="flex-1 text-xs">{children}</span>
    </div>
  );
}
