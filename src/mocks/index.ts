// Mock API layer for Phase 1 (frontend-first, no backend).
// Toggle with VITE_USE_MOCK="false" once the real backend is wired (Phase 2).
// The ApiClient routes every request() / login() through here when USE_MOCK is on.

export const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK ?? 'true').toString() !== 'false';

// ----- deterministic PRNG so fixtures (and screenshots) are stable across reloads -----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260608);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + rnd() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const isoAgo = (minutes: number) =>
  new Date(Date.UTC(2026, 5, 8, 12, 0, 0) - minutes * 60_000).toISOString();

// tiny inline SVG placeholder so <img> tags don't 404 in mock mode
export const placeholderImg = (label: string, accent = '#f59e0b') =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>` +
      `<rect width='100%' height='100%' fill='#0f172a'/>` +
      `<rect x='6' y='6' width='308' height='168' fill='none' stroke='${accent}' stroke-opacity='0.4'/>` +
      `<text x='50%' y='50%' fill='${accent}' font-family='monospace' font-size='14' text-anchor='middle' dominant-baseline='middle'>${label}</text>` +
      `</svg>`,
  );

// ----- IRIS camera locations -----
const VJA = { lat: 16.5062, lng: 80.648 };
const LOCATIONS = [
  'Benz Circle', 'Kanaka Durga Temple', 'PNBS Bus Station', 'Prakasam Barrage',
  'MG Road Junction', 'Eluru Road', 'Governorpet', 'Auto Nagar Gate',
  'Gollapudi Gate', 'Ramavarappadu Ring', 'Patamata Centre', 'Bhavanipuram',
];

const VEHICLE_TYPES = ['2W', '4W', 'AUTO', 'BUS', 'HMV'] as const;
const COLORS = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Grey'];
const MAKES = ['Hero', 'Honda', 'Maruti', 'Hyundai', 'Tata', 'Bajaj', 'TVS', 'Toyota'];
const VIOLATION_TYPES = ['SPEED', 'HELMET', 'WRONG_SIDE', 'RED_LIGHT', 'NO_SEATBELT', 'OVERLOADING', 'ILLEGAL_PARKING', 'TRIPLE_RIDING'];
const VIOLATION_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'FINED'];
const DENSITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SEVERITY = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];

const plate = () =>
  `AP${intBetween(10, 39)}${pick(['AB', 'BC', 'CD', 'CX', 'DG', 'EE'])}${intBetween(1000, 9999)}`;

// ----- entity fixtures -----
const devices = LOCATIONS.map((name, i) => {
  const status = i % 7 === 3 ? 'inactive' : 'active';
  return {
    id: `CAM-${String(i + 1).padStart(3, '0')}`,
    name,
    type: 'CAMERA' as const,
    lat: VJA.lat + between(-0.04, 0.04),
    lng: VJA.lng + between(-0.05, 0.05),
    status,
    zoneId: `Z${(i % 4) + 1}`,
    rtspUrl: `rtsp://10.10.0.${20 + i}:554/stream1`,
    description: `${name} junction camera`,
    metadata: { location: name },
    config: { services: ['anpr-vcc', 'crowd-counting'] },
    workerId: `worker-${(i % 4) + 1}`,
    createdAt: isoAgo(60 * 24 * 30),
    updatedAt: isoAgo(intBetween(1, 90)),
  };
});

const deviceRef = (d: (typeof devices)[number]) => ({
  id: d.id, name: d.name, lat: d.lat, lng: d.lng, type: d.type,
});

const cameraHealth = devices.map((d) => ({
  id: d.rtspUrl!.split('//')[1].split(':')[0],
  cameraId: d.name,
  location: d.name,
  status: d.status === 'active' ? 'online' : 'offline',
  lastPing: isoAgo(intBetween(0, 5)),
  latencyMs: intBetween(8, 120),
}));

const vehicles = Array.from({ length: 48 }).map((_, i) => {
  const t = pick(VEHICLE_TYPES);
  return {
    id: `VH-${String(i + 1).padStart(4, '0')}`,
    plateNumber: rnd() > 0.12 ? plate() : null,
    make: pick(MAKES),
    model: pick(['Splendor', 'Activa', 'Swift', 'i20', 'Nexon', 'Pulsar', 'Jupiter', 'Innova']),
    vehicleType: t,
    color: pick(COLORS),
    firstSeen: isoAgo(intBetween(120, 4000)),
    lastSeen: isoAgo(intBetween(1, 120)),
    detectionCount: intBetween(1, 40),
    isWatchlisted: rnd() > 0.9,
    metadata: {},
    createdAt: isoAgo(intBetween(120, 4000)),
    updatedAt: isoAgo(intBetween(1, 120)),
  };
});

