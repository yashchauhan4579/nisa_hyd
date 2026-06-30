import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Eye, Users, Activity, Search, Upload, Plus, Monitor,
  AlertTriangle, FileText, X, Loader2, Trash, Edit,
  RefreshCw, ScanFace, UserX, Camera, UserCheck
} from 'lucide-react';
import { useToast } from "@sringeri/components/ui/use-toast";
import { apiClient } from '@sringeri/lib/api';
import { preloadPdfImages } from '@sringeri/lib/pdf-images';
import { pdf } from '@react-pdf/renderer';
import { FRSReportPDF } from './FRSReportPDF';
import { cn } from '@sringeri/lib/utils';
import { recordReportEvent } from '@sringeri/lib/reportHistory';
import { Button } from "@sringeri/components/ui/button";
import { Input } from "@sringeri/components/ui/input";
import { Label } from "@sringeri/components/ui/label";
import { Card } from "@sringeri/components/ui/card";
import { Badge } from "@sringeri/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@sringeri/components/ui/tabs";
import { Separator } from "@sringeri/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@sringeri/components/ui/dialog";
import type { Person } from '@sringeri/lib/api';

interface CrowdAlert {
  id: number;
  deviceId: string;
  alertType: string;
  title: string;
  description: string;
  timestamp: string;
  severity: string;
  metadata: any;
  isResolved: boolean;
  device?: { name: string };
}

const normalizeAlertTitle = (value: unknown) => {
  const text = typeof value === 'string' ? value : value ? String(value) : '';
  const cleaned = text.replace(/Person of Interest Detected: /i, '').trim();
  return cleaned || 'Unknown Subject';
};

const formatMetadata = (val: any) => {
  if (val === undefined || val === null || val === '') return 'N/A';
  const str = String(val).replace(/^(age_|gender_)/i, '').replace(/_/g, ' ');
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

const timeAgo = (ts: string) => {
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const getBestFaceImageUrl = (entry: any) =>
  entry?.faceSnapshotUrl ||
  entry?.metadata?.images?.['face_crop.jpg'] ||
  entry?.metadata?.images?.['face.jpg'] ||
  entry?.metadata?.images?.['frame.jpg'] ||
  null;

const ThreatBadge = ({ level }: { level?: string }) => {
  const l = level?.toLowerCase();
  return (
    <Badge className={cn(
      "text-[8px] h-4 px-1.5 font-bold border-0 shrink-0",
      l === 'high' ? "bg-red-500/20 text-red-400" :
        l === 'medium' ? "bg-amber-500/20 text-amber-400" :
          "bg-emerald-500/20 text-emerald-400"
    )}>
      {level?.toUpperCase() || 'MEDIUM'}
    </Badge>
  );
};

const CategoryBadge = ({ category }: { category?: string }) => (
  <Badge className="text-[8px] h-4 px-1.5 bg-primary/10 text-primary/80 font-mono border-0 shrink-0">
    {category === 'Warrant' ? 'WANTED' : category?.toUpperCase() || 'N/A'}
  </Badge>
);

const PersonCard = ({ person, idx, onClick, compact }: { person: Person; idx: number; onClick: () => void; compact?: boolean }) => (
  <div
    onClick={onClick}
    className={cn(
      "flex gap-3 p-2.5 rounded-lg cursor-pointer transition-all border group",
      person.threatLevel === 'High'
        ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
        : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
    )}
  >
    <div className={cn(
      "rounded-md bg-black shrink-0 overflow-hidden border border-white/10",
      compact ? "h-10 w-10" : "h-12 w-12"
    )}>
      <img src={person.faceImageUrl} className="w-full h-full object-cover" alt="" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[11px] text-white truncate">{person.name}</p>
        <span className="text-[9px] font-mono text-muted-foreground shrink-0">#{String(idx + 1).padStart(3, '0')}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <ThreatBadge level={person.threatLevel} />
        <CategoryBadge category={person.category} />
        {person.threatLevel === 'High' && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
      </div>
      {!compact && person.aliases && (
        <p className="text-[8px] text-muted-foreground mt-1 truncate">AKA: {person.aliases}</p>
      )}
    </div>
  </div>
);

const MatchThumbnail = ({
  match,
  persons,
  onClick,
  onAddToGallery
}: {
  match: CrowdAlert;
  persons: Person[];
  onClick: () => void;
  onAddToGallery?: (match: CrowdAlert, person: Person) => void;
}) => {
  const personId = match.metadata?.person_id;
  const matchedPerson = personId ? persons.find(p => String(p.id) === String(personId)) : null;
  const displayName = matchedPerson?.name || match.metadata?.person_name || match.title;
  const matchScore = match.metadata?.match_score || 0;
  const qualityScore = match.metadata?.quality_score || 0;

  // Show add button if it's a known face with good quality
  const showAddButton = matchedPerson && qualityScore > 0.7 && matchScore > 0.35;

  return (
    <div
      className="flex gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/[0.04] transition-all border border-transparent hover:border-white/10 relative group"
    >
      <div onClick={onClick} className="flex gap-3 flex-1">
        <div className="h-11 w-[72px] flex rounded-md overflow-hidden border border-white/10 shrink-0">
          <div className="w-1/2 h-full bg-black border-r border-white/5 relative">
            <img
              src={matchedPerson?.faceImageUrl || (match as any).faceSnapshotUrl || match.metadata?.images?.['face_crop.jpg'] || match.metadata?.images?.['face.jpg']}
              className="w-full h-full object-cover"
              alt=""
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[5px] text-center text-white/80 font-bold uppercase py-px">Ref</div>
          </div>
          <div className="w-1/2 h-full bg-black relative">
            <img
              src={(match as any).faceSnapshotUrl || match.metadata?.images?.['face.jpg'] || match.metadata?.images?.['frame.jpg']}
              className="w-full h-full object-cover"
              alt=""
            />
            <div className="absolute inset-x-0 bottom-0 iris-cut-tag-base iris-cut-tag-default text-[5px] text-center text-white font-bold uppercase py-px">Live</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <p className="font-semibold text-[11px] truncate text-white">{normalizeAlertTitle(displayName)}</p>
          <p className="text-[9px] text-muted-foreground font-medium truncate">
            {matchedPerson?.category || match.metadata?.person_category || match.deviceId || 'Station HQ'}
          </p>
          <p className="text-[8px] text-muted-foreground/60 mt-0.5">{timeAgo(match.timestamp)}</p>
        </div>
        <div className="flex items-center">
          <Eye className="h-3 w-3 text-white/20 group-hover:text-primary/60" />
        </div>
      </div>

      {/* Add to Gallery Button */}
      {showAddButton && onAddToGallery && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToGallery(match, matchedPerson);
          }}
          className="absolute top-1 right-1 bg-emerald-500/80 hover:bg-emerald-500 text-white text-[8px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
          title="Add this snapshot to person's gallery for improved matching"
        >
          <Plus className="h-2.5 w-2.5" />
          Gallery
        </button>
      )}
    </div>
  );
};

function LiveFeedPlayer({ deviceId }: { deviceId: string }) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const resp = await fetch('/api/frs/live-frames');
        if (resp.ok) {
          const frames = await resp.json();
          if (active && frames && frames[deviceId]) {
            setFrameSrc(frames[deviceId]);
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 33);
    return () => { active = false; clearInterval(id); };
  }, [deviceId]);

  if (!frameSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-zinc-600">
        <div className="text-center">
          <Camera className="w-6 h-6 mx-auto mb-1 opacity-30" />
          <p className="text-[9px]">Waiting for feed…</p>
        </div>
      </div>
    );
  }
  return <img src={frameSrc} className="w-full h-full object-contain bg-black" alt="" />;
}


const FRS_TAB_ROUTES = {
  live: '/frs/live',
  watchlist: '/frs/watchlist',
  identified: '/frs/identified',
  search: '/frs/search',
  alerts: '/frs/alerts',
  unknown: '/frs/unknown'
} as const;

type FrsTabKey = keyof typeof FRS_TAB_ROUTES;

// Number of detection rows shown per page in the Alerts / Unknown lists.
const FRS_PAGE_SIZE = 30;

// Local-time bounds for "today" (00:00:00.000 → 23:59:59.999), as ISO strings
// the backend's startTime/endTime filters understand. Auto-rolls at midnight.
const getTodayRange = (): { startTime: string; endTime: string } => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
};

const resolveTabFromPath = (pathname: string): FrsTabKey | null => {
  if (pathname === '/frs' || pathname === '/frs/') return 'live';
  const segment = pathname.replace(/^\/frs\/?/, '').split('/')[0];
  if (segment in FRS_TAB_ROUTES) return segment as FrsTabKey;
  return null;
};

