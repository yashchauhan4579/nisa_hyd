import { useState, useEffect, useCallback } from 'react';
import { apiClient, sendWhatsAppNotification, type TrafficViolation } from '@irisdrone/lib/api';
import { CheckCircle2, XCircle, Search, Eye, MapPin, Clock, Camera, Plus, Gauge, ScanLine, Hash, Activity, ShieldAlert, Calendar, FileText } from 'lucide-react';
import { Badge } from '@irisdrone/components/ui/badge';
import { HudBadge } from '@irisdrone/components/ui/hud-badge';
import { Button } from '@irisdrone/components/ui/button';
import { Card } from '@irisdrone/components/ui/card';
import { Input } from '@irisdrone/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@irisdrone/components/ui/tabs';
import { cn } from '@irisdrone/lib/utils';
import { playSound } from '@irisdrone/hooks/useSound';
import { formatDateTime, formatTimeAgo, getViolationTypeColor, getViolationTypeLabel } from './widgets/utils';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@irisdrone/components/ui/empty';
import { SmoothImg } from '@irisdrone/components/ui/smooth-img';

export function ViolationReviewCenter() {
  const [violations, setViolations] = useState<TrafficViolation[]>([]);
  const [selectedViolation, setSelectedViolation] = useState<TrafficViolation | null>(null);
  const [_loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);

  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient.getViolations({
        status: filter === 'all' ? undefined : filter,
        limit: 100,
        plateNumber: searchQuery || undefined,
      });
      setViolations(result.violations);
      setTotal(result.total);
      setSelectedViolation((prev) => {
        if (prev && result.violations.find((v) => v.id === prev.id)) return prev;
        return result.violations.length > 0 ? result.violations[0] : null;
      });
    } catch (err) {
      console.error('Failed to fetch violations:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery]);

  useEffect(() => {
    fetchViolations();
    const interval = setInterval(fetchViolations, 30000);
    return () => clearInterval(interval);
  }, [fetchViolations]);

  const handleApprove = async (id: string) => {
    try {
      const approved = await apiClient.approveViolation(id);
      playSound('success');
      
      fetchViolations();
      if (selectedViolation?.id === id) {
        setSelectedViolation({ ...selectedViolation, status: 'APPROVED' });
      }

      apiClient.fetchRCToMobile(approved.plateNumber || '')
        .catch(() => null)
        .then((ownerPhone) => {
          sendWhatsAppNotification(approved, ownerPhone ?? undefined).catch(() => {});
        });
    } catch (err) {
      console.error('Failed to approve violation:', err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiClient.rejectViolation(id, { rejectionReason: 'Rejected by reviewer' });
      playSound('error');
      fetchViolations();
      if (selectedViolation?.id === id) {
        setSelectedViolation({ ...selectedViolation, status: 'REJECTED' });
      }
    } catch (err) {
      console.error('Failed to reject violation:', err);
    }
  };

  const handleBulkApprove = async () => {
    try {
      const results = await Promise.all(Array.from(selectedIds).map((id) => apiClient.approveViolation(id)));
      playSound('success');
      
      setSelectedIds(new Set());
      fetchViolations();

      results.forEach((v) => {
        apiClient.fetchRCToMobile(v.plateNumber || '')
          .catch(() => null)
          .then((ownerPhone) => {
            sendWhatsAppNotification(v, ownerPhone ?? undefined).catch(() => {});
          });
      });
    } catch (err) {
      console.error('Failed to bulk approve:', err);
    }
  };

  const handleBulkReject = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map((id) => apiClient.rejectViolation(id, { rejectionReason: 'Bulk rejected by reviewer' })));
      playSound('error');
      setSelectedIds(new Set());
      fetchViolations();
    } catch (err) {
      console.error('Failed to bulk reject:', err);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const filteredViolations = violations.filter((v) => {
    if (searchQuery) {
      return (
        v.plateNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="h-full w-full flex flex-col lg:flex-row gap-4 p-4 relative">
        {/* Left Panel - Violation Queue */}
        <div className="w-full lg:w-96 flex flex-col gap-4 relative z-10 h-full">
          <Card className="border border-white/5 bg-zinc-900/30 rounded-xl p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-xl font-bold text-zinc-100">Violation Queue</h2>
            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {total}
            </Badge>
          </div>

          {/* Search */}
          <div className="relative mb-4 flex-shrink-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search plate or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          <div className="flex-shrink-0 mb-4">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="PENDING" className="text-xs">
                Pending
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="APPROVED" className="text-xs">
                Approved
              </TabsTrigger>
              <TabsTrigger value="REJECTED" className="text-xs">
                Rejected
              </TabsTrigger>
            </TabsList>
          </Tabs>
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex gap-2 mb-4 flex-shrink-0">
              <Button
                size="sm"
                onClick={handleBulkApprove}
                className="flex-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-xs"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Approve ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                onClick={handleBulkReject}
                className="flex-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 text-xs"
              >
                <XCircle className="w-3 h-3 mr-1" />
                Reject ({selectedIds.size})
              </Button>
            </div>
          )}

          {/* Violations List */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 p-0.5 -m-0.5">
            {filteredViolations.map((violation) => (
              <Card
                key={violation.id}
                className={cn(
                  "border border-white/5 bg-zinc-900/50 hover:bg-zinc-800/50 rounded-xl p-3 cursor-pointer transition-all",
                  selectedViolation?.id === violation.id && "ring-2 ring-amber-500 border-amber-500/30",
                  selectedIds.has(violation.id) && "bg-zinc-800/50"
                )}
                onClick={() => setSelectedViolation(violation)}
              >
                <div className="flex items-start gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(violation.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelection(violation.id);
                    }}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-black/20 accent-amber-500 cursor-pointer"
                  />
                  <Badge className={cn("text-[10px] px-1.5 py-0.5", getViolationTypeColor(violation.violationType))}>
                    {getViolationTypeLabel(violation.violationType)}
                  </Badge>
                  <HudBadge
                    variant={
                      violation.status === 'PENDING' ? 'warning' :
                      violation.status === 'APPROVED' ? 'success' : 'danger'
                    }
                    size="sm"
                  >
                    {violation.status}
                  </HudBadge>
                </div>
                {violation.plateNumber && (
                  <div className="text-sm font-bold text-zinc-100 font-mono mb-1">
                    {violation.plateNumber}
                  </div>
                )}
                <div className="text-xs text-zinc-400 mb-1">
                  {violation.device?.name || violation.deviceId}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {formatTimeAgo(violation.timestamp)}
                </div>
              </Card>
            ))}
            {filteredViolations.length === 0 && (
              <Empty>
                <EmptyIcon><Eye /></EmptyIcon>
                <EmptyTitle>No violations found</EmptyTitle>
                <EmptyDescription>No violations match the current filters.</EmptyDescription>
              </Empty>
            )}
          </div>
        </Card>
      </div>

        {/* Right Panel - Detail View */}
        <div className="flex-1 relative z-10">
          {selectedViolation ? (
            <ViolationDetailView
              violation={selectedViolation}
              onApprove={() => handleApprove(selectedViolation.id)}
              onReject={() => handleReject(selectedViolation.id)}
              onTypeChange={async (newType) => {
                try {
                  const updated = await apiClient.updateViolationType(selectedViolation.id, newType);
                  setSelectedViolation(updated);
                  setViolations((vs) => vs.map((v) => (v.id === updated.id ? updated : v)));
                } catch (err) {
                  console.error('Failed to update violation type:', err);
                }
              }}
              onAddToWatchlist={async () => {
                if (selectedViolation.plateNumber) {
                  try {
                    await apiClient.createWatchlistByPlate({
                      plateNumber: selectedViolation.plateNumber,
                      reason: 'Traffic Violation',
                      addedBy: 'System',
                      alertOnDetection: true,
                      alertOnViolation: true,
                    });
                    alert('Added to watchlist');
                  } catch (err) {
                    console.error('Failed to add to watchlist:', err);
                  }
                }
              }}
            />
          ) : (
            <Card className="border border-white/5 bg-zinc-900/30 rounded-xl h-full">
              <Empty>
                <EmptyIcon><Eye /></EmptyIcon>
                <EmptyTitle>No violation selected</EmptyTitle>
                <EmptyDescription>Select a violation from the queue to review evidence and take action.</EmptyDescription>
              </Empty>
            </Card>
          )}
        </div>
      </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  variant = 'default',
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  unit?: string;
  variant?: 'default' | 'accent' | 'warning' | 'danger' | 'success';
}) {
  const colors = {
    default: { fg: 'var(--tact-cyan-bright, #66F7FF)', glow: 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.3)' },
    accent: { fg: 'var(--tact-cyan-bright, #66F7FF)', glow: 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.4)' },
    warning: { fg: '#FCD34D', glow: 'rgba(252, 211, 77, 0.3)' },
    danger: { fg: '#FCA5A5', glow: 'rgba(255, 42, 42, 0.3)' },
    success: { fg: '#6EE7B7', glow: 'rgba(16, 185, 129, 0.3)' },
  }[variant];

  return (
    <div className="tact-stat tact-brackets-4">
      <span className="tact-corner tact-corner-tl" />
      <span className="tact-corner tact-corner-tr" />
      <span className="tact-corner tact-corner-bl" />
      <span className="tact-corner tact-corner-br" />
      <div className="tact-stat-label">
        <Icon className="w-3 h-3" strokeWidth={1.75} style={{ color: colors.fg }} />
        {label}
      </div>
      <div className="tact-stat-value" style={{ color: colors.fg, textShadow: `0 0 12px ${colors.glow}` }}>
        {value}
        {unit && <span className="tact-stat-meta ml-1.5" style={{ fontSize: 12 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ViolationDetailView({
  violation,
  onApprove,
  onReject,
  onTypeChange,
  onAddToWatchlist,
}: {
  violation: TrafficViolation;
  onApprove: () => void;
  onReject: () => void;
  onTypeChange: (newType: 'RIDER_HELMET' | 'PILLION_HELMET') => void | Promise<void>;
  onAddToWatchlist: () => void;
}) {
  const [imgIndex, setImgIndex] = useState(0);
  const evidenceImages = [
    violation.fullSnapshotUrl,
    violation.plateImageUrl,
  ].filter(Boolean) as string[];
  const activeImage = evidenceImages[imgIndex] || evidenceImages[0];

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* ─── HEADER ─────────────────────── */}
      <div className="px-5 py-4 border-b border-[rgba(0,95,115,0.25)] flex-shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {/* Violation type + status row */}
            <div className="flex items-center gap-2 mb-2">
              <span className="tact-label-sm" style={{ fontSize: 9 }}>VERIFICATION REQUIRED</span>
              <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(0, 240, 255, 0.4) 0%, transparent 100%)' }} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className={cn("text-[10px]", getViolationTypeColor(violation.violationType))}>
                {getViolationTypeLabel(violation.violationType)}
              </Badge>
              {(violation.violationType === 'RIDER_HELMET' || violation.violationType === 'PILLION_HELMET') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onTypeChange(
                    violation.violationType === 'RIDER_HELMET' ? 'PILLION_HELMET' : 'RIDER_HELMET',
                  )}
                  title="Reclassify rider/pillion helmet"
                >
                  Switch to {violation.violationType === 'RIDER_HELMET' ? 'Pillion' : 'Rider'}
                </Button>
              )}
              <HudBadge
                variant={
                  violation.status === 'PENDING' ? 'warning' :
                  violation.status === 'APPROVED' ? 'success' : 'danger'
                }
              >
                {violation.status}
              </HudBadge>
              {violation.plateNumber && (
                <div
                  className="tact-mono tact-brackets-4 relative"
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--tact-cyan-bright, #66F7FF)',
                    letterSpacing: '0.08em',
                    padding: '6px 14px',
                    background: 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.06)',
                    border: '1px solid rgba(var(--tact-accent-rgb, 0, 240, 255), 0.4)',
                    textShadow: '0 0 12px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)',
                  }}
                >
                  <span className="tact-corner tact-corner-tl" />
                  <span className="tact-corner tact-corner-tr" />
                  <span className="tact-corner tact-corner-bl" />
                  <span className="tact-corner tact-corner-br" />
                  {violation.plateNumber}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {violation.status === 'PENDING' && (
              <>
                <button
                  onClick={onReject}
                  className="tact-btn"
                  style={{
                    background: 'rgba(255, 42, 42, 0.08)',
                    borderColor: 'rgba(255, 42, 42, 0.4)',
                    color: '#FCA5A5',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 42, 42, 0.16)';
                    e.currentTarget.style.boxShadow = '0 0 16px -4px rgba(255, 42, 42, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 42, 42, 0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
                <button
                  onClick={onApprove}
                  className="tact-btn"
                  style={{
                    background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.08) 100%)',
                    borderColor: 'rgba(16, 185, 129, 0.6)',
                    color: '#6EE7B7',
                    boxShadow: '0 0 16px -4px rgba(16, 185, 129, 0.4)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.14) 100%)';
                    e.currentTarget.style.boxShadow = '0 0 24px -2px rgba(16, 185, 129, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.08) 100%)';
                    e.currentTarget.style.boxShadow = '0 0 16px -4px rgba(16, 185, 129, 0.4)';
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve
                </button>
              </>
            )}
            <button onClick={onAddToWatchlist} className="tact-btn">
              <Plus className="w-3.5 h-3.5" />
              Watchlist
            </button>
          </div>
        </div>
      </div>

      {/* ─── BODY ─────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT — Evidence images */}
          <div className="lg:col-span-7 flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <Camera className="w-3.5 h-3.5" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
              <span className="tact-label" style={{ fontSize: 10 }}>Evidence</span>
              <span className="flex-1 h-px" style={{ background: 'rgba(0, 95, 115, 0.4)' }} />
              <span className="tact-mono" style={{ fontSize: 9, color: '#7d9fa6' }}>
                {evidenceImages.length} {evidenceImages.length === 1 ? 'IMAGE' : 'IMAGES'}
              </span>
            </div>

            {/* Hero image with corner brackets */}
            <div
              className="tact-brackets-4 relative"
              style={{
                aspectRatio: '16/10',
                background: '#020408',
                border: '1px solid rgba(0, 95, 115, 0.4)',
                overflow: 'hidden',
              }}
            >
              <span className="tact-corner tact-corner-tl" />
              <span className="tact-corner tact-corner-tr" />
              <span className="tact-corner tact-corner-bl" />
              <span className="tact-corner tact-corner-br" />
              {activeImage ? (
                <SmoothImg
                  src={activeImage}
                  alt={`Violation evidence ${imgIndex + 1}`}
                  fallbackIcon={<Camera />}
                  className="object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="tact-empty">
                    <div className="tact-empty-icon">
                      <Camera />
                    </div>
                    <div className="tact-empty-title">No evidence available</div>
                  </div>
                </div>
              )}

              {/* Top-left HUD overlay */}
              <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1" style={{ background: 'rgba(2, 8, 14, 0.75)', border: '1px solid rgba(var(--tact-accent-rgb, 0, 240, 255), 0.4)' }}>
                <span className="tact-dot tact-dot--cyan" style={{ width: 5, height: 5 }} />
                <span className="tact-mono" style={{ fontSize: 9, color: 'var(--tact-cyan-bright, #66F7FF)', letterSpacing: '0.12em' }}>
                  EVIDENCE · {String(imgIndex + 1).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Thumbnail strip */}
            {evidenceImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {evidenceImages.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIndex(i)}
                    className="tact-brackets-4 relative flex-shrink-0"
                    style={{
                      width: 72,
                      height: 54,
                      border: i === imgIndex
                        ? '1px solid rgba(var(--tact-accent-rgb, 0, 240, 255), 0.6)'
                        : '1px solid rgba(0, 95, 115, 0.3)',
                      background: '#020408',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      boxShadow: i === imgIndex ? '0 0 12px -2px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <SmoothImg src={url} alt={`Thumb ${i+1}`} fallbackIcon={<Camera />} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — Metadata stat tiles */}
          <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <ScanLine className="w-3.5 h-3.5" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
              <span className="tact-label" style={{ fontSize: 10 }}>Detection Metadata</span>
              <span className="flex-1 h-px" style={{ background: 'rgba(0, 95, 115, 0.4)' }} />
            </div>

            {/* Confidence + speed (priority stats) */}
            <div className="grid grid-cols-2 gap-3">
              {violation.confidence !== undefined && violation.confidence !== null && (
                <StatTile
                  icon={Activity}
                  label="Confidence"
                  value={(violation.confidence * 100).toFixed(1)}
                  unit="%"
                  variant={violation.confidence > 0.85 ? 'success' : violation.confidence > 0.6 ? 'warning' : 'danger'}
                />
              )}
              {violation.detectedSpeed !== undefined && violation.detectedSpeed !== null ? (
                <StatTile
                  icon={Gauge}
                  label="Detected Speed"
                  value={violation.detectedSpeed.toFixed(0)}
                  unit="km/h"
                  variant={violation.speedOverLimit ? 'danger' : 'default'}
                />
              ) : (
                violation.plateConfidence !== undefined && violation.plateConfidence !== null && (
                  <StatTile
                    icon={Hash}
                    label="Plate Conf."
                    value={(violation.plateConfidence * 100).toFixed(1)}
                    unit="%"
                    variant="default"
                  />
                )
              )}
            </div>

            {/* Time + camera */}
            <div className="space-y-3">
              <div
                className="flex items-start gap-3 px-3 py-2.5"
                style={{
                  background: 'rgba(0, 240, 255, 0.03)',
                  border: '1px solid rgba(0, 95, 115, 0.3)',
                }}
              >
                <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#7d9fa6' }} />
                <div className="flex-1 min-w-0">
                  <div className="tact-label-sm mb-1" style={{ fontSize: 9 }}>Timestamp</div>
                  <div className="tact-mono" style={{ fontSize: 11, color: '#DCEEF1' }}>
                    {formatDateTime(violation.timestamp)}
                  </div>
                  <div className="tact-mono mt-0.5" style={{ fontSize: 9, color: '#7d9fa6' }}>
                    {formatTimeAgo(violation.timestamp)} ago
                  </div>
                </div>
              </div>

              {violation.device && (
                <div
                  className="flex items-start gap-3 px-3 py-2.5"
                  style={{
                    background: 'rgba(0, 240, 255, 0.03)',
                    border: '1px solid rgba(0, 95, 115, 0.3)',
                  }}
                >
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#7d9fa6' }} />
                  <div className="flex-1 min-w-0">
                    <div className="tact-label-sm mb-1" style={{ fontSize: 9 }}>Camera Location</div>
                    <div className="tact-mono" style={{ fontSize: 11, color: '#DCEEF1', wordBreak: 'break-word' }}>
                      {violation.device.name || violation.deviceId}
                    </div>
                    {(violation.device as any).location && (
                      <div className="tact-mono mt-0.5" style={{ fontSize: 9, color: '#7d9fa6' }}>
                        {(violation.device as any).location}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Speed limits if applicable */}
            {(violation.speedLimit2W || violation.speedLimit4W || violation.speedOverLimit) && (
              <>
                <div className="flex items-center gap-2 mt-2">
                  <ShieldAlert className="w-3.5 h-3.5" style={{ color: '#FCD34D' }} />
                  <span className="tact-label" style={{ fontSize: 10, color: '#FCD34D' }}>Speed Compliance</span>
                  <span className="flex-1 h-px" style={{ background: 'rgba(252, 211, 77, 0.3)' }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {violation.speedLimit2W && (
                    <StatTile icon={Gauge} label="Limit 2W" value={violation.speedLimit2W} unit="km/h" />
                  )}
                  {violation.speedLimit4W && (
                    <StatTile icon={Gauge} label="Limit 4W" value={violation.speedLimit4W} unit="km/h" />
                  )}
                  {violation.speedOverLimit && (
                    <StatTile icon={Gauge} label="Over By" value={`+${violation.speedOverLimit.toFixed(0)}`} unit="km/h" variant="danger" />
                  )}
                </div>
              </>
            )}
          </div>

          {/* BOTTOM — Audit/context strip — fills the remaining vertical space */}
          <div className="lg:col-span-12 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-3.5 h-3.5" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
              <span className="tact-label" style={{ fontSize: 10 }}>Audit Trail</span>
              <span className="flex-1 h-px" style={{ background: 'rgba(0, 95, 115, 0.4)' }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div
                className="px-3 py-2.5"
                style={{ background: 'rgba(0, 240, 255, 0.03)', border: '1px solid rgba(0, 95, 115, 0.3)' }}
              >
                <div className="tact-label-sm mb-1.5" style={{ fontSize: 9 }}>Detection ID</div>
                <div className="tact-mono" style={{ fontSize: 10, color: '#DCEEF1', wordBreak: 'break-all' }}>
                  {String(violation.id ?? '').slice(0, 16)}…
                </div>
              </div>
              <div
                className="px-3 py-2.5"
                style={{ background: 'rgba(0, 240, 255, 0.03)', border: '1px solid rgba(0, 95, 115, 0.3)' }}
              >
                <div className="tact-label-sm mb-1.5" style={{ fontSize: 9 }}>Detection Method</div>
                <div className="tact-mono" style={{ fontSize: 11, color: '#DCEEF1' }}>
                  {(violation as any).detectionMethod || 'AI-AUTO'}
                </div>
              </div>
              <div
                className="px-3 py-2.5"
                style={{ background: 'rgba(0, 240, 255, 0.03)', border: '1px solid rgba(0, 95, 115, 0.3)' }}
              >
                <div className="tact-label-sm mb-1.5" style={{ fontSize: 9 }}>Vehicle Type</div>
                <div className="tact-mono" style={{ fontSize: 11, color: '#DCEEF1' }}>
                  {(violation as any).vehicleType || 'UNKNOWN'}
                </div>
              </div>
              <div
                className="px-3 py-2.5"
                style={{ background: 'rgba(0, 240, 255, 0.03)', border: '1px solid rgba(0, 95, 115, 0.3)' }}
              >
                <div className="tact-label-sm mb-1.5" style={{ fontSize: 9 }}>Worker</div>
                <div className="tact-mono" style={{ fontSize: 11, color: '#DCEEF1' }}>
                  {String((violation as any).workerId ?? '').slice(0, 12) || 'EDGE-AUTO'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky bottom keyboard hint */}
        {violation.status === 'PENDING' && (
          <div
            className="px-5 py-3 border-t border-[rgba(0,95,115,0.25)] flex items-center justify-between flex-wrap gap-3"
            style={{ background: 'rgba(0, 240, 255, 0.025)' }}
          >
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <kbd className="tact-kbd tact-kbd--sm">A</kbd>
                <span className="tact-mono" style={{ fontSize: 10, color: '#7d9fa6' }}>APPROVE</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="tact-kbd tact-kbd--sm">R</kbd>
                <span className="tact-mono" style={{ fontSize: 10, color: '#7d9fa6' }}>REJECT</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="tact-kbd tact-kbd--sm">J</kbd>
                <kbd className="tact-kbd tact-kbd--sm">K</kbd>
                <span className="tact-mono" style={{ fontSize: 10, color: '#7d9fa6' }}>NEXT / PREV</span>
              </div>
            </div>
            <span className="tact-mono" style={{ fontSize: 9, color: '#4a6b73', letterSpacing: '0.18em' }}>
              KEYBOARD SHORTCUTS
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
