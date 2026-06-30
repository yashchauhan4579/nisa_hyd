import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiClient, sendWhatsAppNotification, type TrafficViolation, type ViolationStatus, type ViolationType } from '@irisdrone/lib/api';
import { AlertTriangle, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Select } from '@irisdrone/components/ui/select';
import { playSound } from '@irisdrone/hooks/useSound';
import { Input } from '@irisdrone/components/ui/input';
import { SmoothImg } from '@/components/ui/smooth-img';
import { cn } from '@irisdrone/lib/utils';
import { ViolationDetail } from './ViolationDetail';
import { ImageModal } from '@irisdrone/components/ui/image-modal';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

// Full-width violations console: one wide list (ALL + per-status tabs, working
// server-side filters) and a verification panel that slides in from the right
// when a row is opened — no permanently-reserved detail pane.

const STATUS_TABS = ['ALL', 'PENDING', 'APPROVED', 'FINED', 'PAID', 'VOIDED'] as const;

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#FCD34D',
  APPROVED: '#6EE7B7',
  REJECTED: '#FCA5A5',
  FINED: 'hsl(var(--primary))',
  PAID: '#34D399',
  VOIDED: 'hsl(var(--muted-foreground))',
};

export function ViolationsDashboard() {
  const { isEnabled } = useFeatureFlags();
  const [violations, setViolations] = useState<TrafficViolation[]>([]);
  const [selectedViolation, setSelectedViolation] = useState<TrafficViolation | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [total, setTotal] = useState(0);
  const [plateInput, setPlateInput] = useState('');
  const [filters, setFilters] = useState({
    violationType: '' as ViolationType | '',
    deviceId: '',
    plateNumber: '',
    date: '',
  });
  const [modalImage, setModalImage] = useState<{ url: string; metadata: any } | null>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const listRef = useRef<HTMLDivElement>(null);
  const drawerOpenRef = useRef(false);
  drawerOpenRef.current = drawerOpen;

  // Debounce the plate input → one request per pause, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.plateNumber === plateInput ? f : { ...f, plateNumber: plateInput }));
    }, 300);
    return () => clearTimeout(t);
  }, [plateInput]);

  const openViolation = useCallback((v: TrafficViolation) => {
    setSelectedViolation(v);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  // J/K walk the list (drawer follows if open); Enter opens; a/r act; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (violations.length === 0) return;

      const currentIdx = selectedViolation
        ? violations.findIndex((v) => v.id === selectedViolation.id)
        : -1;

      const moveTo = (idx: number) => {
        setSelectedViolation(violations[idx]);
        listRef.current?.querySelector(`[data-violation-id="${violations[idx].id}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveTo(currentIdx < violations.length - 1 ? currentIdx + 1 : 0);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveTo(currentIdx > 0 ? currentIdx - 1 : violations.length - 1);
      } else if (e.key === 'Enter' && currentIdx >= 0) {
        e.preventDefault();
        setDrawerOpen(true);
      } else if (e.key === 'a' && currentIdx >= 0 && violations[currentIdx].status === 'PENDING') {
        e.preventDefault();
        handleApprove(violations[currentIdx].id);
      } else if (e.key === 'r' && currentIdx >= 0 && violations[currentIdx].status === 'PENDING') {
        e.preventDefault();
        handleReject(violations[currentIdx].id, 'Rejected via keyboard shortcut');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [violations, selectedViolation]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFetchingRef = useRef(false);

  const fetchViolations = useCallback(async (isInitialLoad = false) => {
    if (isFetchingRef.current && !isInitialLoad) return;

    try {
      isFetchingRef.current = true;
      if (isInitialLoad) setLoading(true);
      setError(null);
      const offset = (page - 1) * itemsPerPage;
      const result = await apiClient.getViolations({
        // ALL tab = no status filter
        status: activeTab !== 'ALL' ? (activeTab as ViolationStatus) : undefined,
        violationType: filters.violationType || undefined,
        deviceId: filters.deviceId || undefined,
        plateNumber: filters.plateNumber || undefined,
        startTime: filters.date ? new Date(filters.date).toISOString() : undefined,
        limit: itemsPerPage,
        offset: offset,
      });
      // Drop OCR-junk plates (partial reads < 6 chars); NULL = "no plate
      // captured", which is legitimate and allowed through.
      const filtered = result.violations.filter((v) => {
        // Platform feature flags: hide violation types disabled in Settings → Platform.
        if (v.violationType && isEnabled(`itms.violations.${v.violationType}`) === false) return false;
        if (v.plateNumber == null) return true;
        return v.plateNumber.replace(/\s/g, '').length >= 6;
      });
      setViolations(filtered);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch violations:', err);
      setError('Failed to load violations');
    } finally {
      isFetchingRef.current = false;
      if (isInitialLoad) setLoading(false);
    }
  }, [activeTab, filters, page, itemsPerPage, isEnabled]);

  useEffect(() => {
    // Reset to page 1 when filters change
    setPage(1);
  }, [activeTab, filters.violationType, filters.deviceId, filters.plateNumber, filters.date]);

  useEffect(() => {
    fetchViolations(true);
    // Poll for fresh rows — paused while the verification drawer is open so
    // the row under review isn't clobbered mid-verification.
    const intervalId = setInterval(() => {
      if (!drawerOpenRef.current) fetchViolations(false);
    }, 3000);
    return () => clearInterval(intervalId);
  }, [fetchViolations]);

  const afterAction = (id: string) => {
    fetchViolations();
    if (selectedViolation?.id === id) {
      setSelectedViolation(null);
      setDrawerOpen(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const approved = await apiClient.approveViolation(id);
      playSound('success');
      afterAction(id);
      apiClient.fetchRCToMobile(approved.plateNumber || '')
        .catch(() => null)
        .then((ownerPhone) => {
          sendWhatsAppNotification(approved, ownerPhone ?? undefined).catch(() => {});
        });
    } catch (err) {
      console.error('Failed to approve violation:', err);
      playSound('error');
      alert('Failed to approve violation');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteViolation(id);
      afterAction(id);
    } catch (err) {
      console.error('Failed to delete violation:', err);
      alert('Failed to delete violation');
    }
  };

  const handlePurge = async (id: string) => {
    try {
      await apiClient.purgeViolation(id);
      afterAction(id);
    } catch (err: unknown) {
      console.error('Failed to purge violation:', err);
      const msg = err instanceof Error ? err.message : 'Failed to permanently delete violation';
      alert(msg);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    try {
      await apiClient.rejectViolation(id, { rejectionReason: reason });
      playSound('success');
      afterAction(id);
    } catch (err) {
      console.error('Failed to reject violation:', err);
      playSound('error');
      alert('Failed to reject violation');
    }
  };

  const handleFine = async (id: string) => {
    try {
      await apiClient.fineViolation(id);
      setActiveTab('FINED');
      afterAction(id);
    } catch (err) {
      console.error('Failed to mark violation as fined:', err);
      alert('Failed to mark violation as fined');
    }
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const totalPages = Math.ceil(total / itemsPerPage) || 1;

  if (loading && violations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full relative text-foreground">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-2" />
          <p className="text-muted-foreground">Loading violations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative text-foreground overflow-hidden p-4">
      <div className="h-full flex flex-col rounded-xl border border-border bg-card overflow-hidden">
        {/* Header — title + tabs + filters in one bar */}
        <div className="shrink-0 border-b border-border px-4 pt-3 pb-0">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold leading-none">Violations</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{total.toLocaleString()} on this view</p>
              </div>
            </div>

            {/* filters — right side */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search plate…"
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value)}
                className="!h-8 !text-xs w-40"
              />
              <Input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                className="!h-8 !text-xs w-36"
              />
              <div className="w-40">
                <Select
                  value={filters.violationType || 'all'}
                  onValueChange={(v) => setFilters({ ...filters, violationType: (v === 'all' ? '' : v) as ViolationType | '' })}
                  options={[
                    { value: 'all', label: 'All Types' },
                    { value: 'RIDER_HELMET', label: 'Rider Helmet' },
                    { value: 'PILLION_HELMET', label: 'Pillion Helmet' },
                    { value: 'WRONG_SIDE', label: 'Wrong Side' },
                    { value: 'NO_SEATBELT', label: 'No Seatbelt' },
                    { value: 'UNCOVERED_LOAD', label: 'Uncovered Load' },
                    { value: 'TRIPLE_RIDING', label: 'Triple Riding' },
                    { value: 'MINOR_RIDER', label: 'Minor Rider' },
                    { value: 'MOBILE_USE', label: 'Mobile Use' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                  placeholder="Type"
                />
              </div>
            </div>
          </div>

          {/* status tabs */}
          <div className="flex gap-1 -mb-px">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'border-b-2 px-3.5 py-2 text-xs font-semibold tracking-wide transition-colors',
                  activeTab === tab
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Rows — fill the full width */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0" tabIndex={0}>
          {violations.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No violations match this view</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Try another status tab or clear the filters.</p>
              </div>
            </div>
          ) : (
            violations.map((violation, idx) => {
              const isSelected = selectedViolation?.id === violation.id;
              const sColor = STATUS_COLOR[violation.status] || 'hsl(var(--muted-foreground))';
              return (
                <button
                  key={violation.id}
                  data-violation-id={violation.id}
                  onClick={() => openViolation(violation)}
                  className={cn(
                    'w-full flex items-center gap-4 px-4 py-2.5 border-b border-border/60 text-left transition-colors group',
                    isSelected ? 'bg-amber-500/[0.07]' : 'hover:bg-accent/60',
                  )}
                >
                  <span className={cn('w-7 shrink-0 text-right text-[11px] tabular-nums', isSelected ? 'text-amber-500' : 'text-muted-foreground/50')}>
                    {String((page - 1) * itemsPerPage + idx + 1).padStart(2, '0')}
                  </span>

                  {/* evidence thumb */}
                  {violation.fullSnapshotUrl ? (
                    <div
                      className="h-14 w-[88px] shrink-0 overflow-hidden rounded-lg border border-border"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalImage({
                          url: violation.fullSnapshotUrl || '',
                          metadata: {
                            title: violation.device?.name || 'Violation',
                            plateNumber: violation.plateNumber,
                            timestamp: violation.timestamp,
                            violationType: violation.violationType,
                            device: violation.device,
                            status: violation.status,
                            detectedSpeed: violation.detectedSpeed,
                          },
                        });
                      }}
                    >
                      <SmoothImg src={violation.fullSnapshotUrl} alt="" containerClassName="h-full w-full" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                    </div>
                  ) : (
                    <div className="h-14 w-[88px] shrink-0 rounded-lg border border-border bg-muted" />
                  )}

                  {/* plate + device */}
                  <div className="min-w-0 flex-1">
                    <span className={cn('block truncate font-mono text-sm font-bold tracking-wide', isSelected ? 'text-amber-500' : 'text-foreground')}>
                      {violation.plateNumber || 'UNKNOWN'}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {violation.device?.name || violation.deviceId || '—'}
                    </span>
                  </div>

                  {/* type chip */}
                  <span className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-500">
                    {String(violation.violationType || '').replace(/_/g, ' ')}
                  </span>

                  {/* time */}
                  <span className="hidden md:block w-32 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatDateTime(violation.timestamp)}
                  </span>

                  {/* confidence */}
                  <span className="hidden lg:block w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {violation.confidence != null ? `${Math.round(violation.confidence * 100)}%` : '—'}
                  </span>

                  {/* status */}
                  <span className="w-24 shrink-0 text-right text-[11px] font-semibold tracking-wide" style={{ color: sColor }}>
                    ● {violation.status}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer — pagination */}
        <div className="shrink-0 flex items-center justify-between border-t border-border px-4 py-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <kbd className="tact-kbd tact-kbd--xs">J</kbd>
            <kbd className="tact-kbd tact-kbd--xs">K</kbd>
            <span className="tracking-wide">nav</span>
            <span className="text-muted-foreground/40">·</span>
            <kbd className="tact-kbd tact-kbd--xs">↵</kbd>
            <span className="tracking-wide">open</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {total.toLocaleString()} total · page {page}/{totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <Select
              value={String(itemsPerPage)}
              onValueChange={(v) => {
                setItemsPerPage(Number(v));
                setPage(1);
              }}
              options={[
                { value: '25', label: '25/pg' },
                { value: '50', label: '50/pg' },
                { value: '100', label: '100/pg' },
              ]}
              className="!w-[72px]"
            />
          </div>
        </div>
      </div>

      {/* Verification drawer — slides in from the right when a row is opened */}
      <AnimatePresence>
        {drawerOpen && selectedViolation && (
          <>
            <motion.div
              className="absolute inset-0 z-[70] bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
            />
            <motion.aside
              className="absolute right-0 top-0 z-[80] h-full w-full max-w-4xl overflow-y-auto border-l border-border bg-background shadow-2xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-bold tracking-wide">{selectedViolation.plateNumber || 'UNKNOWN'}</span>
                  <span className="text-[11px] font-semibold tracking-wide" style={{ color: STATUS_COLOR[selectedViolation.status] }}>
                    ● {selectedViolation.status}
                  </span>
                </div>
                <button
                  onClick={closeDrawer}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[calc(100%-49px)] p-3">
                <ViolationDetail
                  violation={selectedViolation}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onDelete={handleDelete}
                  onPurge={handlePurge}
                  onClose={closeDrawer}
                  onFine={handleFine}
                  onUpdate={(updated) => {
                    setSelectedViolation(updated);
                    setViolations((vs) => vs.map((v) => (v.id === updated.id ? updated : v)));
                  }}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Image Modal */}
      <ImageModal
        isOpen={!!modalImage}
        onClose={() => setModalImage(null)}
        imageUrl={modalImage?.url || ''}
        metadata={modalImage?.metadata || {}}
      />
    </div>
  );
}