const detectionFor = (v: (typeof vehicles)[number], i: number) => {
  const d = pick(devices);
  return {
    id: `VD-${v.id}-${i}`,
    vehicleId: v.id,
    deviceId: d.id,
    device: deviceRef(d),
    timestamp: isoAgo(intBetween(1, 2880)),
    plateNumber: v.plateNumber,
    plateConfidence: between(0.6, 0.99),
    make: v.make,
    model: v.model,
    vehicleType: v.vehicleType,
    color: v.color,
    confidence: between(0.7, 0.99),
    plateDetected: !!v.plateNumber,
    makeModelDetected: true,
    fullImageUrl: placeholderImg(v.plateNumber || 'NO-PLATE', '#f59e0b'),
    plateImageUrl: placeholderImg(v.plateNumber || '----', '#f59e0b'),
    direction: pick(['N', 'S', 'E', 'W']),
    lane: intBetween(1, 3),
    metadata: {},
  };
};

const violations = Array.from({ length: 36 }).map((_, i) => {
  const d = pick(devices);
  const v = pick(vehicles);
  const type = pick(VIOLATION_TYPES);
  const status = pick(VIOLATION_STATUS);
  const speed = type === 'SPEED' ? intBetween(62, 110) : null;
  return {
    id: `VIO-${String(i + 1).padStart(4, '0')}`,
    deviceId: d.id,
    device: deviceRef(d),
    timestamp: isoAgo(intBetween(1, 4320)),
    violationType: type,
    status,
    detectionMethod: 'AUTOMATED',
    plateNumber: v.plateNumber,
    plateConfidence: between(0.6, 0.98),
    plateImageUrl: placeholderImg(v.plateNumber || '----', '#f59e0b'),
    fullSnapshotUrl: placeholderImg(type, '#ef4444'),
    detectedSpeed: speed,
    speedLimit2W: 50,
    speedLimit4W: 60,
    speedOverLimit: speed ? speed - 60 : null,
    confidence: between(0.7, 0.98),
    metadata: { location: d.name },
    reviewedAt: status === 'PENDING' ? null : isoAgo(intBetween(1, 100)),
    reviewedBy: status === 'PENDING' ? null : 'operator1',
    fineAmount: status === 'FINED' ? pick([500, 1000, 1500, 2000]) : null,
  };
});

const crowdLatest = devices.map((d, i) => {
  const people = intBetween(5, 400);
  const di = Math.min(3, Math.floor(people / 100));
  return {
    id: `CA-${d.id}`,
    deviceId: d.id,
    timestamp: isoAgo(intBetween(0, 8)),
    peopleCount: people,
    cumulativeCount: people * intBetween(8, 30),
    crowdLevel: Math.min(100, Math.round((people / 400) * 100)),
    densityValue: between(0.2, 3.5),
    densityLevel: DENSITY[di],
    movementType: pick(['STATIC', 'MOVING', 'FLOWING', 'CHAOTIC']),
    flowRate: between(0, 40),
    velocity: between(0, 1.5),
    freeSpace: between(0, 1),
    congestionLevel: Math.min(100, people / 4),
    occupancyRate: between(0, 1),
    hotspotSeverity: SEVERITY[di],
    modelType: i % 2 === 0 ? 'yolov8-head-detection' : 'yolov8-crowd-flow',
    confidence: between(0.7, 0.97),
    entriesToday: people * intBetween(8, 30),
    // Every 3rd camera has no stored frame — exercises the count-only fallback.
    frameUrl: i % 3 === 2 ? null : placeholderImg(`${people} people`, '#f59e0b'),
    device: deviceRef(d),
  };
});

const hotspots = devices.map((d, i) => {
  const c = crowdLatest[i];
  return {
    deviceId: d.id, name: d.name, lat: d.lat, lng: d.lng, type: d.type, status: d.status,
    zoneId: d.zoneId,
    hotspotSeverity: c.hotspotSeverity,
    peopleCount: c.peopleCount,
    densityLevel: c.densityLevel,
    congestionLevel: c.congestionLevel,
    lastUpdated: c.timestamp,
  };
});

const workers = Array.from({ length: 4 }).map((_, i) => ({
  id: `worker-${i + 1}`,
  name: `Jetson Orin ${i + 1}`,
  status: i === 3 ? 'offline' : 'active',
  ip: `10.10.0.${10 + i}`,
  wireguardIp: `10.10.0.${10 + i}`,
  lastSeen: isoAgo(intBetween(0, 30)),
  cameraCount: 3,
  createdAt: isoAgo(60 * 24 * 20),
}));