export function CrowdFRSPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = resolveTabFromPath(location.pathname) ?? 'live';

  const goToTab = (tab: string) => {
    if (tab in FRS_TAB_ROUTES) navigate(FRS_TAB_ROUTES[tab as FrsTabKey]);
  };
  const [gridLayout, setGridLayout] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [cameraSlots, setCameraSlots] = useState<(string | null)[]>(Array(20).fill(null));

  // Watchlist State
  const [persons, setPersons] = useState<Person[]>([]);
  const [filteredPersons, setFilteredPersons] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setLoadingPersons] = useState(false);
  const [watchlistFilter, setWatchlistFilter] = useState<'all' | 'high' | 'wanted'>('all');

  // Person Profile Modal State
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [personHistory, setPersonHistory] = useState<CrowdAlert[]>([]);
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState(0);
  const [, setLoadingHistory] = useState(false);

  // Enrollment State
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ name: '', gender: '', height: '', category: '', threatLevel: '', notes: '', addToWatchlist: false });
  const [enrollFile, setEnrollFile] = useState<File | null>(null);
  const [enrollFiles, setEnrollFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Search Tab State
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [searchPreview, setSearchPreview] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [selectedSearchDetection, setSelectedSearchDetection] = useState<any>(null);
  const [searchCyclingIdx, setSearchCyclingIdx] = useState(0);
  const [searchDragOver, setSearchDragOver] = useState(false);
  const [showPersonEditModal, setShowPersonEditModal] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editForm, setEditForm] = useState({ name: '', gender: '', threatLevel: '', status: '', height: '', aliases: '', category: '', notes: '' });
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editPreviews, setEditPreviews] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Alerts State
  const [alerts, setAlerts] = useState<CrowdAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<CrowdAlert | null>(null);
  const [, setLoadingAlerts] = useState(false);
  const [alertsPage, setAlertsPage] = useState(1);
  const [unknownPage, setUnknownPage] = useState(1);

  // Live View State
  const [liveMatches, setLiveMatches] = useState<CrowdAlert[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<CrowdAlert | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);

  // Match Modal Image Upload State
  const [matchModalFiles, setMatchModalFiles] = useState<File[]>([]);
  const [matchModalPreviews, setMatchModalPreviews] = useState<string[]>([]);
  const [isAddingToGallery, setIsAddingToGallery] = useState(false);
  // Unknown Faces State
  const [unknownFaces, setUnknownFaces] = useState<any[]>([]);
  // Pool of cropped faces (known + unknown) from recent detections — used
  // for the rotating face animation during search.
  const [searchPoolFaces, setSearchPoolFaces] = useState<Array<{ url: string; label: string; kind: 'known' | 'unknown' }>>([]);
  const [selectedUnknown, setSelectedUnknown] = useState<any | null>(null);
  const [loadingUnknown, setLoadingUnknown] = useState(false);
  const suppressedUnknownIdsRef = useRef<Set<string>>(new Set());
  const suppressedUnknownTrackKeysRef = useRef<Set<string>>(new Set());

  // Unknown Face Conversion State
  const [selectedUnknownForConversion, setSelectedUnknownForConversion] = useState<any | null>(null);
  const [showConvertUnknownDialog, setShowConvertUnknownDialog] = useState(false);
  const [conversionMode, setConversionMode] = useState<'create' | 'link'>('create');
  const [selectedPersonForLink, setSelectedPersonForLink] = useState<Person | null>(null);
  const [convertForm, setConvertForm] = useState({
    name: '',
    category: 'person_of_interest',
    threatLevel: 'low',
    gender: 'unknown',
    height: '',
    aliases: '',
    notes: '',
    addToWatchlist: false
  });
  const [isConverting, setIsConverting] = useState(false);

  // Person Gallery State
  const [personGalleryImages] = useState<string[]>([]);
  const [loadingGallery] = useState(false);

  // URL-based tab navigation: redirect invalid paths
  useEffect(() => {
    const resolved = resolveTabFromPath(location.pathname);
    if (location.pathname.startsWith('/frs') && !resolved) {
      navigate(FRS_TAB_ROUTES.live, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    fetchPersons();
    if (activeTab === 'live') fetchLiveMatches();
    if (activeTab === 'alerts') fetchAlerts();
    if (activeTab === 'unknown') fetchUnknownFaces();
    // Live / Alerts / Unknown all now pull the full day's detections (up to
    // 5000 rows) so the lists show every match of the day — refresh on a
    // slower cadence to avoid re-pulling thousands of rows every second.
    const dayInterval = setInterval(() => {
      if (activeTab === 'live') fetchLiveMatches();
      if (activeTab === 'alerts') fetchAlerts();
      if (activeTab === 'unknown') fetchUnknownFaces();
    }, 10000);
    return () => { clearInterval(dayInterval); };
  }, [activeTab]);

  useEffect(() => {
    let result = persons;
    if (watchlistFilter === 'high') result = result.filter(p => p.threatLevel?.toLowerCase() === 'high');
    if (watchlistFilter === 'wanted') result = result.filter(p => p.category?.toLowerCase() === 'warrant');
    if (searchQuery) result = result.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    setFilteredPersons(result);
  }, [searchQuery, persons, watchlistFilter]);

  // Fetch a mixed pool of recent face crops (known + unknown) for the
  // search-cycling animation. We use detection face_crop.jpg URLs so
  // we always show actual cropped faces, not enrolment full photos.
  useEffect(() => {
    let cancelled = false;
    apiClient.getFRSDetections({ limit: 200 })
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        const pool: Array<{ url: string; label: string; kind: 'known' | 'unknown' }> = [];
        for (const r of rows) {
          const url = r?.faceSnapshotUrl || r?.metadata?.images?.['face_crop.jpg'];
          if (!url) continue;
          const known = !!r?.personId;
          pool.push({
            url,
            label: known ? (r?.person?.name || 'Known') : 'Unknown',
            kind: known ? 'known' : 'unknown',
          });
        }
        // de-duplicate by URL
        const seen = new Set<string>();
        const dedup = pool.filter(p => (seen.has(p.url) ? false : (seen.add(p.url), true)));
        setSearchPoolFaces(dedup);
      })
      .catch(() => { /* leave pool empty */ });
    return () => { cancelled = true; };
  }, []);

  // Shuffled pool for the rotating face animation. Reshuffles each time
  // a new search starts.
  const searchCyclePool = useMemo(() => {
    const all = [...searchPoolFaces];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [searchPoolFaces, searchLoading]);

  // Face-search "scanning database" cycling animation.
  useEffect(() => {
    if (!searchLoading || searchCyclePool.length === 0) return;
    const id = setInterval(() => {
      setSearchCyclingIdx(i => (i + 1) % searchCyclePool.length);
    }, 110);
    return () => clearInterval(id);
  }, [searchLoading, searchCyclePool.length]);

  useEffect(() => {
    if (selectedPerson) {
      setLoadingHistory(true);
      setSelectedHistoryIdx(0);
      apiClient.getFRSDetections({ limit: 10, personId: selectedPerson.id })
        .then(data => {
          if (data && data.length > 0) {
            setPersonHistory(data as any);
          } else {
            setPersonHistory([]);
          }
        })
        .catch(() => {
          setPersonHistory([]);
        })
        .finally(() => setLoadingHistory(false));
    }
  }, [selectedPerson]);

  const fetchPersons = async () => {
    setLoadingPersons(true);
    try {
      const data = await apiClient.getPersons();
      setPersons(data);
      setFilteredPersons(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPersons(false);
    }
  };

  const fetchAlerts = async () => {
    setLoadingAlerts(true);
    try {
      // All of TODAY's known-person matches (not just the latest 20).
      const { startTime, endTime } = getTodayRange();
      const data = await apiClient.getFRSDetections({ unknown: false, startTime, endTime, limit: 5000 });
      setAlerts(data as any);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const fetchLiveMatches = async () => {
    try {
      // ALL of today's known-person matches (was capped at the latest 10/50).
      // Backend orders timestamp DESC, so the list is newest-first; the panel
      // is scrollable so every match of the day is reachable.
      const { startTime, endTime } = getTodayRange();
      const data = await apiClient.getFRSDetections({ unknown: false, startTime, endTime, limit: 5000 });
      setLiveMatches(data as any);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUnknownFaces = async () => {
    setLoadingUnknown(true);
    try {
      // All of TODAY's unknown faces (not just the latest 20).
      const { startTime, endTime } = getTodayRange();
      const data = await apiClient.getFRSDetections({ unknown: true, startTime, endTime, limit: 5000 });
      // Defensive client-side guard: unknown list should never include known/person-linked rows.
      const onlyUnknown = (data || []).filter((d: any) => {
        const personId = d?.personId || d?.person_id || d?.person?.id || d?.metadata?.person_id;
        const isKnown = d?.metadata?.is_known === true || d?.metadata?.is_known === 'true';
        const id = String(d?.id || '');
        const track = String(d?.metadata?.track_id || d?.metadata?.trackId || '');
        const device = String(d?.deviceId || d?.device?.id || '');
        const trackKey = track && device ? `${device}::${track}` : '';
        if (suppressedUnknownIdsRef.current.has(id)) return false;
        if (trackKey && suppressedUnknownTrackKeysRef.current.has(trackKey)) return false;
        return !personId && !isKnown;
      });
      setUnknownFaces(onlyUnknown);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUnknown(false);
    }
  };

  const removeUnknownDetectionsFromUi = (baseDetection: any) => {
    if (!baseDetection) return;
    const baseId = String(baseDetection.id || '');
    const baseTrack = String(baseDetection?.metadata?.track_id || baseDetection?.metadata?.trackId || '');
    const baseDevice = String(baseDetection?.deviceId || baseDetection?.device?.id || '');
    if (baseId) suppressedUnknownIdsRef.current.add(baseId);
    if (baseTrack && baseDevice) suppressedUnknownTrackKeysRef.current.add(`${baseDevice}::${baseTrack}`);

    setUnknownFaces(prev => prev.filter((face: any) => {
      const faceId = String(face.id || '');
      if (faceId === baseId) return false;

      const faceTrack = String(face?.metadata?.track_id || face?.metadata?.trackId || '');
      const faceDevice = String(face?.deviceId || face?.device?.id || '');
      if (baseTrack && faceTrack && baseTrack === faceTrack && baseDevice && faceDevice && baseDevice === faceDevice) {
        return false;
      }
      return true;
    }));

    setSelectedUnknown((prev: any) => (prev && String(prev.id) === baseId ? null : prev));
  };

  const handleConvertUnknownToPerson = async () => {
    if (!selectedUnknownForConversion || !convertForm.name) {
      toast({ title: 'Missing Name', description: 'Please enter a name for this person.', variant: 'destructive' });
      return;
    }

    setIsConverting(true);
    try {
      // Download the unknown face image
      const faceImageUrl = getBestFaceImageUrl(selectedUnknownForConversion);
      if (!faceImageUrl) {
        toast({ title: 'Error', description: 'No face image available', variant: 'destructive' });
        return;
      }

      const response = await fetch(faceImageUrl);
      const blob = await response.blob();

      // Create FormData with image and details
      const formData = new FormData();
      formData.append('images[]', blob, 'face_crop.jpg');
      formData.append('name', convertForm.name);
      formData.append('category', convertForm.addToWatchlist ? 'suspect' : convertForm.category);
      formData.append('threatLevel', convertForm.addToWatchlist ? 'high' : convertForm.threatLevel);
      formData.append('gender', convertForm.gender);
      formData.append('height', convertForm.height);
      formData.append('aliases', convertForm.aliases);
      formData.append('notes', convertForm.notes);

      const createdPerson = await apiClient.createPerson(formData);
      if (selectedUnknownForConversion?.id) {
        const relabelForm = new FormData();
        relabelForm.append('detectionId', String(selectedUnknownForConversion.id));
        const trackId = String(selectedUnknownForConversion?.metadata?.track_id || selectedUnknownForConversion?.metadata?.trackId || '');
        const deviceId = String(selectedUnknownForConversion?.deviceId || selectedUnknownForConversion?.device?.id || '');
        if (trackId) relabelForm.append('trackId', trackId);
        if (deviceId) relabelForm.append('deviceId', deviceId);
        await apiClient.addPersonEmbeddings(createdPerson.id, relabelForm);
      }

      toast({
        title: 'Person Identified',
        description: `${convertForm.name} has been added to ${convertForm.threatLevel === 'high' || convertForm.category === 'warrant' ? 'watchlist' : 'identified persons'}.`,
        duration: 3000
      });

      // Reset form and close dialog
      setConvertForm({
        name: '',
        category: 'person_of_interest',
        threatLevel: 'low',
        gender: 'unknown',
        height: '',
        aliases: '',
        notes: '',
        addToWatchlist: false
      });
      setShowConvertUnknownDialog(false);
      setSelectedUnknownForConversion(null);

      // Refresh data
      fetchPersons();
      removeUnknownDetectionsFromUi(selectedUnknownForConversion);
      fetchUnknownFaces();
      fetchLiveMatches();
      fetchAlerts();
    } catch (err) {
      console.error('Error converting unknown to person:', err);
      toast({
        title: 'Error',
        description: 'Failed to create person profile',
        variant: 'destructive'
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handleLinkUnknownToPerson = async () => {
    if (!selectedUnknownForConversion || !selectedPersonForLink) {
      toast({ title: 'Missing Selection', description: 'Please select a person to link to.', variant: 'destructive' });
      return;
    }

    setIsConverting(true);
    try {
      // Download the unknown face image
      const faceImageUrl = getBestFaceImageUrl(selectedUnknownForConversion);
      if (!faceImageUrl) {
        toast({ title: 'Error', description: 'No face image available', variant: 'destructive' });
        return;
      }

      const response = await fetch(faceImageUrl);
      const blob = await response.blob();

      // Add to person's embeddings
      const formData = new FormData();
      formData.append('images[]', blob, 'face_crop.jpg');
      // Reclassify this exact unknown detection as known on the backend.
      if (selectedUnknownForConversion?.id) {
        formData.append('detectionId', String(selectedUnknownForConversion.id));
      }
      const trackId = String(selectedUnknownForConversion?.metadata?.track_id || selectedUnknownForConversion?.metadata?.trackId || '');
      const deviceId = String(selectedUnknownForConversion?.deviceId || selectedUnknownForConversion?.device?.id || '');
      if (trackId) formData.append('trackId', trackId);
      if (deviceId) formData.append('deviceId', deviceId);

      const result = await apiClient.addPersonEmbeddings(selectedPersonForLink.id, formData);

      toast({
        title: 'Face Linked',
        description: `Added to ${selectedPersonForLink.name}'s gallery. Total: ${result.totalEmbeddings} images.`,
        duration: 3000
      });

      // Reset and close
      setShowConvertUnknownDialog(false);
      setSelectedUnknownForConversion(null);
      setSelectedPersonForLink(null);
      setConversionMode('create');

      // Refresh data
      fetchPersons();
      removeUnknownDetectionsFromUi(selectedUnknownForConversion);
      fetchUnknownFaces();
      fetchLiveMatches();
      fetchAlerts();
    } catch (err) {
      console.error('Error linking unknown to person:', err);
      toast({
        title: 'Error',
        description: 'Failed to link face to person',
        variant: 'destructive'
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handleEnroll = async () => {
    const filesToUpload = enrollFiles.length > 0 ? enrollFiles : (enrollFile ? [enrollFile] : []);
    if (!enrollForm.name || filesToUpload.length === 0) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      // Append multiple images
      filesToUpload.forEach(file => {
        formData.append('images[]', file);
      });
      formData.append('name', enrollForm.name);
      formData.append('category', enrollForm.addToWatchlist ? 'suspect' : (enrollForm.category || 'person_of_interest'));
      formData.append('threatLevel', enrollForm.addToWatchlist ? 'high' : (enrollForm.threatLevel || 'medium'));
      if (enrollForm.gender) formData.append('gender', enrollForm.gender);
      if (enrollForm.height) formData.append('height', enrollForm.height);
      formData.append('notes', enrollForm.notes || '');
      const res = await apiClient.createPerson(formData);
      if (res) {
        setEnrollForm({ name: '', gender: '', height: '', category: '', threatLevel: '', notes: '', addToWatchlist: false });
        setEnrollFile(null);
        setEnrollFiles([]);
        setShowEnrollDialog(false);
        fetchPersons();
        toast({ title: 'Success', description: `Person enrolled with ${filesToUpload.length} image(s)` });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to enroll person', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePerson = async (id: string, e?: MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("Are you sure?")) return;
    try {
      await apiClient.deletePerson(id);
      setPersons(prev => prev.filter(p => p.id !== id));
      setFilteredPersons(prev => prev.filter(p => p.id !== id));
      fetchPersons();
      if (selectedPerson?.id === id) setSelectedPerson(null);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to delete person', variant: 'destructive' });
    }
  };

  const handleSearchImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSearchFile(file);
      // Clear previous results so the new upload starts from a clean slate
      setSearchResults([]);
      setSearchPerformed(false);
      setSelectedSearchDetection(null);
      const reader = new FileReader();
      reader.onloadend = () => setSearchPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSearchSubmit = async () => {
    if (!searchFile) {
      toast({ title: 'Missing Image', description: 'Please upload a face image to search.', variant: 'destructive' });
      return;
    }
    setSearchLoading(true);
    setSearchPerformed(false);
    setSelectedSearchDetection(null);
    const startTs = Date.now();
    try {
      // Loose threshold — search returns up to top 20 by similarity anyway,
      // so we'd rather show them than hide. Frontend can colour-code below 0.5.
      const result = await apiClient.searchFace(searchFile, 0.30);
      // Combine person matches and detection matches into unified results
      const combined: any[] = [];

      // Person matches (known in watchlist)
      for (const pm of (result.personMatches || [])) {
        combined.push({
          type: 'person',
          personId: pm.personId,
          personName: pm.personName,
          faceImageUrl: pm.faceImageUrl,
          similarity: pm.similarity,
          person: persons.find(p => p.id === pm.personId)
        });
      }

      // Detection matches (sighting history — known or unknown)
      for (const dm of (result.detectionMatches || [])) {
        combined.push({
          type: 'detection',
          detection: dm.detection,
          similarity: dm.similarity
        });
      }

      // Hold the cycling animation visible for at least 2.5s so the
      // "scanning database" effect feels real even when the API responds fast.
      const elapsed = Date.now() - startTs;
      const remaining = 2500 - elapsed;
      if (remaining > 0) {
        await new Promise(r => setTimeout(r, remaining));
      }

      setSearchResults(combined);
      setSearchPerformed(true);
      if (combined.length > 0) {
        toast({ title: 'Match Found', description: `${result.personMatches?.length || 0} person(s), ${result.detectionMatches?.length || 0} sighting(s)` });
      }
    } catch (err: any) {
      console.error("Search error:", err);
      toast({ title: 'Search Failed', description: err?.message || 'Face search failed', variant: 'destructive' });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddToGallery = async (match: CrowdAlert, person: Person) => {
    try {
      // Get the face snapshot URL
      const faceImageUrl = getBestFaceImageUrl(match);
      if (!faceImageUrl) {
        toast({ title: 'Error', description: 'No face image available', variant: 'destructive' });
        return;
      }

      // Download the image as blob
      const response = await fetch(faceImageUrl);
      const blob = await response.blob();

      // Create FormData with the image
      const formData = new FormData();
      formData.append('images[]', blob, 'snapshot.jpg');

      // Send to backend
      const result = await apiClient.addPersonEmbeddings(person.id, formData);

      toast({
        title: 'Added to Gallery',
        description: `Snapshot added! ${person.name} now has ${result.totalEmbeddings} embeddings for improved accuracy.`,
        duration: 3000
      });

      // Refresh persons to get updated embedding count
      fetchPersons();
    } catch (err) {
      console.error('Error adding to gallery:', err);
      toast({
        title: 'Error',
        description: 'Failed to add snapshot to gallery',
        variant: 'destructive'
      });
    }
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      setEditFiles(fileArray);

      // Generate previews for all files
      const previews: string[] = [];
      fileArray.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          previews.push(reader.result as string);
          if (previews.length === fileArray.length) {
            setEditPreviews(previews);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleEditSave = async () => {
    if (!editPerson) return;
    setEditSaving(true);
    try {
      // First update the person details (without image)
      const formData = new FormData();
      formData.append('name', editForm.name);
      formData.append('gender', editForm.gender);
      formData.append('threatLevel', editForm.threatLevel);
      formData.append('status', editForm.status);
      formData.append('height', editForm.height);
      formData.append('aliases', editForm.aliases);
      formData.append('category', editForm.category);
      formData.append('notes', editForm.notes);

      const updated = await apiClient.updatePerson(editPerson.id, formData);

      // If there are new images, add them to embeddings
      if (editFiles.length > 0) {
        const imageFormData = new FormData();
        editFiles.forEach(file => {
          imageFormData.append('images[]', file);
        });
        await apiClient.addPersonEmbeddings(editPerson.id, imageFormData);
      }

      setPersons(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      setFilteredPersons(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      if (selectedPerson?.id === updated.id) setSelectedPerson(updated);
      setShowPersonEditModal(false);
      toast({
        title: 'Updated',
        description: editFiles.length > 0
          ? `Person details saved and ${editFiles.length} image(s) added to gallery.`
          : 'Person details saved.'
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to update person', variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  const openMatchDetail = (match: CrowdAlert) => {
    setSelectedMatch(match);
    setShowMatchModal(true);
    // Reset match modal upload state
    setMatchModalFiles([]);
    setMatchModalPreviews([]);
  };

  const handleMatchModalImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      setMatchModalFiles(fileArray);

      // Generate previews for all files
      const previews: string[] = [];
      fileArray.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          previews.push(reader.result as string);
          if (previews.length === fileArray.length) {
            setMatchModalPreviews(previews);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleMatchModalAddToGallery = async () => {
    if (!selectedMatch || matchModalFiles.length === 0) return;

    const personId = selectedMatch.metadata?.person_id;
    const matchedPerson = persons.find(p => String(p.id) === String(personId));

    if (!matchedPerson) {
      toast({ title: 'Error', description: 'No person profile found for this match', variant: 'destructive' });
      return;
    }

    setIsAddingToGallery(true);
    try {
      const formData = new FormData();
      matchModalFiles.forEach(file => {
        formData.append('images[]', file);
      });

      const result = await apiClient.addPersonEmbeddings(matchedPerson.id, formData);

      toast({
        title: 'Added to Gallery',
        description: `${matchModalFiles.length} image(s) added! ${matchedPerson.name} now has ${result.totalEmbeddings} embeddings.`,
        duration: 3000
      });

      // Reset upload state
      setMatchModalFiles([]);
      setMatchModalPreviews([]);

      // Refresh persons to get updated embedding count
      fetchPersons();
    } catch (err) {
      console.error('Error adding to gallery:', err);
      toast({
        title: 'Error',
        description: 'Failed to add images to gallery',
        variant: 'destructive'
      });
    } finally {
      setIsAddingToGallery(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const availableLiveSources = useMemo(() => {
    const seen = new Set<string>();
    const sources: Array<{ deviceId: string; label: string; src: string }> = [];
    liveMatches.forEach((m: any) => {
      const personId = m?.metadata?.person_id;
      const isKnown = m?.metadata?.is_known === true || m?.metadata?.is_known === 'true';
      if (!personId && !isKnown) return;
      const id = String(m?.deviceId || m?.device?.id || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      sources.push({
        deviceId: id,
        label: String(m?.device?.name || `camera_${id}`),
        src: `/media/camera_${id}`
      });
    });
    return sources;
  }, [liveMatches]);

  const maxVisibleSlots = useMemo(() => {
    if (gridLayout === 1) return 1;
    if (gridLayout === 2) return 4;
    if (gridLayout === 3) return 9;
    if (gridLayout === 4) return 16;
    return 20;
  }, [gridLayout]);

  const compactCameraSlots = useMemo(() => {
    return cameraSlots
      .slice(0, maxVisibleSlots)
      .map((deviceId, idx) => {
        if (!deviceId) return null;
        const source = availableLiveSources.find((s) => s.deviceId === deviceId);
        return source ? { idx, ...source } : null;
      })
      .filter(Boolean) as Array<{ idx: number; deviceId: string; label: string; src: string }>;
  }, [cameraSlots, maxVisibleSlots, availableLiveSources]);

  useEffect(() => {
    const valid = new Set(availableLiveSources.map((s) => s.deviceId));
    const fallback = availableLiveSources[0]?.deviceId || null;
    setCameraSlots((prev) => {
      let changed = false;
      const next = [...prev];
      for (let i = 0; i < next.length; i++) {
        if (next[i] && !valid.has(next[i] as string)) {
          next[i] = null;
          changed = true;
        }
      }
      if (availableLiveSources.length > 0 && !next.some(Boolean) && fallback) {
        next[0] = fallback;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [availableLiveSources]);

  const highThreatCount = persons.filter(p => p.threatLevel?.toLowerCase() === 'high').length;
  const wantedCount = persons.filter(p => p.category?.toLowerCase() === 'warrant').length;

  const handleExport = async () => {
    setIsExporting(true);
    const tStart = performance.now();
    const ms = (t0: number) => `${Math.round(performance.now() - t0)}ms`;
    try {
      const generatedAt = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      // The detection log is the focus of the report — allow many rows
      // since each row resizes to ~30 KB.
      const MAX_PERSONS = 80;
      const MAX_DETECTIONS = 200;
      const reportPersons = filteredPersons.slice(0, MAX_PERSONS);

      // Only include KNOWN-person detections. A detection is "known" if
      // any of: top-level personId, hydrated person, or metadata.person_id
      // pointing into the watchlist, or a metadata.person_name fallback.
      const personIds = new Set(filteredPersons.map((p) => String(p.id)));
      const knownDetections = (alerts as any[]).filter((d) => {
        if (d?.personId && String(d.personId).length) return true;
        if (d?.person?.id) return true;
        const pid = d?.metadata?.person_id;
        if (pid != null && personIds.has(String(pid))) return true;
        if (d?.metadata?.person_name) return true;
        return false;
      });
      const reportDetections = knownDetections.slice(0, MAX_DETECTIONS);

      // The report is now a row-wise sighting log: per row we need the
      // camera frame + the detected face crop. We only fall back to the
      // watchlist reference photo if the detection event is missing its
      // own face crop (uncommon).
      const imageRequests: { url: string; kind: 'face' | 'frame' }[] = [];
      reportDetections.forEach((d: any) => {
        const imgs = d?.metadata?.images || {};
        const match =
          imgs['face_crop.jpg'] ||
          imgs['face.jpg'] ||
          d?.faceSnapshotUrl ||
          d?.metadata?.face_snapshot_url;
        const frame =
          imgs['frame.jpg'] ||
          d?.fullSnapshotUrl ||
          d?.metadata?.full_snapshot_url ||
          d?.metadata?.fullImageUrl;
        if (match) {
          imageRequests.push({ url: match, kind: 'face' });
        } else {
          // fallback only when no detected crop is available
          const matched =
            d?.person?.faceImageUrl ||
            reportPersons.find((p) => String(p.id) === String(d?.metadata?.person_id ?? d?.personId))?.faceImageUrl;
          if (matched) imageRequests.push({ url: matched, kind: 'face' });
        }
        if (frame) imageRequests.push({ url: frame, kind: 'frame' });
      });

      const tFetch = performance.now();
      const imageMap = await preloadPdfImages(imageRequests);
      console.log(`[FRS-PDF] fetch+resize ${imageRequests.length} requested -> ${imageMap.size} images: ${ms(tFetch)}`);
      const totalBytes = Array.from(imageMap.values()).reduce((a, s) => a + s.length, 0);
      console.log(`[FRS-PDF] imageMap size: ${imageMap.size} entries, ~${(totalBytes / 1024 / 1024).toFixed(1)} MB encoded`);

      const tRender = performance.now();
      const blob = await pdf(
        <FRSReportPDF
          persons={reportPersons}
          detections={reportDetections as any}
          reportTitle="FRS Watchlist & Detection Report"
          generatedAt={generatedAt}
          filters={{
            watchlistFilter: watchlistFilter,
            searchQuery: searchQuery || undefined
          }}
          imageMap={imageMap}
          totalPersons={filteredPersons.length}
          totalDetections={knownDetections.length}
        />
      ).toBlob();
      console.log(`[FRS-PDF] react-pdf renderToBlob: ${ms(tRender)}`);
      console.log(`[FRS-PDF] TOTAL: ${ms(tStart)}  (${reportPersons.length} persons, ${reportDetections.length} detections, ${imageMap.size} photos, ${(blob.size / 1024 / 1024).toFixed(1)} MB pdf)`);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `FRS-Report-${Date.now()}.pdf`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      recordReportEvent({
        title: 'FRS Watchlist & Detection Report',
        module: 'FRS',
        route: '/frs',
        format: 'pdf',
        status: 'downloaded',
        query: JSON.stringify({
          watchlistFilter,
          searchQuery: searchQuery || undefined,
          filename
        })
      });
      toast({ title: 'Export Complete', description: 'FRS report downloaded successfully.' });
    } catch (err) {
      console.error('Failed to generate FRS report:', err);
      toast({ title: 'Export Failed', description: 'Failed to generate report PDF.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([fetchPersons(), fetchAlerts(), fetchLiveMatches(), fetchUnknownFaces()]);
    toast({ title: 'Refreshed', description: 'Data updated successfully.' });
  };

  // ── Today-scoped pagination + metrics for Alerts (matches) and Unknown ──
  const alertList = alerts.filter(Boolean);
  const alertsTotalPages = Math.max(1, Math.ceil(alertList.length / FRS_PAGE_SIZE));
  const safeAlertsPage = Math.min(Math.max(1, alertsPage), alertsTotalPages);
  const pagedAlerts = alertList.slice((safeAlertsPage - 1) * FRS_PAGE_SIZE, safeAlertsPage * FRS_PAGE_SIZE);
  const alertsUniquePersons = new Set(
    alertList.map((a) => a.metadata?.person_id).filter(Boolean)
  ).size;

  const unknownTotalPages = Math.max(1, Math.ceil(unknownFaces.length / FRS_PAGE_SIZE));
  const safeUnknownPage = Math.min(Math.max(1, unknownPage), unknownTotalPages);
  const pagedUnknown = unknownFaces.slice((safeUnknownPage - 1) * FRS_PAGE_SIZE, safeUnknownPage * FRS_PAGE_SIZE);
  const unknownUniqueCameras = new Set(
    unknownFaces.map((f: any) => f.deviceId || f.device?.id).filter(Boolean)
  ).size;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden iris-dashboard-root iris-frs-theme relative">
      <Tabs value={activeTab} onValueChange={goToTab} className="flex flex-col h-full min-h-0">
        {/* Tab Header */}
        <div className="shrink-0 px-4 pt-4 lg:px-6 lg:pt-5 pb-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <TabsList className="bg-zinc-900/50 p-1 border border-white/10 h-9 w-full sm:w-auto justify-start">
              <TabsTrigger value="live" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.06]">
                <Monitor className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Live</span> Monitor
              </TabsTrigger>
              <TabsTrigger value="watchlist" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.06]">
                <Users className="h-3.5 w-3.5" /> Watchlist
              </TabsTrigger>
              <TabsTrigger value="identified" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.06]">
                <UserCheck className="h-3.5 w-3.5" /> Identified
              </TabsTrigger>
              <TabsTrigger value="search" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.06]">
                <Search className="h-3.5 w-3.5" /> Search
              </TabsTrigger>
              <TabsTrigger value="alerts" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.06]">
                <AlertTriangle className="h-3.5 w-3.5" /> Alerts
              </TabsTrigger>
              <TabsTrigger value="unknown" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.06]">
                <UserX className="h-3.5 w-3.5" /> Unknown
              </TabsTrigger>
            </TabsList>

            {/* Status Indicators */}
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-500 font-medium">Engine Online</span>
              </div>
              <Separator orientation="vertical" className="h-3 bg-white/10" />
              <span className="text-muted-foreground"><span className="text-white font-medium">{persons.length}</span> Indexed</span>
              <Separator orientation="vertical" className="h-3 bg-white/10" />
              <span className="text-muted-foreground">Latency: <span className="text-white font-medium">42ms</span></span>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 px-4 pb-4 lg:px-6 lg:pb-6 overflow-hidden">

          {/* ═══════════════ LIVE MONITOR TAB ═══════════════ */}
          <TabsContent value="live" className="h-full m-0 flex flex-col lg:flex-row gap-4">
            {/* Sidebar - Matches */}
            <Card className="w-full lg:w-64 xl:w-72 flex flex-col shrink-0 border border-white/5 bg-zinc-900/30 overflow-hidden max-h-[280px] lg:max-h-none">
              <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center justify-center w-7 h-7">
                    <div className="absolute inset-0 border border-primary/30 rounded-full animate-[spin_4s_linear_infinite]" />
                    <ScanFace className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-white">Face Matches</p>
                    <p className="text-[8px] text-muted-foreground">{liveMatches.length} detections</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-white"
                  onClick={() => setLiveMatches([])}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {liveMatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center h-full min-h-[80px] text-muted-foreground/30">
                    <ScanFace className="h-6 w-6 mb-2 opacity-40" />
                    <p className="text-[10px]">Waiting for detections...</p>
                  </div>
                ) : (
                  liveMatches
                    // Client-side filter: only show known faces (defense-in-depth)
                    .filter((match) => {
                      const personId = match.metadata?.person_id;
                      const isKnown = match.metadata?.is_known;
                      // Include if has person_id OR is_known is explicitly true
                      return personId || isKnown === true;
                    })
                    .map((match) => (
                      <MatchThumbnail
                        key={match.id}
                        match={match}
                        persons={persons}
                        onClick={() => openMatchDetail(match)}
                        onAddToGallery={handleAddToGallery}
                      />
                    ))
                )}
              </div>
            </Card>

            {/* Live Feed Panel */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <div className="shrink-0 mb-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span className="text-white font-medium">Live Feeds:</span>
                <span>{compactCameraSlots.length} active</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[9px] border-white/10 text-muted-foreground"
                    onClick={() => setGridLayout((v) => (v >= 5 ? 5 : ((v + 1) as 1 | 2 | 3 | 4 | 5)))}
                  >
                    Grid {gridLayout}x{gridLayout}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[9px] border-white/10 text-muted-foreground disabled:opacity-50"
                    disabled={!availableLiveSources.length || cameraSlots.filter(Boolean).length >= maxVisibleSlots}
                    onClick={() => {
                      setCameraSlots((prev) => {
                        const next = [...prev];
                        const emptyIdx = next.slice(0, maxVisibleSlots).findIndex((s) => !s);
                        if (emptyIdx === -1) return prev;
                        const used = new Set(next.filter(Boolean) as string[]);
                        const nextSource = availableLiveSources.find((s) => !used.has(s.deviceId)) || availableLiveSources[0];
                        if (!nextSource) return prev;
                        next[emptyIdx] = nextSource.deviceId;
                        return next;
                      });
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Camera
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 rounded-xl border border-white/5 bg-zinc-900/20 p-3">
                {compactCameraSlots.length ? (
                  <div
                    className="grid gap-2 h-full"
                    style={{ gridTemplateColumns: `repeat(${Math.min(gridLayout, compactCameraSlots.length)}, minmax(0, 1fr))` }}
                  >
                    {compactCameraSlots.map((slot) => (
                      <div key={slot.idx} className="relative rounded-lg overflow-hidden border border-white/10 bg-black min-h-[130px]">
                        <LiveFeedPlayer deviceId={slot.deviceId} />
                        <div className="absolute top-1.5 left-1.5">
                          <div className="bg-red-500/90 backdrop-blur px-1.5 py-0.5 rounded text-[8px] font-bold text-white flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-white animate-pulse" /> LIVE
                          </div>
                        </div>
                        <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1">
                          <select
                            className="h-6 rounded bg-black/70 border border-white/20 px-1.5 text-[9px] text-white"
                            value={slot.deviceId}
                            onChange={(e) => {
                              const value = e.target.value || null;
                              setCameraSlots((prev) => {
                                const next = [...prev];
                                next[slot.idx] = value;
                                return next;
                              });
                            }}
                          >
                            {availableLiveSources.map((source) => (
                              <option key={source.deviceId} value={source.deviceId}>{source.label}</option>
                            ))}
                          </select>
                          <button
                            className="h-6 w-6 rounded bg-black/70 border border-white/20 flex items-center justify-center text-white/70 hover:text-white"
                            onClick={() => {
                              setCameraSlots((prev) => {
                                const next = [...prev];
                                next[slot.idx] = null;
                                return next;
                              });
                            }}
                            title="Remove camera"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative w-full h-full rounded-lg overflow-hidden border border-white/10 bg-black">
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                      <Monitor className="h-6 w-6 mb-2" />
                      <p className="text-[10px] font-medium">No active FRS feed</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════ WATCHLIST TAB ═══════════════ */}
          <TabsContent value="watchlist" className="h-full m-0 flex flex-col gap-4">
            {/* Toolbar */}
            <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name..."
                    className="h-8 pl-8 text-xs bg-zinc-900/60 border-white/5"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1 bg-zinc-900/60 p-0.5 rounded-lg border border-white/5">
                  {(['all', 'high', 'wanted'] as const).map((f) => (
                    <Button
                      key={f}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2.5 text-[10px]",
                        watchlistFilter === f ? "bg-white/[0.08] text-white" : "text-muted-foreground hover:text-white"
                      )}
                      onClick={() => setWatchlistFilter(f)}
                    >
                      {f === 'all' ? `All (${persons.length})` : f === 'high' ? `High Threat (${highThreatCount})` : `Wanted (${wantedCount})`}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
                  onClick={() => setShowEnrollDialog(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Enroll Person
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-white/10 text-muted-foreground"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
                  {isExporting ? 'Exporting...' : 'Export'}
                </Button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-white/5 bg-zinc-900/30 p-3">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Total Records</p>
                <p className="text-xl font-bold text-white mt-1">{persons.length}</p>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-[9px] text-red-400 uppercase tracking-wider font-medium">High Threat</p>
                <p className="text-xl font-bold text-red-400 mt-1">{highThreatCount}</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[9px] text-amber-400 uppercase tracking-wider font-medium">Wanted Persons</p>
                <p className="text-xl font-bold text-amber-400 mt-1">{wantedCount}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[9px] text-emerald-400 uppercase tracking-wider font-medium">Cleared</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">{persons.length - highThreatCount - wantedCount}</p>
              </div>
            </div>

            {/* Person Grid */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/5 bg-zinc-900/20 p-3">
              {filteredPersons.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
                  <Users className="h-10 w-10 mb-3" />
                  <p className="text-sm font-medium">No persons found</p>
                  <p className="text-xs mt-1">Try adjusting your search or filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {filteredPersons.map((person, idx) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      idx={idx}
                      onClick={() => setSelectedPerson(person)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="shrink-0 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Showing {filteredPersons.length} of {persons.length} records</span>
              <span className="font-mono">Page 1 of 1</span>
            </div>
          </TabsContent>

          {/* ═══════════════ IDENTIFIED TAB ═══════════════ */}
          <TabsContent value="identified" className="h-full m-0 flex flex-col gap-4">
            {/* Toolbar */}
            <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name..."
                    className="h-8 pl-8 text-xs bg-zinc-900/60 border-white/5"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-white/5 bg-zinc-900/30 p-3">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Identified</p>
                <p className="text-xl font-bold text-white mt-1">
                  {persons.filter(p => p.threatLevel?.toLowerCase() !== 'high' && p.category?.toLowerCase() !== 'warrant').length}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[9px] text-emerald-400 uppercase tracking-wider font-medium">Low Risk</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">
                  {persons.filter(p => p.threatLevel?.toLowerCase() === 'low').length}
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[9px] text-amber-400 uppercase tracking-wider font-medium">Medium Risk</p>
                <p className="text-xl font-bold text-amber-400 mt-1">
                  {persons.filter(p => p.threatLevel?.toLowerCase() === 'medium' && p.category?.toLowerCase() !== 'warrant').length}
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[9px] text-amber-400 uppercase tracking-wider font-medium">Total Persons</p>
                <p className="text-xl font-bold text-amber-400 mt-1">{persons.length}</p>
              </div>
            </div>

            {/* Person Grid */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/5 bg-zinc-900/20 p-3">
              {(() => {
                const identifiedPersons = filteredPersons.filter(p =>
                  p.threatLevel?.toLowerCase() !== 'high' && p.category?.toLowerCase() !== 'warrant'
                );

                return identifiedPersons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
                    <UserCheck className="h-10 w-10 mb-3" />
                    <p className="text-sm font-medium">No identified persons found</p>
                    <p className="text-xs mt-1">Convert unknown faces or adjust your search</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {identifiedPersons.map((person, idx) => (
                      <PersonCard
                        key={person.id}
                        person={person}
                        idx={idx}
                        onClick={() => setSelectedPerson(person)}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Pagination */}
            <div className="shrink-0 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Showing {filteredPersons.filter(p => p.threatLevel?.toLowerCase() !== 'high' && p.category?.toLowerCase() !== 'warrant').length} identified persons</span>
              <span className="font-mono">Page 1 of 1</span>
            </div>
          </TabsContent>

          {/* ═══════════════ SEARCH TAB ═══════════════ */}
          <TabsContent value="search" className="h-full m-0 flex flex-col gap-4">
            {/* ── Hero search panel ──────────────────────────────────────── */}
            <div
              className="relative rounded-2xl border border-amber-500/20 bg-zinc-900/40 overflow-hidden"
              style={{ background: 'radial-gradient(ellipse at top, rgba(245,158,11,0.08) 0%, rgba(15,15,20,0.6) 60%)' }}
            >
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <ScanFace className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Face Search</h3>
                    <p className="text-[10px] text-zinc-500">Drop or upload a photo — we'll match against the watchlist and every recorded sighting</p>
                  </div>
                </div>
                {(searchFile || searchPerformed) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-zinc-400 hover:text-white"
                    onClick={() => {
                      setSearchFile(null);
                      setSearchPreview(null);
                      setSearchResults([]);
                      setSearchPerformed(false);
                      setSelectedSearchDetection(null);
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>

              <div className={cn(
                "p-4 gap-4",
                (searchFile || searchLoading)
                  ? "flex flex-col"
                  : "flex flex-col items-center"
              )}>
                <div className={cn(
                  (searchFile || searchLoading)
                    ? "grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch w-full"
                    : "contents"
                )}>
                {/* Drop zone / preview */}
                <div
                  onClick={() => !searchLoading && document.getElementById('search-upload')?.click()}
                  onDragOver={(e) => { e.preventDefault(); if (!searchLoading) setSearchDragOver(true); }}
                  onDragLeave={() => setSearchDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSearchDragOver(false);
                    if (searchLoading) return;
                    const f = e.dataTransfer.files?.[0];
                    if (f) {
                      setSearchFile(f);
                      // Clear previous results on a fresh drop
                      setSearchResults([]);
                      setSearchPerformed(false);
                      setSelectedSearchDetection(null);
                      const reader = new FileReader();
                      reader.onloadend = () => setSearchPreview(reader.result as string);
                      reader.readAsDataURL(f);
                    }
                  }}
                  className={cn(
                    "relative rounded-2xl overflow-hidden cursor-pointer transition-all",
                    (searchFile || searchLoading)
                      ? "h-56 md:h-64"
                      : "w-full max-w-2xl h-56 md:h-64",
                    searchLoading
                      ? "border-2 border-amber-400/60"
                      : searchDragOver
                      ? "border-2 border-amber-400 bg-amber-500/10"
                      : searchPreview
                      ? "border-2 border-amber-500/30"
                      : "border-2 border-dashed border-amber-500/25 hover:border-amber-400/60 hover:bg-amber-500/[0.04]"
                  )}
                >
                  <input
                    id="search-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleSearchImageChange}
                  />

                  {searchPreview ? (
                    <>
                      <img
                        src={searchPreview}
                        alt=""
                        className={cn(
                          "absolute inset-0 w-full h-full object-contain bg-black transition-all duration-500",
                          searchLoading ? "brightness-90" : "brightness-100"
                        )}
                      />

                      {searchLoading && (
                        <>
                          {/* Vertical scan line */}
                          <div className="absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_18px_rgba(251,191,36,0.8)] animate-[scan_1.6s_ease-in-out_infinite]" />
                          {/* Corner brackets */}
                          {([['top-2 left-2','border-l-2 border-t-2'],['top-2 right-2','border-r-2 border-t-2'],['bottom-2 left-2','border-l-2 border-b-2'],['bottom-2 right-2','border-r-2 border-b-2']] as const).map(([pos, brd], i) => (
                            <div key={i} className={`absolute ${pos} w-7 h-7 ${brd} border-amber-400/80 rounded`} />
                          ))}
                          {/* Center pulse / radar */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="relative flex h-16 w-16">
                              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/15 animate-ping" />
                              <span className="absolute inline-flex h-3/4 w-3/4 m-auto inset-0 rounded-full bg-amber-400/10 animate-ping" style={{ animationDelay: '0.4s' }} />
                            </span>
                          </div>
                        </>
                      )}

                      {!searchLoading && (
                        <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/85 to-transparent">
                          <p className="text-[10px] text-zinc-300 truncate">{searchFile?.name}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: 'radial-gradient(circle at 30% 30%, rgba(245,158,11,0.25) 0%, rgba(217,119,6,0.15) 60%, transparent 100%)',
                          boxShadow: '0 0 30px rgba(245,158,11,0.18)',
                        }}
                      >
                        <ScanFace className="h-8 w-8 text-amber-300" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-white tracking-wide">Drop a face here</p>
                        <p className="text-[11px] text-zinc-400 mt-1">or click anywhere in this area to browse</p>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-zinc-500 uppercase tracking-[0.2em] mt-1">
                        <span className="h-px w-6 bg-amber-500/30" />
                        JPG · PNG · WEBP
                        <span className="h-px w-6 bg-amber-500/30" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Cycling face spotlight (during search) OR ready prompt
                    (after upload). Sits beside the uploaded face. */}
                {(searchFile || searchLoading) && (
                  <div className="rounded-2xl border border-amber-500/20 bg-black/20 h-56 md:h-64 flex items-center justify-center min-w-0 p-3">
                    {searchLoading ? (
                      <div className="relative h-full aspect-square rounded-2xl overflow-hidden border-2 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.45)]">
                        {searchCyclePool.length > 0 && searchCyclePool[searchCyclingIdx]?.url ? (
                          <img
                            key={searchCyclingIdx}
                            src={searchCyclePool[searchCyclingIdx].url}
                            alt=""
                            className="w-full h-full object-cover animate-[fade-in_0.1s_ease-out]"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                            <Users className="h-14 w-14 text-zinc-700" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_14px_rgba(251,191,36,0.9)] animate-[scan_1.4s_ease-in-out_infinite]" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center gap-3 px-6">
                        <div className="relative w-20 h-20 flex items-center justify-center">
                          <div className="absolute inset-0 border border-amber-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
                          <div className="absolute inset-2 border border-amber-500/30 rounded-full animate-[spin_4s_linear_infinite_reverse]" />
                          <div className="absolute inset-4 border-l-2 border-t-2 border-amber-400/70 rounded-full animate-[spin_2s_linear_infinite]" />
                          <ScanFace className="w-7 h-7 text-amber-400 relative" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white tracking-wide">Ready to identify</h4>
                          <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[240px] mt-1">
                            Tap search below to match across every face on file.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </div>

                {/* Search button — full-width row under the side-by-side */}
                {(searchFile || searchLoading) && (
                  <Button
                    onClick={handleSearchSubmit}
                    disabled={searchLoading || !searchFile}
                    className={cn(
                      "h-11 text-sm font-bold tracking-wide w-full",
                      "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black border-0 shadow-[0_0_18px_rgba(251,191,36,0.25)]"
                    )}
                  >
                    {searchLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> SCANNING…</>
                    ) : (
                      <><Search className="h-4 w-4 mr-2" /> SEARCH FACES</>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* ── Results section ──────────────────────────────────────── */}
            <div className="flex-1 min-h-0 rounded-2xl border border-white/5 bg-zinc-900/20 overflow-hidden">
              {searchResults.length > 0 ? (
                <div className="h-full overflow-y-auto p-5 space-y-5">
                  {/* Person matches */}
                  {searchResults.filter((r: any) => r.type === 'person').length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-3">
                        Identity Matches · {searchResults.filter((r: any) => r.type === 'person').length}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {searchResults.filter((r: any) => r.type === 'person').map((r: any) => (
                          <div
                            key={r.personId}
                            className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 flex gap-3"
                          >
                            <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-black shrink-0">
                              {r.faceImageUrl ? <img src={r.faceImageUrl} className="w-full h-full object-cover" alt="" /> : <Users className="w-8 h-8 m-6 text-zinc-600" />}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                              <div>
                                <p className="text-sm font-bold text-white truncate">{r.personName}</p>
                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                  {r.person?.category || 'Staff'} · {r.person?.threatLevel || 'Low'}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-2">
                                <div>
                                  <p className="text-lg font-black tabular-nums text-emerald-400 leading-none">{(r.similarity * 100).toFixed(0)}%</p>
                                  <p className="text-[8px] uppercase tracking-widest text-zinc-500 mt-0.5">match</p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                                  onClick={() => { const p = persons.find(pp => pp.id === r.personId); if (p) setSelectedPerson(p); }}
                                >
                                  Profile
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sightings */}
                  {searchResults.filter((r: any) => r.type === 'detection').length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-amber-300 uppercase tracking-[0.2em] mb-3">
                        Camera Sightings · {searchResults.filter((r: any) => r.type === 'detection').length}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {searchResults.filter((r: any) => r.type === 'detection').map((r: any, i: number) => {
                          const det = r.detection;
                          const frameUrl = det?.fullSnapshotUrl || det?.metadata?.images?.['frame.jpg'] || det?.faceSnapshotUrl || det?.metadata?.images?.['face_crop.jpg'];
                          const deviceName = det?.device?.name || det?.deviceId || '?';
                          const isKnown = !!det?.personId;
                          return (
                            <div
                              key={det?.id || i}
                              onClick={() => setSelectedSearchDetection(r)}
                              className="group relative rounded-xl overflow-hidden border border-white/10 bg-black cursor-pointer hover:border-amber-500/40 transition-all"
                            >
                              <div className="aspect-video bg-black relative">
                                {frameUrl ? (
                                  <img src={frameUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><Camera className="w-6 h-6 text-zinc-700" /></div>
                                )}
                                <div className="absolute top-1.5 left-1.5 flex gap-1">
                                  <Badge className={cn("text-[8px] border-0 font-black uppercase tracking-widest", isKnown ? "bg-emerald-500/80 text-black" : "bg-amber-500/80 text-black")}>
                                    {isKnown ? 'Known' : 'Unknown'}
                                  </Badge>
                                </div>
                                <div className="absolute top-1.5 right-1.5">
                                  <Badge className="bg-black/70 text-amber-300 border-amber-500/30 text-[9px] font-bold">
                                    {(r.similarity * 100).toFixed(0)}%
                                  </Badge>
                                </div>
                                <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/90 to-transparent">
                                  <p className="text-[10px] font-semibold text-white truncate">{deviceName}</p>
                                  <p className="text-[8px] text-zinc-400 truncate">{new Date(det?.timestamp).toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : searchPerformed ? (
                /* No-match empty state */
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10 gap-4">
                  {searchPreview && (
                    <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.25)]">
                      <img src={searchPreview} alt="" className="w-full h-full object-cover grayscale opacity-60" />
                      <div className="absolute inset-0 bg-rose-500/15" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <UserX className="w-10 h-10 text-rose-300" />
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-black text-rose-300 tracking-widest uppercase">
                      Face Not Found in Database
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-2 max-w-md">
                      This face does not match any enrolled person and has not been seen by any camera in the recorded sighting history.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                      onClick={() => goToTab('watchlist')}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Enroll to Watchlist
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] border-white/10 text-zinc-300 hover:bg-white/5"
                      onClick={() => {
                        setSearchFile(null);
                        setSearchPreview(null);
                        setSearchPerformed(false);
                      }}
                    >
                      Try Another Photo
                    </Button>
                  </div>
                </div>
              ) : (
                /* Initial empty state */
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10 gap-3 text-zinc-500">
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <div className="absolute inset-0 border border-amber-500/15 rounded-full animate-[spin_10s_linear_infinite]" />
                    <div className="absolute inset-3 border border-amber-500/25 rounded-full animate-[spin_4s_linear_infinite_reverse]" />
                    <div className="absolute inset-6 border-l-2 border-t-2 border-amber-400/50 rounded-full animate-[spin_2s_linear_infinite]" />
                    <ScanFace className="w-9 h-9 text-amber-400/70" />
                  </div>
                  <p className="text-sm text-white/80">Awaiting Face</p>
                  <p className="text-[11px] max-w-xs">Upload a photo above and we'll search across the watchlist and every recorded sighting.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════════════ SEARCH DETECTION DETAIL MODAL ═══════════════ */}
          <Dialog open={!!selectedSearchDetection} onOpenChange={(o) => !o && setSelectedSearchDetection(null)}>
            <DialogContent className="max-w-5xl border border-amber-500/20 bg-zinc-950/98 backdrop-blur-xl p-0 gap-0 overflow-hidden">
              {selectedSearchDetection && (() => {
                const det = selectedSearchDetection.detection || selectedSearchDetection;
                const frameUrl = det?.fullSnapshotUrl || det?.metadata?.images?.['frame.jpg'] || det?.faceSnapshotUrl || det?.metadata?.images?.['face_crop.jpg'];
                const faceUrl = det?.faceSnapshotUrl || det?.metadata?.images?.['face_crop.jpg'];
                const deviceName = det?.device?.name || det?.deviceId || '?';
                const isKnown = !!det?.personId;
                const personName = det?.person?.name || (isKnown ? 'Identified' : 'Unknown Person');
                const matchScore = (det as any)?.matchScore ?? (det as any)?.confidence ?? det?.metadata?.match_score;
                const sim = selectedSearchDetection.similarity;
                return (
                  <>
                    <DialogHeader className="px-5 py-3 pr-12 border-b border-white/5 flex-row items-center justify-between gap-3 space-y-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Badge className={cn(
                          "text-[9px] font-black uppercase tracking-widest border-0 shrink-0",
                          isKnown ? "bg-emerald-500/80 text-black" : "bg-amber-500/80 text-black"
                        )}>
                          {isKnown ? 'Known' : 'Unknown'}
                        </Badge>
                        <DialogTitle className="text-sm font-bold text-white truncate">{personName}</DialogTitle>
                      </div>
                      {typeof sim === 'number' && (
                        <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10">
                          <span className="text-sm font-black tabular-nums text-amber-300 leading-none">{(sim * 100).toFixed(0)}%</span>
                          <span className="text-[9px] uppercase tracking-widest text-amber-400/80 font-semibold">match</span>
                        </div>
                      )}
                    </DialogHeader>
                    <DialogDescription className="sr-only">Detection sighting details</DialogDescription>

                    {/* Big full-frame view */}
                    <div className="relative bg-black aspect-video w-full">
                      {frameUrl ? (
                        <img src={frameUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Camera className="w-16 h-16 text-zinc-700" /></div>
                      )}
                      <div className="absolute top-3 left-3">
                        <Badge className="bg-black/70 text-amber-300 border-amber-500/30 text-[10px] font-bold">
                          <Activity className="h-3 w-3 mr-1" /> {deviceName}
                        </Badge>
                      </div>
                      {faceUrl && (
                        <div className="absolute bottom-3 right-3 w-24 h-24 rounded-lg border-2 border-amber-400/60 overflow-hidden shadow-[0_0_20px_rgba(251,191,36,0.4)]">
                          <img src={faceUrl} className="w-full h-full object-cover" alt="" />
                          <div className="absolute bottom-0 inset-x-0 bg-black/70 text-amber-300 text-[8px] text-center font-black uppercase tracking-widest">Face</div>
                        </div>
                      )}
                    </div>

                    {/* Stats strip */}
                    {(() => {
                      const stats: Array<[string, string]> = [
                        ['Camera', deviceName],
                        ['Time', new Date(det?.timestamp).toLocaleString()],
                      ];
                      if (typeof matchScore === 'number' && matchScore > 0) {
                        stats.push(['Original match', `${Math.round(matchScore * 100)}%`]);
                      }
                      return (
                        <div className={cn(
                          "grid gap-px bg-white/5 border-t border-white/5",
                          stats.length === 3 ? "grid-cols-3" : "grid-cols-2"
                        )}>
                          {stats.map(([label, value]) => (
                            <div key={label} className="bg-zinc-950/90 px-4 py-2.5 text-center">
                              <p className="text-[8px] text-zinc-500 uppercase tracking-widest font-semibold">{label}</p>
                              <p className="text-xs font-bold text-zinc-100 mt-1 truncate">{value}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {isKnown && det?.personId && (
                      <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2 bg-zinc-950/95">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[10px] border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => {
                            const p = persons.find(pp => pp.id === det.personId);
                            if (p) {
                              setSelectedSearchDetection(null);
                              setSelectedPerson(p);
                              goToTab('watchlist');
                            }
                          }}
                        >
                          View Profile
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>

          {/* ═══════════════ PERSON EDIT MODAL ═══════════════ */}
          <Dialog open={showPersonEditModal} onOpenChange={setShowPersonEditModal}>
            <DialogContent className="max-w-2xl border border-white/5 bg-zinc-900/95 backdrop-blur-xl p-0 gap-0 overflow-hidden">
              <DialogHeader className="px-6 pt-5">
                <DialogTitle className="text-lg font-semibold text-zinc-100">Edit Person</DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 mt-1">Update details and save to the database.</DialogDescription>
              </DialogHeader>
              <div className="px-6 pb-6 pt-4 space-y-4">
                <div className="flex gap-4">
                  <div className="w-28 shrink-0">
                    <div className="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black">
                      <img src={editPreviews[0] || editPerson?.faceImageUrl} className="w-full h-full object-cover" alt="" />
                    </div>
                    <Label className="mt-2 text-[10px] text-muted-foreground block">Add Images</Label>
                    <input
                      id="edit-image-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleEditImageChange}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full mt-1 h-7 text-[10px] border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                      onClick={() => document.getElementById('edit-image-upload')?.click()}
                    >
                      <Upload className="h-3 w-3 mr-1.5" />
                      {editFiles.length > 0 ? `${editFiles.length} Selected` : 'Choose Files'}
                    </Button>

                    {/* Image Previews */}
                    {editPreviews.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        {editPreviews.map((preview, idx) => (
                          <div key={idx} className="aspect-square rounded overflow-hidden border border-white/10 bg-black relative group">
                            <img src={preview} className="w-full h-full object-cover" alt="" />
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                setEditFiles(prev => prev.filter((_, i) => i !== idx));
                                setEditPreviews(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-0.5 right-0.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Name</Label>
                      <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                    </div>
                    <div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Gender</Label>
                      <Input value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Threat Level</Label>
                      <Input value={editForm.threatLevel} onChange={(e) => setEditForm({ ...editForm, threatLevel: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</Label>
                      <Input value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Height</Label>
                      <Input value={editForm.height} onChange={(e) => setEditForm({ ...editForm, height: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Aliases</Label>
                      <Input value={editForm.aliases} onChange={(e) => setEditForm({ ...editForm, aliases: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</Label>
                      <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Notes</Label>
                  <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="h-8 mt-1 bg-black/30 border-white/10 text-xs" />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1 h-9 text-xs border-white/10 text-zinc-300 hover:bg-zinc-800" onClick={() => setShowPersonEditModal(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="flex-1 h-9 text-xs bg-amber-500 hover:bg-amber-600 text-white border border-amber-500" onClick={handleEditSave} disabled={editSaving}>
                    {editSaving ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* ═══════════════ ALERTS TAB ═══════════════ */}
          <TabsContent value="alerts" className="h-full m-0 flex flex-col gap-4">
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between bg-zinc-900/30 px-3 py-2 rounded-lg border border-white/5">
              <div className="flex items-center gap-4 text-[10px]">
                <span className="text-muted-foreground">Today: <span className="text-white font-semibold">{alertList.length}</span> matches</span>
                <span className="text-muted-foreground">Persons: <span className="text-white font-semibold">{alertsUniquePersons}</span></span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-400 font-medium">Auto-Refresh</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[9px] border-white/10 text-muted-foreground"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
                  {isExporting ? 'Exporting...' : 'Export'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[9px] border-white/10 text-muted-foreground" onClick={handleRefresh}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>
            </div>

            {/* 3-Column Alert Layout */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_340px_1fr] gap-3">
              {/* Alert List */}
              <Card className="flex flex-col border border-white/5 bg-zinc-900/30 overflow-hidden min-h-0">
                <div className="px-3 py-2.5 border-b border-white/5">
                  <h3 className="text-[10px] font-semibold text-white uppercase tracking-wider">Recent Alerts</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {alertList.length > 0 ? pagedAlerts.map((alert) => {
                    const isSelected = selectedAlert?.id === alert.id;
                    const personId = alert.metadata?.person_id;
                    const matchedPerson = personId ? persons.find(p => String(p.id) === String(personId)) : null;

                    // If personId exists, treat as known (unless explicitly marked otherwise)
                    // If no personId, it's definitely unknown even if is_known isn't false
                    const isKnown = alert.metadata?.is_known !== false && !!personId;

                    const displayName = isKnown ? (matchedPerson?.name || alert.metadata?.person_name || alert.title) : "Unknown Subject";
                    const borderColor = isKnown ? (matchedPerson?.threatLevel === 'High' ? 'border-red-500/50' : 'border-emerald-500/50') : 'border-zinc-700';
                    const bgColor = isKnown ? (matchedPerson?.threatLevel === 'High' ? 'bg-red-500/10' : 'bg-emerald-500/5') : 'bg-zinc-800/40';

                    return (
                      <div
                        key={alert.id}
                        onClick={() => setSelectedAlert(alert)}
                        className={cn(
                          "flex gap-2 p-2 rounded-lg cursor-pointer transition-all border",
                          isSelected ? "border-primary/50 bg-primary/10" : `${borderColor} ${bgColor} hover:bg-white/[0.05]`
                        )}
                      >
                        <div className="h-10 w-16 flex rounded overflow-hidden border border-white/10 shrink-0">
                          <div className="w-1/2 h-full bg-black border-r border-white/5 relative flex items-center justify-center">
                            {isKnown ? (
                              <img src={matchedPerson?.faceImageUrl || (alert as any).faceSnapshotUrl || alert.metadata?.images?.['face_crop.jpg'] || alert.metadata?.images?.['face.jpg']} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <Users className="h-4 w-4 text-muted-foreground/50" />
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[5px] text-center text-white/80 font-bold uppercase">{isKnown ? 'Ref' : '---'}</div>
                          </div>
                          <div className="w-1/2 h-full bg-black relative">
                            <img src={(alert as any).faceSnapshotUrl || alert.metadata?.images?.['face.jpg'] || alert.metadata?.images?.['frame.jpg']} className="w-full h-full object-cover" alt="" />
                            <div className="absolute inset-x-0 bottom-0 iris-cut-tag-base iris-cut-tag-default text-[5px] text-center text-white font-bold uppercase">Live</div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[10px] text-white truncate">{normalizeAlertTitle(displayName)}</p>
                          <p className="text-[8px] text-muted-foreground truncate">{(alert as any).device?.name || alert.deviceId || 'Primary Node'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {(() => {
                              const score =
                                (alert as any).matchScore ??
                                (alert as any).confidence ??
                                alert.metadata?.match_score ??
                                alert.metadata?.confidence;
                              return typeof score === 'number' ? (
                                <Badge className="h-3.5 px-1 text-[7px] bg-emerald-500/20 text-emerald-400 border-0 font-bold">
                                  {Math.round(score * 100)}%
                                </Badge>
                              ) : null;
                            })()}
                            <span className="text-[7px] text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground/30 text-[10px]">
                      No alerts
                    </div>
                  )}
                </div>
                {alertList.length > FRS_PAGE_SIZE && (
                  <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-white/5 text-[9px] text-muted-foreground">
                    <span>
                      {(safeAlertsPage - 1) * FRS_PAGE_SIZE + 1}–{Math.min(safeAlertsPage * FRS_PAGE_SIZE, alertList.length)} of {alertList.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] border-white/10"
                        disabled={safeAlertsPage <= 1}
                        onClick={() => setAlertsPage((p) => Math.max(1, p - 1))}>Prev</Button>
                      <span className="font-mono text-white">{safeAlertsPage}/{alertsTotalPages}</span>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] border-white/10"
                        disabled={safeAlertsPage >= alertsTotalPages}
                        onClick={() => setAlertsPage((p) => Math.min(alertsTotalPages, p + 1))}>Next</Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Subject Profile - Hidden on mobile, visible on xl */}
              <Card className="hidden xl:flex flex-col border border-white/5 bg-zinc-900/30 overflow-hidden min-h-0">
                <div className="px-3 py-2.5 border-b border-white/5">
                  <h3 className="text-[10px] font-semibold text-white uppercase tracking-wider">Subject Profile</h3>
                </div>
                {selectedAlert ? (() => {
                  const personId = selectedAlert.metadata?.person_id;
                  const matchedPerson = persons.find(p => p.id === personId);
                  return (
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      <div className="w-full aspect-square rounded-lg overflow-hidden border border-white/10 bg-black relative">
                        {matchedPerson?.faceImageUrl ? (
                          <img src={matchedPerson.faceImageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/20">
                            <Users className="h-12 w-12 mb-2" />
                            <p className="text-[9px] uppercase font-medium">No Photo</p>
                          </div>
                        )}
                        <div className="absolute top-2 left-2">
                          <Badge className="bg-black/60 backdrop-blur text-[8px] text-primary border-0">REFERENCE</Badge>
                        </div>
                      </div>

                      <div className="text-center">
                        <h2 className="text-base font-bold text-white">{matchedPerson?.name || 'Unknown Subject'}</h2>
                        <div className="flex gap-1.5 justify-center mt-2">
                          <ThreatBadge level={matchedPerson?.threatLevel} />
                          <CategoryBadge category={matchedPerson?.category} />
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        {[
                          ['Subject ID', matchedPerson?.id?.slice(0, 12) || 'N/A'],
                          ['Gender', formatMetadata(matchedPerson?.gender || selectedAlert.metadata?.gender)],
                        ].map(([label, value]) => (
                          <div key={label} className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                            <p className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</p>
                            <p className="text-xs text-white mt-0.5">{value}</p>
                          </div>
                        ))}
                      </div>

                      <Separator className="bg-white/5" />
                      <div className="space-y-1.5">
                        <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Detection</h4>
                        {[
                          ['Confidence', (() => {
                            const s = (selectedAlert as any).matchScore ?? (selectedAlert as any).confidence ?? selectedAlert.metadata?.match_score ?? selectedAlert.metadata?.confidence;
                            return typeof s === 'number' ? `${Math.round(s * 100)}%` : 'N/A';
                          })()],
                          ['Timestamp', new Date(selectedAlert.timestamp).toLocaleString()],
                          ['Source', (selectedAlert as any).device?.name || selectedAlert.deviceId || 'Primary Node'],
                          ['Track ID', selectedAlert.metadata?.track_id || 'N/A'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="text-white font-medium">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground/30 p-4">
                    <p className="text-[10px]">Select an alert to view details</p>
                  </div>
                )}
              </Card>

              {/* Surveillance View */}
              <div className="flex flex-col min-h-0 gap-3">
                <Card className="flex-1 overflow-hidden border border-white/5 bg-black relative min-h-[200px]">
                  {selectedAlert ? (
                    <>
                      <img
                        src={
                          (selectedAlert as any).fullSnapshotUrl ||
                          selectedAlert.metadata?.images?.['frame.jpg'] ||
                          (selectedAlert as any).faceSnapshotUrl ||
                          selectedAlert.metadata?.images?.['face_crop.jpg']
                        }
                        className="w-full h-full object-contain bg-black"
                        alt=""
                      />
                      <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                        <Badge className="bg-black/70 backdrop-blur text-white text-[9px] px-2 py-0.5 font-mono border-0">
                          {new Date(selectedAlert.timestamp).toLocaleString()}
                        </Badge>
                        {(() => {
                          const s = (selectedAlert as any).matchScore ?? (selectedAlert as any).confidence ?? selectedAlert.metadata?.match_score ?? selectedAlert.metadata?.confidence;
                          return typeof s === 'number' ? (
                            <Badge className="bg-emerald-600/90 text-white text-[9px] px-2 py-0.5 font-bold border-0">
                              {Math.round(s * 100)}% MATCH
                            </Badge>
                          ) : null;
                        })()}
                      </div>
                      <div className="absolute bottom-3 left-3">
                        <Badge className="bg-black/60 backdrop-blur text-primary text-[9px] px-2 py-0.5 border-0 font-medium">
                          <Activity className="h-3 w-3 mr-1 animate-pulse" /> {(selectedAlert as any).device?.name || selectedAlert.deviceId || 'Primary Feed'}
                        </Badge>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                      <div className="text-center">
                        <Monitor className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-[10px]">No surveillance feed</p>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Detection Metadata */}
                <Card className="shrink-0 border border-white/5 bg-zinc-900/30">
                  <div className="px-3 py-2 border-b border-white/5">
                    <h3 className="text-[10px] font-semibold text-white uppercase tracking-wider">Detection Metadata</h3>
                  </div>
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                    {[
                      ['Gender', formatMetadata(selectedAlert?.metadata?.gender)],
                      ['Mask', selectedAlert?.metadata?.mask === 'yes' ? 'Detected' : 'None'],
                      ['Face Quality', typeof selectedAlert?.metadata?.quality_score === 'number' ? `${Math.round(selectedAlert.metadata.quality_score * 100)}%` : 'N/A'],
                      ['Track ID', selectedAlert?.metadata?.track_id || 'N/A'],
                      ['Quality', selectedAlert?.metadata?.quality_score?.toFixed(2) || 'N/A'],
                    ].map(([label, value]) => (
                      <div key={label} className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                        <p className="text-[8px] text-muted-foreground uppercase">{label}</p>
                        <p className="text-[10px] text-white mt-0.5 font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════ UNKNOWN FACES TAB ═══════════════ */}
          <TabsContent value="unknown" className="h-full m-0 flex flex-col gap-4">
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between bg-zinc-900/30 px-3 py-2 rounded-lg border border-white/5">
              <div className="flex items-center gap-4 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <UserX className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-white font-semibold">Unknown Faces</span>
                </div>
                <span className="text-muted-foreground">Today: <span className="text-white font-semibold">{unknownFaces.length}</span></span>
                <span className="text-muted-foreground">Cameras: <span className="text-white font-semibold">{unknownUniqueCameras}</span></span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-400 font-medium">Auto-Refresh</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-[9px] border-white/10 text-muted-foreground" onClick={fetchUnknownFaces} disabled={loadingUnknown}>
                {loadingUnknown ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Refresh
              </Button>
            </div>

            {/* Content: List + Detail Split */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
              {/* Face List */}
              <Card className="flex flex-col border border-white/5 bg-zinc-900/30 overflow-hidden min-h-0">
                <div className="px-3 py-2.5 border-b border-white/5">
                  <h3 className="text-[10px] font-semibold text-white uppercase tracking-wider">Detected Faces</h3>
                  <p className="text-[8px] text-muted-foreground mt-0.5">Faces not matching any watchlist entry</p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {unknownFaces.length > 0 ? pagedUnknown.map((face) => {
                    const isSelected = selectedUnknown?.id === face.id;
                    const faceImg = face.faceSnapshotUrl || face.metadata?.images?.['face.jpg'];
                    const cropImg = face.metadata?.images?.['face_crop.jpg'];

                    return (
                      <div
                        key={face.id}
                        onClick={() => setSelectedUnknown(face)}
                        className={cn(
                          "flex gap-2.5 p-2 rounded-lg cursor-pointer transition-all border",
                          isSelected ? "border-amber-500/30 bg-amber-500/5" : "border-transparent hover:bg-white/[0.03]"
                        )}
                      >
                        <div className="h-11 w-11 rounded-md overflow-hidden border border-white/10 bg-black shrink-0">
                          <img src={faceImg || cropImg} className="w-full h-full object-contain bg-black" alt="" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-[10px] text-white truncate">Unknown Person</p>
                            <span className="text-[8px] font-mono text-muted-foreground shrink-0">#{face.id}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge className="h-3.5 px-1 text-[7px] bg-amber-500/20 text-amber-400 border-0 font-bold">
                              {Math.round((face.confidence || 0) * 100)}% conf
                            </Badge>
                            {face.metadata?.gender && (
                              <Badge className="h-3.5 px-1 text-[7px] bg-white/5 text-muted-foreground border-0">
                                {formatMetadata(face.metadata.gender)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[8px] text-muted-foreground truncate mt-0.5">
                            {new Date(face.timestamp).toLocaleTimeString()}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-5 text-[8px] mt-1 w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUnknownForConversion(face);
                              setShowConvertUnknownDialog(true);
                            }}
                          >
                            <UserCheck className="h-2.5 w-2.5 mr-1" />
                            Mark as Known
                          </Button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
                      <UserX className="h-8 w-8 mb-2" />
                      <p className="text-[10px] font-medium">No unknown faces detected</p>
                    </div>
                  )}
                </div>
                {unknownFaces.length > FRS_PAGE_SIZE && (
                  <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-white/5 text-[9px] text-muted-foreground">
                    <span>
                      {(safeUnknownPage - 1) * FRS_PAGE_SIZE + 1}–{Math.min(safeUnknownPage * FRS_PAGE_SIZE, unknownFaces.length)} of {unknownFaces.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] border-white/10"
                        disabled={safeUnknownPage <= 1}
                        onClick={() => setUnknownPage((p) => Math.max(1, p - 1))}>Prev</Button>
                      <span className="font-mono text-white">{safeUnknownPage}/{unknownTotalPages}</span>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] border-white/10"
                        disabled={safeUnknownPage >= unknownTotalPages}
                        onClick={() => setUnknownPage((p) => Math.min(unknownTotalPages, p + 1))}>Next</Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Detail View */}
              <div className="flex flex-col min-h-0 gap-3">
                <Card className="flex-1 overflow-hidden border border-white/5 bg-black relative min-h-[200px]">
                  {selectedUnknown ? (
                    <>
                      <img
                        src={
                          (selectedUnknown as any).fullSnapshotUrl ||
                          selectedUnknown.metadata?.images?.['frame.jpg'] ||
                          selectedUnknown.faceSnapshotUrl ||
                          selectedUnknown.metadata?.images?.['face_crop.jpg']
                        }
                        className="w-full h-full object-contain bg-black"
                        alt=""
                      />
                      <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                        <Badge className="bg-black/70 backdrop-blur text-white text-[9px] px-2 py-0.5 font-mono border-0">
                          {new Date(selectedUnknown.timestamp).toLocaleString()}
                        </Badge>
                        <Badge className="bg-amber-600/90 text-white text-[9px] px-2 py-0.5 font-bold border-0">
                          UNKNOWN
                        </Badge>
                      </div>
                      <div className="absolute bottom-3 left-3">
                        <Badge className="bg-black/60 backdrop-blur text-amber-400 text-[9px] px-2 py-0.5 border-0 font-medium">
                          <Camera className="h-3 w-3 mr-1" /> {selectedUnknown.device?.name || selectedUnknown.deviceId || 'Unknown Source'}
                        </Badge>
                      </div>
                      {/* Face crop overlay */}
                      {selectedUnknown.metadata?.images?.['face_crop.jpg'] && (
                        <div className="absolute top-3 left-3">
                          <div className="h-16 w-16 rounded-lg overflow-hidden border-2 border-amber-500/50 bg-black shadow-lg">
                            <img src={selectedUnknown.metadata.images['face_crop.jpg']} className="w-full h-full object-cover" alt="" />
                          </div>
                          <p className="text-[7px] text-amber-400 font-bold mt-1 text-center">FACE CROP</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                      <div className="text-center">
                        <UserX className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-[10px]">Select a face to view details</p>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Metadata */}
                <Card className="shrink-0 border border-white/5 bg-zinc-900/30">
                  <div className="px-3 py-2 border-b border-white/5">
                    <h3 className="text-[10px] font-semibold text-white uppercase tracking-wider">Detection Metadata</h3>
                  </div>
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                    {[
                      ['Gender', formatMetadata(selectedUnknown?.metadata?.gender)],
                      ['Confidence', selectedUnknown ? `${Math.round((selectedUnknown.confidence || 0) * 100)}%` : 'N/A'],
                      ['Face Quality', selectedUnknown?.metadata?.quality_score ? `${Math.round(selectedUnknown.metadata.quality_score * 100)}%` : 'N/A'],
                      ['Source', selectedUnknown?.device?.name || selectedUnknown?.deviceId || 'N/A'],
                      ['Detection', selectedUnknown?.metadata?.detection_reason || 'N/A'],
                    ].map(([label, value]) => (
                      <div key={label} className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                        <p className="text-[8px] text-muted-foreground uppercase">{label}</p>
                        <p className="text-[10px] text-white mt-0.5 font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* ═══════════════ MATCH DETAILS MODAL ═══════════════ */}
      <Dialog open={showMatchModal} onOpenChange={setShowMatchModal}>
        <DialogContent className="max-w-5xl border border-white/5 bg-zinc-900/95 backdrop-blur-xl p-0 gap-0 [&>button]:z-[90] [&>button]:bg-black/80 [&>button]:rounded-full [&>button]:border [&>button]:border-white/20 [&>button]:text-white">
          <DialogHeader className="sr-only">
            <DialogTitle>Face Match Details</DialogTitle>
            <DialogDescription>Match confidence and person details</DialogDescription>
          </DialogHeader>
          {selectedMatch && (() => {
            const matchPerson = persons.find(p =>
              p.id === (selectedMatch as any).person?.id ||
              p.id === (selectedMatch as any).personId ||
              p.id === selectedMatch.metadata?.person_id
            );
            return (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] border-b border-white/5">
                  {/* Left panel: reference + metadata */}
                  <div className="p-4 border-b lg:border-b-0 lg:border-r border-white/5 space-y-4">
                    <div>
                      <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Reference</p>
                      <div className="aspect-square rounded-lg overflow-hidden bg-black border border-white/5">
                        {matchPerson?.faceImageUrl || (selectedMatch as any).person?.faceImageUrl ? (
                          <img src={matchPerson?.faceImageUrl || (selectedMatch as any).person?.faceImageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700"><Users className="h-10 w-10" /></div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/5 bg-black/20 divide-y divide-white/5">
                      {[
                        ['Source Node', (selectedMatch as any).device?.name || selectedMatch.deviceId || 'Primary Node'],
                        ['Track ID', (selectedMatch as any).metadata?.track_id || (selectedMatch as any).metadata?.trackId || selectedMatch.id || 'N/A'],
                        ['Gender', formatMetadata(matchPerson?.gender || (selectedMatch as any).person?.gender || selectedMatch.metadata?.gender)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between px-3 py-2">
                          <span className="text-[10px] text-zinc-500">{label}</span>
                          <span className="text-[10px] text-zinc-200 font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right panel: live capture */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-100">
                          {normalizeAlertTitle(matchPerson?.name || (selectedMatch as any).person?.name || selectedMatch.metadata?.person_name || selectedMatch.title)}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                          {new Date(selectedMatch.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="relative rounded-xl overflow-hidden bg-black border border-white/5">
                      <img
                        src={
                          (selectedMatch as any).fullSnapshotUrl ||
                          selectedMatch.metadata?.images?.['frame.jpg'] ||
                          (selectedMatch as any).faceSnapshotUrl ||
                          selectedMatch.metadata?.images?.['face_crop.jpg']
                        }
                        className="w-full h-[45vh] max-h-[520px] object-contain bg-black"
                        alt=""
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-white/5 space-y-3">
                  {/* Multi-Image Upload Section */}
                  {matchPerson && (
                    <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="text-xs font-semibold text-white">Add to Gallery</h4>
                          <p className="text-[9px] text-muted-foreground mt-0.5">Upload additional images to improve matching accuracy</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <input
                          id="match-modal-upload"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleMatchModalImageChange}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-[10px] border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                          onClick={() => document.getElementById('match-modal-upload')?.click()}
                        >
                          <Upload className="h-3 w-3 mr-1.5" />
                          {matchModalFiles.length > 0 ? `${matchModalFiles.length} Selected` : 'Choose Images'}
                        </Button>

                        {matchModalFiles.length > 0 && (
                          <Button
                            size="sm"
                            className="h-8 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white"
                            onClick={handleMatchModalAddToGallery}
                            disabled={isAddingToGallery}
                          >
                            {isAddingToGallery ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                Adding...
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1.5" />
                                Add to Gallery
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Image Previews */}
                      {matchModalPreviews.length > 0 && (
                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {matchModalPreviews.map((preview, idx) => (
                            <div key={idx} className="aspect-square rounded overflow-hidden border border-white/10 bg-black relative group">
                              <img src={preview} className="w-full h-full object-cover" alt="" />
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  setMatchModalFiles(prev => prev.filter((_, i) => i !== idx));
                                  setMatchModalPreviews(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="absolute top-0.5 right-0.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-xs border-white/10 text-zinc-300 hover:bg-zinc-800"
                      onClick={() => setShowMatchModal(false)}
                    >
                      Close
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-9 text-xs bg-amber-500 hover:bg-amber-600 text-white border border-amber-500"
                      onClick={() => {
                        if (matchPerson) {
                          setSelectedPerson(matchPerson);
                          goToTab('watchlist');
                          setShowMatchModal(false);
                        } else {
                          toast({ title: "No Profile", description: "Person not in registry.", variant: "destructive" });
                        }
                      }}
                    >
                      View Profile
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══════════════ PERSON PROFILE MODAL ═══════════════ */}
      <Dialog open={!!selectedPerson} onOpenChange={(open) => !open && setSelectedPerson(null)}>
        <DialogContent className="max-w-4xl border border-white/5 bg-zinc-900/95 backdrop-blur-xl p-0 gap-0 overflow-hidden max-h-[85vh] [&>button]:z-[90] [&>button]:bg-black/80 [&>button]:rounded-full [&>button]:border [&>button]:border-white/20 [&>button]:text-white">
          <DialogHeader className="sr-only">
            <DialogTitle>Person Profile</DialogTitle>
            <DialogDescription>Profile details and match history</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col lg:flex-row h-full max-h-[85vh]">
            {/* Left Panel - Profile */}
            <div className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col overflow-y-auto">
              {/* Photo */}
              <div className="aspect-square relative bg-black shrink-0">
                <img src={selectedPerson?.faceImageUrl} className="w-full h-full object-cover" alt="" />
              </div>

              {/* Info */}
              <div className="p-4 space-y-4 flex-1">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">{selectedPerson?.name}</h2>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">{selectedPerson?.id?.slice(0, 12)}</p>
                </div>

                <div className="rounded-lg border border-white/5 bg-black/20 divide-y divide-white/5">
                  {[
                    ['Category', selectedPerson?.category === 'Warrant' ? 'Wanted' : selectedPerson?.category || 'N/A'],
                    ['Threat', selectedPerson?.threatLevel || 'Medium'],
                    ['Gender', selectedPerson?.gender || '—'],
                    ['Height', selectedPerson?.height || '—'],
                    ['Status', selectedPerson?.status || selectedPerson?.category || '—'],
                    ['Aliases', selectedPerson?.aliases || 'None'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-zinc-500">{label}</span>
                      <span className={cn(
                        "text-xs font-medium",
                        label === 'Threat' && String(value).toLowerCase() === 'high' ? "text-red-400" :
                          label === 'Threat' && String(value).toLowerCase() === 'medium' ? "text-amber-400" :
                            "text-zinc-200"
                      )}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Image Gallery Section */}
                <div className="border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-white">
                      Image Gallery
                      {personGalleryImages.length > 0 && (
                        <Badge className="ml-2 h-4 text-[8px] bg-amber-500/20 text-amber-400 border-0">
                          {personGalleryImages.length}
                        </Badge>
                      )}
                    </h3>
                  </div>

                  {loadingGallery ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : personGalleryImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {personGalleryImages.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded overflow-hidden border border-white/10 bg-black">
                          <img src={img} className="w-full h-full object-cover" alt="" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-[10px] text-muted-foreground">
                      <p>No additional images</p>
                      <p className="mt-1">Use "Add to Gallery" to upload more</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs border-white/10 text-zinc-400 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5"
                    onClick={(e) => { if (selectedPerson) handleDeletePerson(selectedPerson.id, e); }}
                  >
                    <Trash className="h-3 w-3 mr-1.5" /> Delete
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800">
                    <Edit className="h-3 w-3 mr-1.5" /> Edit
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Panel - Detections */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {/* Latest Surveillance Frame */}
              <div className="h-44 lg:h-[42%] shrink-0 relative bg-black border-b border-white/5">
                {personHistory.length > 0 ? (() => {
                  const sel = personHistory[selectedHistoryIdx] || personHistory[0];
                  const selFace = (sel as any)?.faceSnapshotUrl || sel?.metadata?.images?.['face_crop.jpg'];
                  const selFrame =
                    (sel as any)?.fullSnapshotUrl ||
                    sel?.metadata?.images?.['frame.jpg'] ||
                    selFace;
                  const selDevice = (sel as any)?.device?.name || (sel as any)?.deviceId || '';
                  const selScore =
                    (sel as any)?.matchScore ??
                    (sel as any)?.confidence ??
                    sel?.metadata?.match_score ??
                    sel?.metadata?.confidence;
                  return (
                  <>
                    <img
                      src={selFrame}
                      className="w-full h-full object-contain bg-black"
                      alt=""
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                      <span className="bg-black/70 backdrop-blur-sm text-zinc-300 text-[10px] px-2 py-0.5 rounded font-mono">
                        {new Date(sel.timestamp).toLocaleString()}
                      </span>
                      {typeof selScore === 'number' && (
                        <span className="bg-black/70 backdrop-blur-sm text-zinc-300 text-[10px] px-2 py-0.5 rounded font-medium">
                          {Math.round(selScore * 100)}% match
                        </span>
                      )}
                    </div>
                    {selDevice && (
                      <div className="absolute top-2 left-2">
                        <span className="bg-black/70 backdrop-blur-sm text-amber-300 text-[10px] px-2 py-0.5 rounded">{selDevice}</span>
                      </div>
                    )}
                    {selFace && selFrame && (
                      <div className="absolute bottom-2 right-2 w-14 h-14 rounded-lg border-2 border-white/30 overflow-hidden shadow-lg">
                        <img src={selFace} className="w-full h-full object-cover" alt="" />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-zinc-300 text-[9px] px-2 py-0.5 rounded">
                      {selectedHistoryIdx + 1} / {personHistory.length}
                    </div>
                  </>
                  );
                })() : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700">
                    <div className="text-center">
                      <Monitor className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-xs text-zinc-600">No recognition yet</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Match History Grid */}
              <div className="flex-1 overflow-hidden flex flex-col p-3">
                <div className="flex items-center justify-between mb-2.5">
                  {personHistory.length > 0 ? (
                    <p className="text-xs text-zinc-400">
                      <span className="text-zinc-100 font-medium">{personHistory.length}</span> detection{personHistory.length !== 1 ? 's' : ''} found
                    </p>
                  ) : (
                    <div className="w-full rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                      <p className="text-[10px] text-amber-300 font-medium">No recognitions yet</p>
                      <p className="text-[9px] text-amber-400/80">This person has not matched any detections.</p>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {personHistory.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                      {personHistory.map((match, idx) => (
                        <div key={idx} className="relative group cursor-pointer" onClick={() => setSelectedHistoryIdx(idx)}>
                          <div className={cn(
                            "aspect-video rounded overflow-hidden bg-black border transition-all",
                            selectedHistoryIdx === idx ? "border-primary ring-1 ring-primary/30" : "border-white/5"
                          )}>
                            <img
                              src={(match as any)?.faceSnapshotUrl || match.metadata?.images?.['face_crop.jpg'] || (match as any)?.fullSnapshotUrl || match.metadata?.images?.['frame.jpg']}
                              className={cn("w-full h-full object-cover transition-all", selectedHistoryIdx === idx ? "brightness-110" : "group-hover:brightness-110")}
                              alt=""
                            />
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-0.5 pt-3 rounded-b">
                            <div className="flex items-center justify-between">
                              <span className="text-[7px] text-zinc-400 font-mono">
                                {new Date(match.timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                              </span>
                              {(() => {
                                const s = (match as any).matchScore ?? (match as any).confidence ?? match.metadata?.match_score ?? match.metadata?.confidence;
                                return typeof s === 'number' ? (
                                  <span className="text-[7px] text-zinc-300 font-medium">
                                    {Math.round(s * 100)}%
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-xs">
                      No recognition history yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ ENROLL PERSON DIALOG ═══════════════ */}
      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="max-w-md border border-white/5 bg-zinc-900/95 backdrop-blur-xl p-6 gap-0">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-semibold text-zinc-100">Enroll Person</DialogTitle>
            <DialogDescription className="text-sm text-zinc-500 mt-1">Add a new person to the watchlist database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Photos * <span className="text-xs text-zinc-500">(Multiple angles recommended)</span></label>
              <div
                onClick={() => document.getElementById('enroll-upload')?.click()}
                className="border border-dashed border-white/10 rounded-lg p-5 text-center cursor-pointer hover:bg-black/20 transition-colors"
              >
                <Upload className="h-5 w-5 mx-auto mb-2 text-zinc-600" />
                <p className="text-sm text-zinc-400">
                  {enrollFiles.length > 0 ? `${enrollFiles.length} image(s) selected` : (enrollFile ? enrollFile.name : 'Click to select facial images')}
                </p>
                <p className="text-xs text-zinc-600 mt-1">Upload frontal, left & right profiles for best accuracy</p>
              </div>
              <input
                id="enroll-upload"
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setEnrollFiles(files);
                  if (files.length > 0) setEnrollFile(files[0]);
                }}
              />
              {enrollFiles.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {enrollFiles.map((file, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={URL.createObjectURL(file)}
                        className="w-full aspect-square object-cover rounded border border-white/10"
                        alt={`Preview ${i + 1}`}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEnrollFiles(prev => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Name *</label>
              <Input
                value={enrollForm.name}
                onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })}
                placeholder="Full name"
                className="h-9 bg-black/20 border-white/10 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Category</label>
                <select
                  value={enrollForm.category}
                  onChange={(e) => setEnrollForm({ ...enrollForm, category: e.target.value })}
                  className="h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="">Select...</option>
                  <option value="Warrant">Warrant</option>
                  <option value="VIP">VIP</option>
                  <option value="Staff">Staff</option>
                  <option value="Blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Threat Level</label>
                <select
                  value={enrollForm.threatLevel}
                  onChange={(e) => setEnrollForm({ ...enrollForm, threatLevel: e.target.value })}
                  className="h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="">Select...</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Age</label>
                <Input
                  placeholder="e.g. 35"
                  type="number"
                  className="h-9 bg-black/20 border-white/10 text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Gender</label>
                <select
                  value={enrollForm.gender}
                  onChange={(e) => setEnrollForm({ ...enrollForm, gender: e.target.value })}
                  className="h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Height</label>
                <Input
                  value={enrollForm.height}
                  onChange={(e) => setEnrollForm({ ...enrollForm, height: e.target.value })}
                  placeholder='e.g. 5&apos;10"'
                  className="h-9 bg-black/20 border-white/10 text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Notes</label>
              <Input
                value={enrollForm.notes}
                onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })}
                placeholder="Additional notes"
                className="h-9 bg-black/20 border-white/10 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/10 bg-black/20 cursor-pointer hover:bg-white/[0.04] transition-colors">
              <input
                type="checkbox"
                checked={enrollForm.addToWatchlist}
                onChange={(e) => setEnrollForm({ ...enrollForm, addToWatchlist: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-black/40 text-red-500 focus:ring-red-500/30"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-zinc-200">Add to Active Watchlist</span>
                <p className="text-[10px] text-zinc-500 mt-0.5">Auto-sets category to Suspect & threat level High</p>
              </div>
              <AlertTriangle className={cn("h-4 w-4 transition-colors", enrollForm.addToWatchlist ? "text-red-400" : "text-zinc-700")} />
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setShowEnrollDialog(false)}
                className="h-9 text-sm border-white/10 text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEnroll}
                disabled={isUploading || !enrollForm.name || (!enrollFile && enrollFiles.length === 0)}
                className="h-9 text-sm bg-amber-500 hover:bg-amber-600 text-white border border-amber-500"
              >
                {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enroll
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ CONVERT UNKNOWN TO PERSON DIALOG ═══════════════ */}
      <Dialog open={showConvertUnknownDialog} onOpenChange={setShowConvertUnknownDialog}>
        <DialogContent className="max-w-2xl border border-white/5 bg-zinc-900/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Mark as Known Person</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {conversionMode === 'create' ? 'Add details to identify this person and create a profile' : 'Link this face to an existing person in the database'}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-zinc-900/60 rounded-lg border border-white/5">
            <button
              className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${conversionMode === 'create'
                ? 'bg-emerald-500 text-white'
                : 'text-muted-foreground hover:text-white'
                }`}
              onClick={() => setConversionMode('create')}
            >
              Create New Person
            </button>
            <button
              className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${conversionMode === 'link'
                ? 'bg-amber-500 text-white'
                : 'text-muted-foreground hover:text-white'
                }`}
              onClick={() => setConversionMode('link')}
            >
              Link to Existing
            </button>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-4">
            {/* Face Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Face</Label>
              <div className="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black">
                {selectedUnknownForConversion && (
                  <img
                    src={getBestFaceImageUrl(selectedUnknownForConversion)}
                    className="w-full h-full object-contain bg-black"
                    alt=""
                  />
                )}
              </div>
            </div>

            {/* Form Fields - Conditional based on mode */}
            {conversionMode === 'link' ? (
              /* Link Mode: Person Selector */
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Select Person</Label>
                  <select
                    className="w-full h-9 text-xs bg-zinc-900/60 border border-white/5 rounded-md px-3 text-white mt-1"
                    value={selectedPersonForLink?.id || ''}
                    onChange={(e) => {
                      const person = persons.find(p => p.id === e.target.value);
                      setSelectedPersonForLink(person || null);
                    }}
                  >
                    <option value="">-- Select a person --</option>
                    {persons.map(person => (
                      <option key={person.id} value={person.id}>
                        {person.name} ({person.category})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Person Preview */}
                {selectedPersonForLink && (
                  <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-3">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 rounded overflow-hidden border border-white/10 bg-black shrink-0">
                        <img src={selectedPersonForLink.faceImageUrl} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{selectedPersonForLink.name}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge className="h-4 text-[8px]">{selectedPersonForLink.category}</Badge>
                          <Badge className="h-4 text-[8px]">{selectedPersonForLink.threatLevel}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {selectedPersonForLink.gender && `Gender: ${selectedPersonForLink.gender}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Create Mode: Form Fields */
              <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    placeholder="Enter full name"
                    className="h-9 text-xs bg-zinc-900/60 border-white/5 mt-1"
                    value={convertForm.name}
                    onChange={(e) => setConvertForm({ ...convertForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <Label className="text-xs">Category</Label>
                  <select
                    className="w-full h-9 text-xs bg-zinc-900/60 border border-white/5 rounded-md px-3 text-white mt-1"
                    value={convertForm.category}
                    onChange={(e) => setConvertForm({ ...convertForm, category: e.target.value })}
                  >
                    <option value="person_of_interest">Person of Interest</option>
                    <option value="suspect">Suspect</option>
                    <option value="witness">Witness</option>
                    <option value="victim">Victim</option>
                    <option value="warrant">Warrant</option>
                    <option value="cleared">Cleared</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs">Threat Level</Label>
                  <select
                    className="w-full h-9 text-xs bg-zinc-900/60 border border-white/5 rounded-md px-3 text-white mt-1"
                    value={convertForm.threatLevel}
                    onChange={(e) => setConvertForm({ ...convertForm, threatLevel: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <Input
                    placeholder="e.g., 25-30"
                    className="h-9 text-xs bg-zinc-900/60 border-white/5 mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Gender</Label>
                  <select
                    className="w-full h-9 text-xs bg-zinc-900/60 border border-white/5 rounded-md px-3 text-white mt-1"
                    value={convertForm.gender}
                    onChange={(e) => setConvertForm({ ...convertForm, gender: e.target.value })}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Height</Label>
                  <Input
                    placeholder="e.g., 5'10 or 178cm"
                    className="h-9 text-xs bg-zinc-900/60 border-white/5 mt-1"
                    value={convertForm.height}
                    onChange={(e) => setConvertForm({ ...convertForm, height: e.target.value })}
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Aliases</Label>
                  <Input
                    placeholder="Comma-separated aliases"
                    className="h-9 text-xs bg-zinc-900/60 border-white/5 mt-1"
                    value={convertForm.aliases}
                    onChange={(e) => setConvertForm({ ...convertForm, aliases: e.target.value })}
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Notes</Label>
                  <textarea
                    placeholder="Additional information..."
                    className="w-full h-20 text-xs bg-zinc-900/60 border border-white/5 rounded-md px-3 py-2 text-white mt-1 resize-none"
                    value={convertForm.notes}
                    onChange={(e) => setConvertForm({ ...convertForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/10 bg-black/20 cursor-pointer hover:bg-white/[0.04] transition-colors mt-3">
                <input
                  type="checkbox"
                  checked={convertForm.addToWatchlist}
                  onChange={(e) => setConvertForm({ ...convertForm, addToWatchlist: e.target.checked })}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 text-red-500 focus:ring-red-500/30"
                />
                <div className="flex-1">
                  <span className="text-xs font-medium text-zinc-200">Add to Active Watchlist</span>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Auto-sets category to Suspect & threat level High</p>
                </div>
                <AlertTriangle className={cn("h-4 w-4 transition-colors", convertForm.addToWatchlist ? "text-red-400" : "text-zinc-700")} />
              </label>
              </>
            )}
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs border-white/10"
              onClick={() => {
                setShowConvertUnknownDialog(false);
                setSelectedUnknownForConversion(null);
              }}
              disabled={isConverting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className={`h-9 text-xs ${conversionMode === 'link' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
              onClick={conversionMode === 'link' ? handleLinkUnknownToPerson : handleConvertUnknownToPerson}
              disabled={isConverting || (conversionMode === 'create' ? !convertForm.name : !selectedPersonForLink)}
            >
              {isConverting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  {conversionMode === 'link' ? 'Linking...' : 'Creating...'}
                </>
              ) : (
                <>
                  <UserCheck className="h-3 w-3 mr-1.5" />
                  {conversionMode === 'link' ? 'Link & Add to Gallery' : 'Create Person Profile'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
