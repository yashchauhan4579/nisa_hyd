import { useState, useEffect } from 'react';
import { type TrafficViolation, type RCDetails } from '@irisdrone/lib/api';
import { CheckCircle2, XCircle, Edit2, Camera, Clock, MapPin, FileText, Loader2, Car, User, Shield, Phone, Trash2, IndianRupee } from 'lucide-react';
import { Badge } from '@irisdrone/components/ui/badge';
import { Button } from '@irisdrone/components/ui/button';
import { Card } from '@irisdrone/components/ui/card';
import { Input } from '@irisdrone/components/ui/input';
import { apiClient } from '@irisdrone/lib/api';
import { cn } from '@irisdrone/lib/utils';
import { playSound } from '@irisdrone/hooks/useSound';

interface ViolationDetailProps {
  violation: TrafficViolation;
  onApprove: (id: string) => Promise<void> | void;
  onReject: (id: string, reason: string) => void;
  onDelete: (id: string) => void;
  onPurge?: (id: string) => void;
  onClose: () => void;
  onFine?: (id: string) => Promise<void> | void;
  onUpdate?: (v: TrafficViolation) => void;   // bubble updated row to parent
}

export function ViolationDetail({ violation, onApprove, onReject, onDelete, onPurge, onClose: _onClose, onFine: _onFine, onUpdate }: ViolationDetailProps) {
  const [editingPlate, setEditingPlate] = useState(false);
  const [plateNumber, setPlateNumber] = useState(violation.plateNumber || '');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [rcDetails, setRcDetails] = useState<RCDetails | null>(null);
  const [ownerMobile, setOwnerMobile] = useState<string | null>(null);
  const [rcLoading, setRcLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatingChallan, setGeneratingChallan] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  // Close the language menu on outside click — small UX nicety that
  // matches the Chikkamangaluru deployment's challan dropdown.
  useEffect(() => {
    if (!showLangMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest('[data-lang-menu]')) return;
      setShowLangMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showLangMenu]);

  // Reset state and auto-fetch RC details when violation changes
  useEffect(() => {
    setRcDetails(null);
    setOwnerMobile(null);
    setPlateNumber(violation.plateNumber || '');
    setSelectedMediaIndex(0);
    // Always fetch RC details immediately when a violation is selected
    if (violation.plateNumber && violation.plateNumber !== 'UNKNOWN') {
      fetchRC(violation.plateNumber);
      apiClient.fetchRCToMobile(violation.plateNumber).then(setOwnerMobile).catch(() => { });
    }
  }, [violation.id]);

  const fetchRC = async (plate: string) => {
    if (!plate || plate === 'UNKNOWN') return;
    setRcLoading(true);
    try {
      const details = await apiClient.fetchRCDetails(plate);
      setRcDetails(details);
    } catch {
      // silently fail
    } finally {
      setRcLoading(false);
    }
  };

  const handleApproveWithRC = async () => {
    setApproving(true);
    try {
      // Keep RC lookup best-effort; approval must not block on external RC API.
      if (!rcDetails && violation.plateNumber) {
        fetchRC(violation.plateNumber).catch(() => {});
      }
      await onApprove(violation.id);
    } finally {
      setApproving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!window.confirm(`Mark fine ${violation.fineReference || ''} as paid?`)) return;
    try {
      const paid = await apiClient.markViolationPaid(violation.id, {
        paymentMethod: 'OFFLINE',
      });
      onUpdate?.(paid);
      playSound('success');
    } catch (err) {
      console.error('Failed to mark paid:', err);
      playSound('error');
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to mark fine as paid: ${msg}`);
    }
  };

  const handleUpdatePlate = async () => {
    try {
      // Bubble the updated row up so the dashboard list + the detail
      // pane both reflect the new plate immediately, without the
      // operator having to click away and back.
      const updated = await apiClient.updateViolationPlate(violation.id, plateNumber);
      onUpdate?.(updated);
      playSound('success');
      setEditingPlate(false);
    } catch (err) {
      console.error('Failed to update plate:', err);
      playSound('error');
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to update plate number: ${msg}`);
    }
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }
    onReject(violation.id, rejectionReason);
    setShowRejectDialog(false);
    setRejectionReason('');
  };

  const handleGenerateChallan = async (lang: 'en' | 'kn' = 'en') => {
    setGeneratingChallan(true);
    try {
      // Step 1 — flip the violation to FINED if it isn't already, passing
      // the chosen language along so the backend's WhatsApp + SMS
      // goroutines render and send in that same language. The PDF the
      // operator downloads must match what the citizen receives.
      if (violation.status === 'APPROVED') {
        // Route through the api client so the CSRF auto-retry on 403
        // fires (raw fetch bypasses it, which caused silent failures
        // whenever the backend rotated its CSRF cookie).
        const fined = await apiClient.fineViolation(violation.id, {
          reviewedBy: 'operator',
          reviewNote: 'Fined via UI',
          lang,
        });
        onUpdate?.(fined);
      }

      // Step 2 — pull the rendered PDF from the backend in the chosen
      // language so the operator's downloadable copy is byte-identical
      // to what the citizen receives on WhatsApp.
      const token = window.localStorage.getItem('iris_token') || '';
      const response = await fetch(`/api/violations/${violation.id}/challan.pdf?lang=${lang}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(`PDF fetch failed: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Browsers strip "/" from <a download>, so a folder-style filename
      // can never produce real folders on the operator's disk. Best we
      // can do is encode type + reference + date in a flat filename so
      // sorting and search stay easy in the Downloads folder.
      const refRaw = violation.fineReference?.trim() || `BGM-${String(violation.id)}`;
      const langSuffix = lang === 'kn' ? '_kn' : '';
      const dateSrc = violation.fineIssuedAt || violation.timestamp || new Date().toISOString();
      const dateTag = new Date(dateSrc).toISOString().slice(0, 10); // YYYY-MM-DD
      const vType = (violation.violationType || 'OTHER').toString().toUpperCase();
      link.download = `${vType}_${refRaw}_${dateTag}${langSuffix}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      playSound('success');
    } catch (err) {
      console.error('Failed to generate challan:', err);
      playSound('error');
      alert('Failed to generate challan PDF');
    } finally {
      setGeneratingChallan(false);
    }
  };

  const getViolationTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      SPEED: 'bg-red-500',
      HELMET: 'bg-orange-500',
      WRONG_SIDE: 'bg-yellow-500',
      RED_LIGHT: 'bg-amber-500',
      NO_SEATBELT: 'bg-pink-500',
      OVERLOADING: 'bg-amber-500',
      UNCOVERED_LOAD: 'bg-orange-600',
      ILLEGAL_PARKING: 'bg-zinc-500',
      OTHER: 'bg-amber-500',
    };
    return colors[type] || 'bg-zinc-500';
  };

  // Build media gallery: video first (if any), then main snapshot, then additional images
  const mediaItems: { type: 'video' | 'image'; url: string; label: string }[] = [];

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  if (violation.video) {
    mediaItems.push({ type: 'video', url: violation.video, label: 'Video' });
  }
  if (violation.fullSnapshotUrl) {
    mediaItems.push({ type: 'image', url: violation.fullSnapshotUrl, label: 'Snapshot' });
  }
  const additionalImages = Array.isArray(violation.metadata?.additionalImages)
    ? (violation.metadata.additionalImages as string[])
    : [];
  additionalImages.forEach((url, idx) => {
    if (typeof url === 'string' && url) {
      mediaItems.push({ type: 'image', url, label: `Image ${idx + 1}` });
    }
  });

  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const selectedMedia = mediaItems[selectedMediaIndex] || null;

  return (
    <Card key={violation.id} className="glass h-full flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-1">Verification Required</h2>
            <p className="text-xs text-zinc-400">
              Review the evidence below. Approving will move it to the Approved tab.
            </p>
          </div>
          <div className="flex gap-2">
            {violation.status === 'APPROVED' && (
              <div className="relative" data-lang-menu>
                <Button
                  variant="default"
                  onClick={() => setShowLangMenu((v) => !v)}
                  disabled={generatingChallan}
                  className="gap-2 bg-amber-600 hover:bg-amber-700"
                >
                  {generatingChallan ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {generatingChallan ? 'Generating...' : 'Generate Challan'}
                </Button>
                {showLangMenu && !generatingChallan && (
                  <div className="absolute right-0 z-30 mt-2 w-44 rounded-md border border-white/10 bg-zinc-950 shadow-xl py-1" data-lang-menu>
                    <button
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                      onClick={() => { setShowLangMenu(false); handleGenerateChallan('en'); }}
                    >
                      English
                    </button>
                    <button
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                      onClick={() => { setShowLangMenu(false); handleGenerateChallan('kn'); }}
                    >
                      ಕನ್ನಡ (Kannada)
                    </button>
                  </div>
                )}
              </div>
            )}
            {violation.status === 'APPROVED' && (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            )}
            {violation.status === 'FINED' && (
              <>
                <Button
                  onClick={handleMarkPaid}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                >
                  <IndianRupee className="w-4 h-4" />
                  Fine Paid
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </>
            )}
            {violation.status === 'VOIDED' && onPurge && (
              <Button
                variant="destructive"
                onClick={() => setShowPurgeDialog(true)}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Permanently
              </Button>
            )}
            {violation.status === 'PENDING' && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  className="gap-2 bg-red-600 hover:bg-red-700 border-red-600"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </Button>
                <Button
                  variant="default"
                  onClick={handleApproveWithRC}
                  disabled={approving}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {approving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {approving ? 'Fetching RC...' : 'Approve'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-12 gap-4">
          {/* Left Column - Media Gallery + RC Details */}
          <div className="col-span-9 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Evidence</h3>
                <Badge className={cn("text-xs", getViolationTypeColor(violation.violationType))}>
                  {violation.violationType}
                </Badge>
              </div>

              {mediaItems.length > 0 ? (
                <div className="flex gap-3 items-stretch" style={{ height: 'clamp(200px, 40vh, 500px)' }}>
                  {/* Thumbnails - fixed width column on the left */}
                  <div className="flex flex-col gap-2 overflow-y-auto w-20 flex-shrink-0">
                    {mediaItems.map((item, index) => (
                      <Button
                        key={`${item.type}-${item.url}-${index}`}
                        variant="ghost"
                        type="button"
                        onClick={() => setSelectedMediaIndex(index)}
                        className={cn(
                          'relative w-20 h-14 rounded-md overflow-hidden border transition-all p-0 flex-shrink-0',
                          selectedMediaIndex === index
                            ? 'border-amber-500 ring-2 ring-amber-500/60'
                            : 'border-white/10 hover:border-amber-400/70'
                        )}
                      >
                        {item.type === 'video' ? (
                          <div className="w-full h-full bg-black flex items-center justify-center text-xs text-white">
                            <span className="px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-mono">
                              Video
                            </span>
                          </div>
                        ) : (
                          <img
                            src={item.url}
                            alt={item.label}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </Button>
                    ))}
                  </div>

                  {/* Main Viewer - dynamically fills available space */}
                  <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black flex-1 flex items-center justify-center transition-all duration-300">
                    {selectedMedia ? (
                      selectedMedia.type === 'video' ? (
                        <video
                          src={selectedMedia.url}
                          controls
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <img
                          key={selectedMedia.url}
                          src={selectedMedia.url}
                          alt={selectedMedia.label}
                          className="w-full h-full object-contain animate-in fade-in duration-300"
                        />
                      )
                    ) : (
                      <div className="aspect-video bg-zinc-800 rounded-lg flex items-center justify-center w-full h-full">
                        <Camera className="w-12 h-12 text-zinc-400" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-800 rounded-lg flex items-center justify-center" style={{ height: 'clamp(150px, 30vh, 300px)' }}>
                  <Camera className="w-12 h-12 text-zinc-400" />
                </div>
              )}
            </div>

          </div>

          {/* Right Column - Details (1/4 width) */}
          <div className="col-span-3 space-y-3">
            {/* Violation Type */}
            <div>
              <h3 className="text-xs font-medium text-zinc-400 mb-1">Violation Type</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn("text-sm px-3 py-1", getViolationTypeColor(violation.violationType))}>
                  {violation.violationType.toLowerCase()}
                </Badge>
                {(violation.violationType === 'RIDER_HELMET' || violation.violationType === 'PILLION_HELMET') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={async () => {
                      const newType =
                        violation.violationType === 'RIDER_HELMET' ? 'PILLION_HELMET' : 'RIDER_HELMET';
                      try {
                        const updated = await apiClient.updateViolationType(violation.id, newType);
                        onUpdate?.(updated);
                      } catch (err) {
                        console.error('Failed to update violation type:', err);
                      }
                    }}
                  >
                    Switch to {violation.violationType === 'RIDER_HELMET' ? 'Pillion' : 'Rider'}
                  </Button>
                )}
              </div>
            </div>

            {/* License Plate */}
            <div>
              <h3 className="text-xs font-medium text-zinc-400 mb-1">License Plate</h3>
              {violation.plateImageUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black">
                  <img
                    src={violation.plateImageUrl}
                    alt="License plate"
                    className="w-full h-auto object-contain max-h-24"
                  />
                </div>
              ) : (
                <div className="h-16 bg-zinc-800 rounded-lg flex items-center justify-center">
                  <span className="text-zinc-400 text-xs">No plate image</span>
                </div>
              )}
            </div>

            {/* Plate Number */}
            <div>
              <h3 className="text-xs font-medium text-zinc-400 mb-1">Plate Number</h3>
              {editingPlate ? (
                <div className="flex gap-2">
                  <Input
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleUpdatePlate}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingPlate(false);
                    setPlateNumber(violation.plateNumber || '');
                  }}>Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-md font-mono font-semibold flex-1">
                    {violation.plateNumber || 'UNKNOWN'}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingPlate(true)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Confidence */}
            {violation.confidence && (
              <div>
                <h3 className="text-xs font-medium text-zinc-400 mb-1">Confidence</h3>
                <div className="text-2xl font-semibold">
                  {(violation.confidence * 100).toFixed(1)}%
                </div>
              </div>
            )}

            {/* Speed Details (for speed violations) */}
            {violation.violationType === 'SPEED' && violation.detectedSpeed && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-medium text-zinc-400 mb-1">Speed</h3>
                  <div className="text-2xl font-semibold text-red-500">
                    {violation.detectedSpeed.toFixed(1)} km/h
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-zinc-400 mb-1">Speed Violation</h3>
                  <div className="space-y-2">
                    <Badge className="bg-amber-500">Radar</Badge>
                    <div className="text-sm">
                      <div>Detected Speed: {violation.detectedSpeed.toFixed(1)} km/h</div>
                      <div className="text-zinc-400">
                        Limit: {violation.speedLimit2W?.toFixed(0) || 'N/A'} km/h (2W) / {violation.speedLimit4W?.toFixed(0) || 'N/A'} km/h (4W)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Time */}
            <div>
              <h3 className="text-xs font-medium text-zinc-400 mb-1">Time</h3>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                <span className="font-mono">
                  {formatDateTime(violation.timestamp)}
                </span>
              </div>
            </div>

            {/* Device Info */}
            {violation.device && (
              <div>
                <h3 className="text-xs font-medium text-zinc-400 mb-1">Camera</h3>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-zinc-400" />
                  <span>{violation.device.name || violation.device.id}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RC Details — Full-width fixed bottom bar */}
      {rcLoading && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5 bg-zinc-900/50 shrink-0">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span className="text-xs text-zinc-400">Fetching vehicle RC details...</span>
        </div>
      )}
      {rcDetails && !rcLoading && (
        <div className="border-t border-white/5 bg-zinc-900/40 px-4 py-3 shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-2">
            <Car className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-semibold text-amber-400">RC Details — {rcDetails.rc_number}</h3>
            {rcDetails.rc_status && (
              <Badge className="bg-green-500/10 text-green-400 border border-green-500/30 text-[10px]">
                {rcDetails.rc_status}
              </Badge>
            )}
            {rcDetails.financed && (
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
                FINANCED
              </Badge>
            )}
            {rcDetails.blacklist_status && (
              <Badge className="bg-red-500/10 text-red-400 border border-red-500/30 text-[10px]">
                <Shield className="w-3 h-3 mr-1" />
                {rcDetails.blacklist_status}
              </Badge>
            )}
            <span className="text-[10px] text-zinc-500 ml-auto font-mono">SP BELAGAVI</span>
          </div>
          <div className="grid grid-cols-6 gap-x-4 gap-y-1.5 text-[11px]">
            <div>
              <span className="text-zinc-500 text-[10px]">Owner</span>
              <div className="font-medium flex items-center gap-1">
                <User className="w-3 h-3 text-zinc-400 shrink-0" />
                <span className="truncate">{rcDetails.owner_name}</span>
              </div>
            </div>
            <div>
              <span className="text-zinc-500 text-[10px]">Phone</span>
              <div className="font-medium flex items-center gap-1">
                <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                <span className="truncate">{ownerMobile || rcDetails.mobile_no || rcDetails.owner_number || 'N/A'}</span>
              </div>
            </div>
            {rcDetails.address && (
              <div className="col-span-2">
                <span className="text-zinc-500 text-[10px]">Address</span>
                <div className="font-medium truncate">{rcDetails.address}</div>
              </div>
            )}
            {rcDetails.chassis_no && (
              <div>
                <span className="text-zinc-500 text-[10px]">Chassis</span>
                <div className="font-medium font-mono text-[10px] truncate">{rcDetails.chassis_no}</div>
              </div>
            )}
            {rcDetails.maker_model && (
              <div>
                <span className="text-zinc-500 text-[10px]">Vehicle</span>
                <div className="font-medium truncate">{rcDetails.maker_model}</div>
              </div>
            )}
            {rcDetails.color && (
              <div>
                <span className="text-zinc-500 text-[10px]">Color</span>
                <div className="font-medium">{rcDetails.color}</div>
              </div>
            )}
            {rcDetails.vehicle_category_description && (
              <div>
                <span className="text-zinc-500 text-[10px]">Category</span>
                <div className="font-medium truncate">{rcDetails.vehicle_category_description}</div>
              </div>
            )}
            {rcDetails.fuel_type && (
              <div>
                <span className="text-zinc-500 text-[10px]">Fuel</span>
                <div className="font-medium">{rcDetails.fuel_type}</div>
              </div>
            )}
            {rcDetails.vehicle_chasi_number && !rcDetails.chassis_no && (
              <div>
                <span className="text-zinc-500 text-[10px]">Chassis</span>
                <div className="font-medium font-mono text-[10px] truncate">{rcDetails.vehicle_chasi_number}</div>
              </div>
            )}
            {rcDetails.maker_description && (
              <div>
                <span className="text-zinc-500 text-[10px]">Manufacturer</span>
                <div className="font-medium truncate">{rcDetails.maker_description}</div>
              </div>
            )}
            {rcDetails.registration_date && (
              <div>
                <span className="text-zinc-500 text-[10px]">Registration</span>
                <div className="font-medium">{rcDetails.registration_date}</div>
              </div>
            )}
            {rcDetails.fit_up_to && (
              <div>
                <span className="text-zinc-500 text-[10px]">Fitness Valid</span>
                <div className="font-medium">{rcDetails.fit_up_to}</div>
              </div>
            )}
            {rcDetails.insurance_upto && (
              <div>
                <span className="text-zinc-500 text-[10px]">Insurance</span>
                <div className={cn("font-medium", new Date(rcDetails.insurance_upto) < new Date() ? "text-red-400" : "text-green-400")}>
                  {rcDetails.insurance_upto}
                </div>
              </div>
            )}
            {rcDetails.norms_type && (
              <div>
                <span className="text-zinc-500 text-[10px]">Emission</span>
                <div className="font-medium">{rcDetails.norms_type}</div>
              </div>
            )}
            {rcDetails.body_type && (
              <div>
                <span className="text-zinc-500 text-[10px]">Body Type</span>
                <div className="font-medium">{rcDetails.body_type}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="glass p-6 w-96">
            <h3 className="text-lg font-semibold mb-2">Delete Violation</h3>
            <p className="text-sm text-zinc-400 mb-6">
              This will permanently delete the violation. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => { setShowDeleteDialog(false); onDelete(violation.id); }}>
                Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Purge (hard-delete) Dialog — Voided tab only */}
      {showPurgeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="glass p-6 w-96">
            <h3 className="text-lg font-semibold mb-2">Permanently Delete Violation</h3>
            <p className="text-sm text-zinc-400 mb-6">
              This violation will be permanently removed and cannot be recovered.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPurgeDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => { setShowPurgeDialog(false); onPurge?.(violation.id); }}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="glass p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Reject Violation</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Please provide a reason for rejecting this violation:
            </p>
            <Input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Rejection reason..."
              className="mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setShowRejectDialog(false);
                setRejectionReason('');
              }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReject}>
                Reject
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