function vccByTime(groupBy = 'hour') {
  return Array.from({ length: 24 }).map((_, h) => {
    const c = intBetween(40, 600);
    return {
      [groupBy]: groupBy === 'hour' ? `${h}:00` : `2026-06-${String((h % 28) + 1).padStart(2, '0')}`,
      count: c,
      '2W': Math.round(c * 0.5), '4W': Math.round(c * 0.3),
      AUTO: Math.round(c * 0.12), BUS: Math.round(c * 0.03), HMV: Math.round(c * 0.05),
    } as any;
  });
}

const vccStats = {
  totalDetections: 18432,
  uniqueVehicles: 9120,
  byVehicleType: { '2W': 9200, '4W': 5600, AUTO: 2200, BUS: 540, HMV: 892 },
  byTime: vccByTime('hour'),
  byDevice: devices.map((d) => ({
    deviceId: d.id, deviceName: d.name, totalDetections: intBetween(400, 3000),
    byType: { '2W': intBetween(100, 1500), '4W': intBetween(80, 900), AUTO: intBetween(20, 400), BUS: intBetween(2, 60), HMV: intBetween(5, 120) },
  })),
  byHour: Object.fromEntries(Array.from({ length: 24 }).map((_, h) => [String(h), intBetween(40, 600)])),
  byDayOfWeek: { Mon: 2400, Tue: 2600, Wed: 2800, Thu: 2700, Fri: 3100, Sat: 3400, Sun: 1900 },
  peakHour: 18,
  peakDay: 'Sat',
  averagePerHour: 768,
  classification: { withPlates: 14200, withoutPlates: 4232, withMakeModel: 11800, plateOnly: 2400, fullClassification: 11800 },
};

const vccRealtime = {
  totalDetections: intBetween(20, 80),
  byVehicleType: { '2W': intBetween(10, 40), '4W': intBetween(5, 25), AUTO: intBetween(2, 10), BUS: intBetween(0, 3), HMV: intBetween(1, 6) },
  byDevice: devices.slice(0, 6).map((d) => ({ deviceId: d.id, deviceName: d.name, count: intBetween(2, 18) })),
  perMinute: intBetween(15, 60),
};

const violationStats = {
  total: violations.length,
  pending: violations.filter((v) => v.status === 'PENDING').length,
  approved: violations.filter((v) => v.status === 'APPROVED').length,
  rejected: violations.filter((v) => v.status === 'REJECTED').length,
  fined: violations.filter((v) => v.status === 'FINED').length,
  byType: VIOLATION_TYPES.reduce((a, t) => ({ ...a, [t]: violations.filter((v) => v.violationType === t).length }), {}),
  byDevice: {},
};

const vehicleStats = {
  total: vehicles.length,
  withPlates: vehicles.filter((v) => v.plateNumber).length,
  withoutPlates: vehicles.filter((v) => !v.plateNumber).length,
  watchlisted: vehicles.filter((v) => v.isWatchlisted).length,
  byType: VEHICLE_TYPES.reduce((a, t) => ({ ...a, [t]: vehicles.filter((v) => v.vehicleType === t).length }), {}),
  byMake: MAKES.reduce((a, m) => ({ ...a, [m]: vehicles.filter((v) => v.make === m).length }), {}),
  detectionsToday: 1240,
};

// ----- FRS fixtures (used by ported sringeri pages, Phase 1 step 5) -----
const frsPersons = Array.from({ length: 10 }).map((_, i) => ({
  id: `P-${String(i + 1).padStart(3, '0')}`,
  name: pick(['Ravi Kumar', 'Suresh', 'Anita', 'Imran', 'Lakshmi', 'Wanted Suspect', 'VIP Guest', 'Unknown']),
  category: pick(['WATCHLIST', 'VIP', 'STAFF', 'SUSPECT']),
  threatLevel: pick(['LOW', 'MEDIUM', 'HIGH']),
  // Some enrolled persons have no photo — exercises the initials-avatar fallback.
  faceImageUrl: (i % 4 === 3 ? null : placeholderImg('FACE', '#f59e0b')) as string | null,
  createdAt: isoAgo(intBetween(100, 5000)),
}));

const frsDetections = Array.from({ length: 24 }).map((_, i) => {
  const d = pick(devices);
  const matched = rnd() > 0.5;
  const p = matched ? pick(frsPersons) : null;
  return {
    id: `FD-${String(i + 1).padStart(4, '0')}`,
    deviceId: d.id,
    device: deviceRef(d),
    timestamp: isoAgo(intBetween(1, 1440)),
    personId: p?.id ?? null,
    person: p,
    confidence: between(0.5, 0.99),
    matchScore: matched ? between(0.45, 0.95) : null,
    // Every 3rd detection has no face crop — exercises the BBoxCrop fallback path.
    faceSnapshotUrl: i % 3 === 0 ? null : placeholderImg('FACE', '#f59e0b'),
    fullSnapshotUrl: placeholderImg('SCENE', '#f59e0b'),
    bbox: { x: 0.4, y: 0.3, w: 0.1, h: 0.15 },
  };
});

// ----- Watchlist fixtures (entry shape = backend Watchlist model, not Vehicle) -----
const watchlistEntries: any[] = vehicles.filter((v) => v.isWatchlisted).map((v, i) => ({
  id: `WL-${String(i + 1).padStart(3, '0')}`,
  vehicleId: v.id,
  vehicle: v,
  reason: pick(['Stolen vehicle report', 'Repeat violator', 'Court order', 'Suspicious activity']),
  addedBy: 'operator',
  addedAt: isoAgo(intBetween(60, 4000)),
  isActive: true,
  alertOnDetection: true,
  alertOnViolation: i % 2 === 0,
  notes: null,
  createdAt: isoAgo(intBetween(60, 4000)),
  updatedAt: isoAgo(intBetween(0, 60)),
}));

const watchlistAlerts: any[] = Array.from({ length: 12 }).map((_, i) => {
  const wl = pick(watchlistEntries.length ? watchlistEntries : [{ id: 'WL-000', vehicleId: vehicles[0].id, vehicle: vehicles[0] }]);
  const d = pick(devices);
  const type = i % 4 === 0 ? 'VIOLATION' : 'DETECTION';
  return {
    id: i + 1,
    watchlistId: wl.id,
    vehicleId: wl.vehicleId,
    vehicle: wl.vehicle,
    detectionId: null,
    detection: { plateImageUrl: placeholderImg(wl.vehicle?.plateNumber ?? 'PLATE', '#f59e0b'), fullImageUrl: placeholderImg('SCENE', '#ef4444') },
    alertType: type,
    message: `Watchlisted vehicle ${type === 'DETECTION' ? 'detected' : 'violation'}: ${wl.vehicle?.plateNumber ?? 'UNKNOWN'}${i % 5 === 0 ? ' (historical)' : ''}`,
    isRead: i > 7,
    readAt: i > 7 ? isoAgo(intBetween(0, 200)) : null,
    deviceId: d.id,
    device: deviceRef(d),
    timestamp: isoAgo(intBetween(1, 2800)),
    metadata: i % 5 === 0 ? { historical: true } : {},
    createdAt: isoAgo(intBetween(1, 2800)),
    updatedAt: isoAgo(intBetween(0, 60)),
  };
});

const crowdAlertRows: any[] = Array.from({ length: 8 }).map((_, i) => {
  const d = pick(devices);
  const sev = pick(['YELLOW', 'ORANGE', 'RED']);
  const people = sev === 'RED' ? intBetween(280, 450) : sev === 'ORANGE' ? intBetween(180, 280) : intBetween(100, 180);
  return {
    id: `CALT-${i + 1}`,
    deviceId: d.id,
    device: deviceRef(d),
    alertType: i % 2 === 0 ? 'worker_alert' : 'CROWD_DENSITY',
    severity: sev,
    priority: sev === 'RED' ? 1 : sev === 'ORANGE' ? 2 : 3,
    peopleCount: people,
    densityLevel: sev === 'RED' ? 'CRITICAL' : sev === 'ORANGE' ? 'HIGH' : 'MEDIUM',
    congestionLevel: Math.min(100, people / 4),
    title: `Crowd surge (${sev})`,
    description: `Density threshold breach at ${d.name}`,
    isResolved: i > 5,
    timestamp: isoAgo(intBetween(2, 900)),
    frameUrl: i % 3 === 2 ? null : placeholderImg(`${people} people`, '#ef4444'),
  };
});

// ----- resolver -----
type Handler = (m: RegExpMatchArray, url: URL, method: string, body: any) => any;
interface Route { method?: string; re: RegExp; h: Handler; }

const ok = (data: any) => data;
const routes: Route[] = [
  // alerts & incidents (sringeri AlertsPage + WatchlistPage) — stats must match before /api/alerts
  { re: /^\/api\/alerts\/stats$/, h: () => ({
      total: watchlistAlerts.length,
      unread: watchlistAlerts.filter((a) => !a.isRead).length,
      read: watchlistAlerts.filter((a) => a.isRead).length,
      today: watchlistAlerts.filter((a) => Date.now() - new Date(a.timestamp).getTime() < 86_400_000).length,
      byType: watchlistAlerts.reduce((acc: Record<string, number>, a) => ({ ...acc, [a.alertType]: (acc[a.alertType] || 0) + 1 }), {}),
    }) },
  { method: 'PATCH', re: /^\/api\/alerts\/([^/?]+)\/read$/, h: (m) => {
      const a = watchlistAlerts.find((x) => String(x.id) === m[1]);
      if (a) { a.isRead = true; a.readAt = isoAgo(0); }
      return { success: true };
    } },
  { re: /^\/api\/alerts(\?|$)/, h: (_m, url) => {
      let list = watchlistAlerts;
      const isRead = url.searchParams.get('isRead');
      if (isRead != null) list = list.filter((a) => a.isRead === (isRead === 'true'));
      const t = url.searchParams.get('alertType');
      if (t) list = list.filter((a) => a.alertType === t);
      return { alerts: list, total: list.length, limit: 200, offset: 0 };
    } },
  { re: /^\/api\/crowd\/alerts(\?|$)/, h: (_m, url) => {
      let list = crowdAlertRows;
      const r = url.searchParams.get('isResolved');
      if (r != null) list = list.filter((a) => a.isResolved === (r === 'true'));
      return list;
    } },
  // auth/session (irisdrone components poll these)
  { re: /^\/api\/auth\/me$/, h: () => ({ id: 1, username: 'operator', email: 'operator@iris.local', role: 'admin', tokenVersion: 1 }) },
  { re: /^\/api\/auth\/csrf-token$/, h: () => ({ csrfToken: 'mock-csrf-token' }) },
  // platform config — feature toggles + deployment mode (persisted in localStorage in mock mode)
  { re: /^\/api\/config$/, h: (_m, _url, method, body) => {
      const KEY = 'mock_app_config';
      const defaults = { id: 1, siteName: 'IRIS Command Center', features: {}, deploymentMode: 'server', centralServerUrl: '', updatedAt: isoAgo(0) };
      let cfg: any;
      try { cfg = JSON.parse(localStorage.getItem(KEY) || 'null') || defaults; } catch { cfg = defaults; }
      if (method === 'PUT' && body) {
        if (body.features) cfg.features = { ...cfg.features, ...body.features };
        if (body.siteName != null) cfg.siteName = body.siteName;
        if (body.deploymentMode) cfg.deploymentMode = body.deploymentMode;
        if (body.centralServerUrl != null) cfg.centralServerUrl = body.centralServerUrl;
        localStorage.setItem(KEY, JSON.stringify(cfg));
      }
      return cfg;
    } },
  // devices
  { re: /^\/api\/devices$/, h: () => devices },
  { re: /^\/api\/devices\/([^/?]+)$/, h: (m) => devices.find((d) => d.id === m[1]) ?? devices[0] },
  // camera health
  { re: /^\/api\/camera-health$/, h: () => cameraHealth },
  { re: /^\/api\/camera-health\/history/, h: () => [] },
  { re: /^\/api\/camera-health\/targets/, h: () => ({ success: true }) },
  // crowd (sringeri shapes)
  { re: /^\/api\/crowd\/analysis\/latest/, h: () => crowdLatest },
  { re: /^\/api\/crowd\/analysis\/trend/, h: (_m, url) => {
      const g = url.searchParams.get('granularity') || 'hour';
      const stepMin = g === '5min' ? 5 : g === 'day' ? 1440 : 60;
      const n = g === '5min' ? 12 : g === 'day' ? 7 : 24;
      const base = Date.UTC(2026, 5, 8, 12, 0, 0);
      let cum = 0;
      return Array.from({ length: n }).map((_, i) => {
        const avg = intBetween(20, 350);
        cum += intBetween(200, 600);
        return {
          period: new Date(base - (n - 1 - i) * stepMin * 60_000).toISOString(),
          avgPeople: avg, maxPeople: avg + intBetween(10, 120),
          samples: intBetween(20, 60), cumulative: cum,
        };
      });
    } },
  { re: /^\/api\/crowd\/analysis\/footfall/, h: () => ({ totalFootfall: 12840, perCamera: crowdLatest.map((c) => ({ deviceId: c.deviceId, name: c.device.name, footfall: intBetween(200, 3000), peakHour: intBetween(8, 20), peakHourValue: intBetween(100, 400), peakPeople: intBetween(80, 400), avgPeople: intBetween(20, 200) })) }) },
  { re: /^\/api\/crowd\/analysis/, h: () => crowdLatest },
  { re: /^\/api\/crowd\/hotspots/, h: () => hotspots },
  { re: /^\/api\/crowd\/alerts\/stats/, h: () => ({
      total: crowdAlertRows.length,
      RED: crowdAlertRows.filter((a) => a.severity === 'RED').length,
      ORANGE: crowdAlertRows.filter((a) => a.severity === 'ORANGE').length,
      YELLOW: crowdAlertRows.filter((a) => a.severity === 'YELLOW').length,
    }) },
  { method: 'PATCH', re: /^\/api\/crowd\/alerts\/([^/?]+)\/resolve/, h: (m) => {
      const a = crowdAlertRows.find((x) => String(x.id) === m[1]);
      if (a) a.isResolved = true;
      return { success: true };
    } },
  { re: /^\/api\/crowd\/alerts/, h: () => crowdAlertRows },
  { re: /^\/api\/crowd\/alert-thresholds/, h: () => ({ yellow: 100, orange: 200, red: 300 }) },
  { re: /^\/api\/crowd\/live-frames?/, h: () => Object.fromEntries(crowdLatest.map((c) => [c.deviceId, c.frameUrl])) },
  // violations
  { re: /^\/api\/violations\/stats$/, h: () => violationStats },
  { re: /^\/api\/violations\/([^/?]+)\/(approve|reject|fine|plate|type)$/, h: (m) => ({ ...violations.find((v) => v.id === m[1]), status: m[2].toUpperCase() }) },
  { re: /^\/api\/violations\/([^/?]+)$/, h: (m) => violations.find((v) => v.id === m[1]) ?? violations[0] },
  { re: /^\/api\/violations/, h: (_m, url) => { const s = url.searchParams.get('status'); const list = s ? violations.filter((v) => v.status === s) : violations; return { violations: list, total: list.length, limit: 50, offset: 0 }; } },
  // vehicles / ANPR
  { re: /^\/api\/vehicles\/stats\/timeline/, h: () => ({
      hourly: Array.from({ length: 24 }).map(() => intBetween(10, 220)),
      byCamera: devices.slice(0, 8).map((d) => ({ deviceId: d.id, deviceName: d.name, count: intBetween(40, 800) })),
      totalDetections: 2480,
      uniquePlates: 1190,
      watchlistHits: watchlistAlerts.length,
      start: isoAgo(1440),
      end: isoAgo(0),
    }) },
  { re: /^\/api\/vehicles\/stats$/, h: () => vehicleStats },
  { re: /^\/api\/vehicles\/detect$/, h: () => ({ success: true, detectionId: 'VD-mock' }) },
  { re: /^\/api\/vehicles\/([^/?]+)\/detections/, h: (m) => Array.from({ length: 6 }).map((_, i) => detectionFor(vehicles.find((v) => v.id === m[1]) ?? vehicles[0], i)) },
  { re: /^\/api\/vehicles\/([^/?]+)\/violations/, h: () => violations.slice(0, 4) },
  { re: /^\/api\/vehicles\/([^/?]+)\/watchlist/, h: (m, _url, method, body) => {
      const v = vehicles.find((x) => x.id === m[1]);
      if (!v) return { success: false };
      if (method === 'DELETE') {
        v.isWatchlisted = false;
        const e = watchlistEntries.find((x) => x.vehicleId === v.id && x.isActive);
        if (e) e.isActive = false;
        return { success: true };
      }
      if (method === 'POST') {
        v.isWatchlisted = true;
        const existing = watchlistEntries.find((x) => x.vehicleId === v.id);
        if (existing) { existing.isActive = true; existing.reason = body?.reason ?? existing.reason; return existing; }
        const entry = { id: `WL-${String(watchlistEntries.length + 1).padStart(3, '0')}`, vehicleId: v.id, vehicle: v, reason: body?.reason ?? '', addedBy: body?.addedBy ?? 'operator', addedAt: isoAgo(0), isActive: true, alertOnDetection: body?.alertOnDetection ?? true, alertOnViolation: body?.alertOnViolation ?? false, notes: body?.notes ?? null, createdAt: isoAgo(0), updatedAt: isoAgo(0) };
        watchlistEntries.push(entry);
        return entry;
      }
      return watchlistEntries.find((x) => x.vehicleId === v.id) ?? { success: true };
    } },
  { re: /^\/api\/vehicles\/([^/?]+)$/, h: (m) => vehicles.find((v) => v.id === m[1]) ?? vehicles[0] },
  { re: /^\/api\/vehicles/, h: (_m, url) => {
      const t = url.searchParams.get('vehicleType');
      const w = url.searchParams.get('watchlisted');
      let list = t ? vehicles.filter((v) => v.vehicleType === t) : vehicles;
      if (w != null) list = list.filter((v) => v.isWatchlisted === (w === 'true'));
      return { vehicles: list, total: list.length, limit: 50, offset: 0 };
    } },
  { method: 'POST', re: /^\/api\/watchlist/, h: (_m, _url, _method, body) => {
      const plate = (body?.plateNumber ?? '').toUpperCase().trim();
      if (!plate) throw new Error('plateNumber required');
      let v = vehicles.find((x) => (x.plateNumber ?? '').toUpperCase() === plate);
      if (!v) {
        v = { ...vehicles[0], id: `VH-MOCK-${plate}`, plateNumber: plate, isWatchlisted: true, detectionCount: 0 };
        vehicles.push(v);
      }
      v.isWatchlisted = true;
      const existing = watchlistEntries.find((x) => x.vehicleId === v!.id);
      if (existing) { existing.isActive = true; existing.reason = body?.reason ?? existing.reason; return existing; }
      const entry = { id: `WL-${String(watchlistEntries.length + 1).padStart(3, '0')}`, vehicleId: v.id, vehicle: v, reason: body?.reason ?? '', addedBy: body?.addedBy ?? 'operator', addedAt: isoAgo(0), isActive: true, alertOnDetection: body?.alertOnDetection ?? true, alertOnViolation: body?.alertOnViolation ?? false, notes: body?.notes ?? null, createdAt: isoAgo(0), updatedAt: isoAgo(0) };
      watchlistEntries.push(entry);
      // mimic the backend's retroactive 48 h alert
      watchlistAlerts.unshift({ id: watchlistAlerts.length + 1, watchlistId: entry.id, vehicleId: v.id, vehicle: v, detectionId: null, detection: { plateImageUrl: placeholderImg(plate, '#f59e0b') }, alertType: 'DETECTION', message: `Watchlisted vehicle detected: ${plate} (historical)`, isRead: false, readAt: null, deviceId: devices[0].id, device: deviceRef(devices[0]), timestamp: isoAgo(intBetween(10, 2800)), metadata: { historical: true }, createdAt: isoAgo(0), updatedAt: isoAgo(0) });
      return entry;
    } },
  { re: /^\/api\/watchlist/, h: () => watchlistEntries.filter((e) => e.isActive) },
  // VCC
  { re: /^\/api\/vcc\/stats/, h: () => vccStats },
  { re: /^\/api\/vcc\/heatmap/, h: () => vccStats },
  { re: /^\/api\/vcc\/device\/([^/?]+)/, h: (m) => ({ ...vccStats, deviceId: m[1], deviceName: devices.find((d) => d.id === m[1])?.name ?? m[1] }) },
  { re: /^\/api\/vcc\/cameras/, h: () => ({ cameras: devices.map((d) => ({ id: d.id, name: d.name, workerId: d.workerId, location: d.name })) }) },
  { re: /^\/api\/vcc\/realtime/, h: () => vccRealtime },
  { re: /^\/api\/vcc\/events/, h: () => ({ data: vehicles.slice(0, 20).map((v, i) => detectionFor(v, i)), total: 20 }) },
  // FRS
  { method: 'POST', re: /^\/api\/frs\/persons\/([^/?]+)\/embeddings/, h: (m) => {
      const p = frsPersons.find((x) => x.id === m[1]) ?? frsPersons[0];
      if (!p.faceImageUrl) p.faceImageUrl = placeholderImg('FACE', '#f59e0b');
      return { person: p, newEmbeddingsCount: 1, totalEmbeddings: 1 };
    } },
  { re: /^\/api\/frs\/persons/, h: () => frsPersons },
  { re: /^\/api\/frs\/detections/, h: (_m, url) => {
      const unknown = url.searchParams.get('unknown');
      if (unknown === 'true') return frsDetections.filter((d) => !d.personId);
      if (unknown === 'false') return frsDetections.filter((d) => d.personId);
      return frsDetections;
    } },
  { re: /^\/api\/frs\/global-identities/, h: () => [] },
  // search-face must precede the generic /api/frs/search route; the delay makes
  // the scanning animation observable.
  { method: 'POST', re: /^\/api\/frs\/search-face/, h: async () => {
      await new Promise((r) => setTimeout(r, 1800));
      return {
        personMatches: frsPersons.slice(0, 2).map((p) => ({ personId: p.id, personName: p.name, faceImageUrl: p.faceImageUrl, similarity: between(0.7, 0.9) })),
        detectionMatches: frsDetections.filter((d) => d.faceSnapshotUrl).slice(0, 6).map((d) => ({ detection: d, similarity: between(0.5, 0.85) })),
      };
    } },
  { re: /^\/api\/frs\/search/, h: () => frsDetections.slice(0, 8) },
  { re: /^\/api\/(inference\/)?frs\/(live-frames?|watchlist-version)/, h: () => [] },
  // workers / admin
  { re: /^\/api\/admin\/workers\/approval-requests/, h: () => ({ data: [], total: 0 }) },
  { re: /^\/api\/admin\/workers\/([^/?]+)\/cameras/, h: () => [] },
  { re: /^\/api\/admin\/workers\/([^/?]+)$/, h: (m) => workers.find((w) => w.id === m[1]) ?? workers[0] },
  { re: /^\/api\/admin\/workers/, h: () => ({ data: workers, total: workers.length }) },
  { re: /^\/api\/admin\/worker-tokens/, h: () => [] },
  // analytics
  { re: /^\/api\/analytics\/worker-configs/, h: () => ({ cameras: devices.map((d) => ({ deviceId: d.id, rtspUrl: d.rtspUrl, name: d.name, config: d.config })) }) },
  { re: /^\/api\/analytics/, h: () => ({ data: [] }) },
  // iris-search (CLIP semantic search)
  { re: /^\/api\/search\/clip/, h: (_m, url) => ({
      source: url.searchParams.get('source') || devices[0].id,
      ts: Number(url.searchParams.get('ts') || 0),
      frames: Array.from({ length: 24 }).map((_, i) => placeholderImg(`f${i}`, '#f59e0b')),
      clipFps: 8,
    }) },
  { re: /^\/api\/search$/, h: (_m, _url, _method, body) => {
      const topK = body?.topK ?? 24;
      const minScore = body?.minScore ?? 0.23;
      const all = Array.from({ length: 40 }).map((_, i) => {
        const d = pick(devices);
        const score = between(0.18, 0.42);
        const ts = intBetween(0, 1800);
        return {
          id: `SR-${i}`,
          deviceId: d.id,
          deviceName: d.name,
          timestamp: ts,
          timeLabel: `${String(Math.floor(ts / 60)).padStart(2, '0')}:${String(ts % 60).padStart(2, '0')}`,
          score,
          thumbnailUrl: placeholderImg(`${(score * 100).toFixed(0)}%`, score >= 0.26 ? '#22c55e' : score >= 0.23 ? '#eab308' : '#ef4444'),
          clipPath: `/clips/${d.id}/seg_${i}.mp4`,
        };
      }).sort((a, b) => b.score - a.score);
      const shown = all.filter((r) => r.score >= minScore).slice(0, topK);
      return { results: shown, total: shown.length, hidden: all.length - shown.length, query: body?.query ?? '' };
    } },
];

export async function mockRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const url = new URL(endpoint, 'http://mock.local');
  const path = url.pathname;
  let body: any = undefined;
  try { body = options?.body ? JSON.parse(options.body as string) : undefined; } catch { /* ignore */ }

  // simulate light latency for realistic loading states
  await new Promise((r) => setTimeout(r, 60));

  for (const route of routes) {
    if (route.method && route.method !== method) continue;
    const m = path.match(route.re);
    if (m) return ok(route.h(m, url, method, body)) as T;
  }

  // mutating fallback → success; list fallback → empty
  if (method !== 'GET') return ok({ success: true }) as T;
  // eslint-disable-next-line no-console
  console.warn('[mock] unmatched endpoint', method, path, '→ returning []');
  return ok([]) as T;
}

// base64url-encode a JSON object (browser-safe)
const b64url = (obj: any) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

export function mockToken(username: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({ sub: username || 'operator', role: 'admin', iat: now, exp: now + 12 * 3600 });
  return `${header}.${payload}.mocksignature`;
}

export async function mockLogin(data: { username: string; password: string }) {
  await new Promise((r) => setTimeout(r, 200));
  return {
    token: mockToken(data.username),
    user: { id: 1, username: data.username || 'operator', role: 'admin' },
  };
}

// ----- global fetch interceptor: catches raw fetch('/api/...') calls that bypass ApiClient -----
export function installMockFetch() {
  if (typeof window === 'undefined') return;
  const original = window.fetch.bind(window);
  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    let path = raw;
    try { path = new URL(raw, window.location.origin).pathname; } catch { /* keep raw */ }

    if (path.startsWith('/api/')) {
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      try {
        if (path === '/api/login') {
          let body: any = {};
          try { body = init?.body ? JSON.parse(init.body as string) : {}; } catch { /* ignore */ }
          return json(await mockLogin(body));
        }
        const data = await mockRequest<any>(path + (raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''), { ...init, method });
        return json(data);
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    return original(input, init);
  };
}
