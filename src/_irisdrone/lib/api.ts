// API Client - Updated 2025-12-26
// Use relative path for API calls - Vite will proxy /api to backend
import { getCsrfToken, clearCsrfTokenCache } from './csrf';

const API_BASE_URL = '';

const WASENDER_API_URL = import.meta.env.VITE_WASENDER_API_URL ?? '/wasender/api/send-message';
const WASENDER_API_KEY = import.meta.env.VITE_WASENDER_API_KEY ?? 'b4dfe1823e0f092a7ee118b62d2638c595900b0b24db1affc271ad2a40b78d58';

export async function sendWhatsAppNotification(violation: TrafficViolation, ownerPhone?: string) {
  const plate = violation.plateNumber || 'UNKNOWN';
  const vType = violation.violationType.replace(/_/g, ' ');
  const date = new Date(violation.timestamp).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const fine = violation.fineAmount ? `₹${violation.fineAmount}` : 'As per MV Act';

  const violatorMsg = `⚠️ *MANGALORE CITY TRAFFIC POLICE* ⚠️
━━━━━━━━━━━━━━━━━━━━━━
*TRAFFIC VIOLATION NOTICE*
━━━━━━━━━━━━━━━━━━━━━━

*Ref No:* MNG/TV/${violation.id}
*Date:* ${date}
*Vehicle No:* ${plate}
*Violation:* ${vType}
*Fine Amount:* ${fine}
*Detection:* AI-Based Surveillance System

Dear Vehicle Owner,

A traffic violation has been recorded and verified against your vehicle *${plate}* by the Mangalore City Traffic Police AI Surveillance System.

You are hereby directed to pay the penalty amount at the nearest traffic police station or online within *15 days* from the date of this notice.

Failure to pay the fine may result in further legal action under the Motor Vehicles Act, 1988.

📍 *Office of the Commissioner of Police*
Mangalore City, Karnataka

📞 Helpline: 0824-2220500
🌐 Online Payment: https://ksp.karnataka.gov.in

_This is a system-generated message. Do not reply._
━━━━━━━━━━━━━━━━━━━━━━`;

  const sendMsg = (to: string, text: string) =>
    fetch(WASENDER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WASENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, text }),
    }).catch((err) => console.error(`WhatsApp send error (${to}):`, err));

  const ownerNumber = ownerPhone ? `+91${ownerPhone}` : '+917218289793';

  await Promise.all([
    sendMsg(ownerNumber, violatorMsg),
    sendMsg('+919448008639', violatorMsg),
    sendMsg('+918097476656', violatorMsg),
  ]);
}

// Re-export worker types from separate file
export type {
  WorkerStatus,
  Worker,
  WorkerWithCounts,
  WorkerToken,
  WorkerTokenWithStatus,
  WorkerApprovalRequest,
  WorkerCameraAssignment,
  CameraAssignment
} from './worker-types';

export type DeviceType = 'CAMERA' | 'DRONE' | 'SENSOR' | 'MAGICBOX';
export type DeviceStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'active' | 'inactive' | 'maintenance';

// Telemetry reported by magicwatchdog on each beat (stored in devices.runtime_info)
export interface MagicBoxContainer {
  name: string;
  image: string;
  status: string;
  state: string;
  running: boolean;
}

export interface MagicBoxRuntimeInfo {
  kernel?: string;
  hostname?: string;
  load_avg?: [number, number, number];
  containers?: MagicBoxContainer[];
  cpu_temp_c?: number;
  thermal_zones?: Record<string, number>;
  disk_total_bytes?: number;
  disk_used_bytes?: number;
  disk_free_bytes?: number;
  disk_used_pct?: number;
  ram_total_bytes?: number;
  ram_used_bytes?: number;
  ram_available_bytes?: number;
  swap_total_bytes?: number;
  swap_used_bytes?: number;
  swap_free_bytes?: number;
  uptime_seconds?: number;
  wg_interface_ip?: string;
  recently_rebooted?: boolean;
  last_oom_kill_age_s?: number;
  violation_worker_last_log_age_s?: number;
  [key: string]: unknown;
}

// Full device interface (for detail views)
export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  lat: number;
  lng: number;
  status: DeviceStatus;
  zoneId?: string;
  rtspUrl?: string | null;
  metadata?: Record<string, any>;
  runtimeInfo?: MagicBoxRuntimeInfo;
  config?: Record<string, any>;
  events?: any[];
  workerId?: string | null;
  parentDeviceId?: string | null;
  lastSeen?: string | null;
  cameraStatus?: string | null;
  isOnline?: boolean;
  uptimePercent?: number | null;
  createdAt: string;
  updatedAt: string;
  latestEvent?: {
    id: string;
    eventType: string;
    data: Record<string, any>;
    timestamp: string;
  };
}

export interface DeviceHeartbeatPoint {
  timestamp: string;
  cameraStatus: string;
  metadata?: Record<string, unknown>;
}

// Minimal device interface for map view (reduces payload size)
export interface DeviceMapMarker {
  id: string;
  name: string;
  type: DeviceType;
  lat: number;
  lng: number;
  status: DeviceStatus;
}

// Hotspot interface for crowd visualization
export interface Hotspot {
  deviceId: string;
  name: string;
  lat: number;
  lng: number;
  type: DeviceType;
  status: DeviceStatus;
  zoneId?: string;
  hotspotSeverity: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  peopleCount: number | null;
  densityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  congestionLevel: number | null;
  lastUpdated: string | null;
}

// Crowd Analysis interface
export interface CrowdAnalysis {
  id: string;
  deviceId: string;
  timestamp: string;
  peopleCount: number | null;
  crowdLevel: number; // 0-100 percentage relative to min/max in response
  densityValue: number | null;
  densityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  movementType: 'STATIC' | 'MOVING' | 'FLOWING' | 'CHAOTIC';
  flowRate: number | null;
  velocity: number | null;
  freeSpace: number | null;
  congestionLevel: number | null;
  occupancyRate: number | null;
  hotspotSeverity: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  hotspotZones?: Array<{ x: number; y: number; radius: number; severity: string }>;
  maxDensityPoint?: { x: number; y: number; density: number };
  demographics?: {
    gender?: { male: number; female: number };
    ageGroups?: { adults: number; seniors: number; children: number };
  };
  behavior?: string | null;
  anomalies?: string[];
  heatmapData?: any;
  heatmapImageUrl?: string | null;
  frameId?: string | null;
  frameUrl?: string | null;
  modelType?: string | null;
  confidence?: number | null;
  device: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: DeviceType;
  };
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export function hasViolationEvidence(violation: TrafficViolation): boolean {
  return Boolean(
    (violation.fullSnapshotUrl && violation.fullSnapshotUrl.trim()) ||
    (violation.plateImageUrl && violation.plateImageUrl.trim())
  );
}

// Import worker types for use in ApiClient methods
import type {
  WorkerStatus,
  Worker,
  WorkerWithCounts,
  WorkerToken,
  WorkerTokenWithStatus,
  WorkerApprovalRequest,
  WorkerCameraAssignment,
  CameraAssignment
} from './worker-types';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
    _csrfRetry = false,
  ): Promise<T> {
    const token = localStorage.getItem('iris_token');
    const method = String(options?.method ?? 'GET').toUpperCase();
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    if (token) {
      // @ts-ignore - HeadersInit type is complex, but this is valid
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (isMutation) {
      // @ts-ignore - HeadersInit type is complex, but this is valid
      headers['X-CSRF-Token'] = await getCsrfToken();
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'same-origin',
    });

    if (!response.ok) {
      // Survive backend restarts / cookie eviction: when the server rejects
      // a mutation with a CSRF-related 403, clear the cached token, fetch a
      // fresh one, and retry the same request once. Without this the user
      // has to hard-refresh whenever the backend (or its cookie store) is
      // recycled.
      if (
        isMutation &&
        !_csrfRetry &&
        response.status === 403
      ) {
        const ct = response.headers.get('content-type') || '';
        let errMsg = '';
        try {
          if (ct.includes('application/json')) {
            errMsg = String((await response.clone().json())?.error ?? '');
          } else {
            errMsg = await response.clone().text();
          }
        } catch {
          // ignore parse errors
        }
        if (/csrf/i.test(errMsg)) {
          clearCsrfTokenCache();
          return this.request<T>(endpoint, options, true);
        }
      }

      let msg = `API Error: ${response.status} ${response.statusText}`;
      const ct = response.headers.get('content-type') || '';
      try {
        if (ct.includes('application/json')) {
          const data = await response.json();
          if (data?.error) msg = String(data.error);
        } else {
          const text = await response.text();
          if (text) msg = text.slice(0, 300);
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(msg);
    }

    return response.json();
  }

  // Device endpoints
  async getDevices(options?: {
    type?: DeviceType;
    minimal?: boolean; // Return only essential fields for map view
  }): Promise<Device[] | DeviceMapMarker[]> {
    const params = new URLSearchParams();
    if (options?.type) {
      params.append('type', options.type);
    }
    if (options?.minimal) {
      params.append('minimal', 'true');
    }
    const query = params.toString();
    return this.request<Device[] | DeviceMapMarker[]>(
      `/api/devices${query ? `?${query}` : ''}`
    );
  }

  // Get devices by type (optimized for map view)
  async getDevicesByType(type: DeviceType): Promise<DeviceMapMarker[]> {
    return this.getDevices({ type, minimal: true }) as Promise<DeviceMapMarker[]>;
  }

  // Get all devices for map (fetches by type in parallel)
  async getDevicesForMap(): Promise<DeviceMapMarker[]> {
    const [cameras, drones, sensors] = await Promise.all([
      this.getDevicesByType('CAMERA'),
      this.getDevicesByType('DRONE'),
      this.getDevicesByType('SENSOR'),
    ]);
    return [...cameras, ...drones, ...sensors];
  }

  async getDevice(id: string): Promise<Device> {
    return this.request<Device>(`/api/devices/by-id?deviceId=${encodeURIComponent(id)}`);
  }

  async getDeviceCameras(deviceId: string): Promise<Device[]> {
    return this.request<Device[]>(`/api/devices/cameras?deviceId=${encodeURIComponent(deviceId)}`);
  }

  async getDeviceHeartbeats(
    deviceId: string,
    params?: { last?: '24h' | '7d'; from?: string; to?: string }
  ): Promise<DeviceHeartbeatPoint[]> {
    const p = new URLSearchParams();
    p.set('deviceId', deviceId);
    if (params?.from && params?.to) {
      p.set('from', params.from);
      p.set('to', params.to);
    } else {
      p.set('last', params?.last ?? '24h');
    }
    return this.request<DeviceHeartbeatPoint[]>(`/api/devices/heartbeats?${p}`);
  }

  async createDevice(device: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Promise<Device> {
    return this.request<Device>('/api/devices', {
      method: 'POST',
      body: JSON.stringify(device),
    });
  }

  async updateDevice(id: string, updates: Partial<Device>): Promise<Device> {
    return this.request<Device>(`/api/devices/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteDevice(id: string): Promise<void> {
    return this.request<void>(`/api/devices/by-id?deviceId=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // Crowd endpoints
  async getHotspots(): Promise<Hotspot[]> {
    return this.request<Hotspot[]>('/api/crowd/hotspots');
  }

  async getCrowdAnalysis(options?: {
    deviceId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    severity?: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  }): Promise<CrowdAnalysis[]> {
    const params = new URLSearchParams();
    if (options?.deviceId) {
      params.append('deviceId', options.deviceId);
    }
    if (options?.startTime) {
      params.append('startTime', options.startTime);
    }
    if (options?.endTime) {
      params.append('endTime', options.endTime);
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.severity) {
      params.append('severity', options.severity);
    }
    const query = params.toString();
    return this.request<CrowdAnalysis[]>(`/api/crowd/analysis${query ? `?${query}` : ''}`);
  }

  async getLatestCrowdAnalysis(deviceIds?: string[]): Promise<CrowdAnalysis[]> {
    const params = new URLSearchParams();
    if (deviceIds && deviceIds.length > 0) {
      params.append('deviceIds', deviceIds.join(','));
    }
    const query = params.toString();
    return this.request<CrowdAnalysis[]>(`/api/crowd/analysis/latest${query ? `?${query}` : ''}`);
  }

  // Event endpoints
  async ingestEvent(event: {
    deviceId: string;
    eventType: string;
    data: Record<string, any>;
    timestamp?: string;
  }): Promise<void> {
    return this.request<void>('/api/ingest', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  // Violation endpoints (ITMS)
  async getViolations(options?: {
    status?: ViolationStatus;
    excludeStatus?: ViolationStatus;
    violationType?: ViolationType;
    deviceId?: string;
    plateNumber?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ violations: TrafficViolation[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.excludeStatus) params.append('excludeStatus', options.excludeStatus);
    if (options?.violationType) {
      params.append('violationType', options.violationType);
    }
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.plateNumber) params.append('plateNumber', options.plateNumber);
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString();
    const result = await this.request<{ violations: TrafficViolation[]; total: number; limit: number; offset: number }>(
      `/api/violations${query ? `?${query}` : ''}`
    );
    const violations = result.violations.filter(hasViolationEvidence);
    return {
      ...result,
      violations,
      total: result.total,
    };
  }

  async getViolation(id: string): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}`);
  }

  async createViolation(data: {
    deviceId: string;
    violationType: ViolationType;
    detectionMethod?: string;
    plateNumber?: string;
    plateImageUrl?: string;
    fullSnapshotUrl?: string;
    timestamp?: string;
  }): Promise<TrafficViolation> {
    return this.request<TrafficViolation>('/api/violations', {
      method: 'POST',
      body: JSON.stringify({ detectionMethod: 'MANUAL', ...data }),
    });
  }

  async approveViolation(id: string, data?: { reviewNote?: string; reviewedBy?: string }): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    });
  }

  async markViolationPaid(
    id: string,
    data?: { paymentReference?: string; paymentMethod?: string; paidAmount?: number },
  ): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/pay`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    });
  }

  async fineViolation(
    id: string,
    data?: { reviewNote?: string; reviewedBy?: string; lang?: 'en' | 'kn' },
  ): Promise<TrafficViolation> {
    const { lang, ...body } = data || {};
    const q = lang ? `?lang=${lang}` : '';
    return this.request<TrafficViolation>(`/api/violations/${id}/fine${q}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async rejectViolation(id: string, data: { rejectionReason: string; reviewedBy?: string }): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async fetchRCDetails(rcNumber: string): Promise<RCDetails | null> {
    try {
      const plate = rcNumber.replace(/[\s-]/g, '');
      const json = await this.request<{ success: boolean; data: RCDetails | null }>(
        `/api/vehicles/rc-details?plate=${encodeURIComponent(plate)}`
      );
      if (json.success && json.data) {
        return json.data;
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch RC details:', err);
      return null;
    }
  }

  async fetchRCToMobile(rcNumber: string): Promise<string | null> {
    try {
      // The SP Belagavi SOAP service returns mobile_no as part of RC details,
      // so we reuse the same endpoint.
      const plate = rcNumber.replace(/[\s-]/g, '');
      const json = await this.request<{ success: boolean; data: { mobile_no?: string } | null }>(
        `/api/vehicles/rc-details?plate=${encodeURIComponent(plate)}`
      );
      if (json.success && json.data?.mobile_no) {
        return json.data.mobile_no;
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch RC to mobile:', err);
      return null;
    }
  }

  async deleteViolation(id: string): Promise<void> {
    return this.request<void>(`/api/violations/${id}/delete`, { method: 'PATCH' });
  }

  // Hard-delete: removes the violation row + any open dispute reference.
  // Backend enforces status === 'VOIDED'; call deleteViolation() first.
  async purgeViolation(id: string): Promise<void> {
    return this.request<void>(`/api/violations/${id}`, { method: 'DELETE' });
  }

  async updateViolationPlate(id: string, plateNumber: string): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/plate`, {
      method: 'PATCH',
      body: JSON.stringify({ plateNumber }),
    });
  }

  // Operator reclassification — currently limited to RIDER_HELMET ↔ PILLION_HELMET
  // (backend-enforced whitelist). Used during manual review when the edge
  // pipeline labelled a helmet violation but couldn't tell rider vs pillion.
  async updateViolationType(
    id: string,
    violationType: 'RIDER_HELMET' | 'PILLION_HELMET',
  ): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/type`, {
      method: 'PATCH',
      body: JSON.stringify({ violationType }),
    });
  }

  async getViolationStats(options?: {
    startTime?: string;
    endTime?: string;
    deviceId?: string;
  }): Promise<ViolationStats> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    const query = params.toString();
    return this.request<ViolationStats>(`/api/violations/stats${query ? `?${query}` : ''}`);
  }

  // Dispute endpoints — citizen contests a violation; operator triages here.
  async listDisputes(options?: {
    status?: DisputeStatus | '';
    limit?: number;
    offset?: number;
  }): Promise<{ data: ViolationDispute[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit !== undefined) params.append('limit', String(options.limit));
    if (options?.offset !== undefined) params.append('offset', String(options.offset));
    const query = params.toString();
    return this.request(`/api/disputes${query ? `?${query}` : ''}`);
  }

  async getDispute(id: number | string): Promise<ViolationDispute> {
    return this.request<ViolationDispute>(`/api/disputes/${id}`);
  }

  async reviewDispute(
    id: number | string,
    data: { status: 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED'; notes?: string },
  ): Promise<ViolationDispute> {
    return this.request<ViolationDispute>(`/api/disputes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Vehicle endpoints (ANPR/VCC)
  async detectVehicle(detection: {
    deviceId: string;
    plateNumber?: string;
    plateConfidence?: number;
    make?: string;
    model?: string;
    vehicleType: VehicleType;
    color?: string;
    confidence?: number;
    fullImageUrl?: string;
    plateImageUrl?: string;
    vehicleImageUrl?: string;
    frameId?: string;
    direction?: string;
    lane?: number;
    metadata?: any;
    timestamp?: string;
  }): Promise<{ success: boolean; detectionId: string; vehicleId?: string }> {
    return this.request<{ success: boolean; detectionId: string; vehicleId?: string }>('/api/vehicles/detect', {
      method: 'POST',
      body: JSON.stringify(detection),
    });
  }

  async getVehicles(options?: {
    plateNumber?: string;
    vehicleType?: VehicleType;
    make?: string;
    model?: string;
    color?: string;
    watchlisted?: boolean;
    deviceId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
  }): Promise<{ vehicles: Vehicle[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.plateNumber) params.append('plateNumber', options.plateNumber);
    if (options?.vehicleType) params.append('vehicleType', options.vehicleType);
    if (options?.make) params.append('make', options.make);
    if (options?.model) params.append('model', options.model);
    if (options?.color) params.append('color', options.color);
    if (options?.watchlisted !== undefined) params.append('watchlisted', options.watchlisted.toString());
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.orderBy) params.append('orderBy', options.orderBy);
    if (options?.orderDir) params.append('orderDir', options.orderDir);
    const query = params.toString();
    return this.request<{ vehicles: Vehicle[]; total: number; limit: number; offset: number }>(
      `/api/vehicles${query ? `?${query}` : ''}`
    );
  }

  async getVehicle(id: string): Promise<Vehicle> {
    return this.request<Vehicle>(`/api/vehicles/${id}`);
  }

  async updateVehicle(id: string, updates: {
    plateNumber?: string;
    make?: string;
    model?: string;
    vehicleType?: VehicleType;
    color?: string;
    metadata?: any;
  }): Promise<Vehicle> {
    return this.request<Vehicle>(`/api/vehicles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async getVehicleDetections(id: string, options?: {
    deviceId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }): Promise<VehicleDetection[]> {
    const params = new URLSearchParams();
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString();
    return this.request<VehicleDetection[]>(`/api/vehicles/${id}/detections${query ? `?${query}` : ''}`);
  }

  async getVehicleViolations(id: string, options?: {
    status?: ViolationStatus;
    limit?: number;
  }): Promise<TrafficViolation[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString();
    return this.request<TrafficViolation[]>(`/api/vehicles/${id}/violations${query ? `?${query}` : ''}`);
  }

  async addToWatchlist(id: string, data: {
    reason: string;
    addedBy: string;
    alertOnDetection?: boolean;
    alertOnViolation?: boolean;
    notes?: string;
  }): Promise<Watchlist> {
    return this.request<Watchlist>(`/api/vehicles/${id}/watchlist`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeFromWatchlist(id: string): Promise<void> {
    return this.request<void>(`/api/vehicles/${id}/watchlist`, {
      method: 'DELETE',
    });
  }

  async getWatchlist(): Promise<Watchlist[]> {
    return this.request<Watchlist[]>('/api/watchlist');
  }

  async createWatchlistByPlate(data: {
    plateNumber: string;
    reason: string;
    addedBy: string;
    alertOnDetection?: boolean;
    alertOnViolation?: boolean;
    notes?: string;
  }): Promise<Watchlist> {
    return this.request<Watchlist>('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAlerts(options?: {
    isRead?: boolean;
    alertType?: 'DETECTION' | 'VIOLATION';
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ alerts: WatchlistAlert[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.isRead !== undefined) params.append('isRead', options.isRead.toString());
    if (options?.alertType) params.append('alertType', options.alertType);
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString();
    return this.request<{ alerts: WatchlistAlert[]; total: number; limit: number; offset: number }>(`/api/alerts${query ? `?${query}` : ''}`);
  }

  async markAlertRead(id: string): Promise<void> {
    return this.request<void>(`/api/alerts/${id}/read`, {
      method: 'PATCH',
    });
  }

  async dismissAlert(id: string): Promise<void> {
    return this.request<void>(`/api/alerts/${id}`, {
      method: 'DELETE',
    });
  }

  async getAlertStats(): Promise<AlertStats> {
    return this.request<AlertStats>('/api/alerts/stats');
  }

  async getVehicleStats(): Promise<VehicleStats> {
    return this.request<VehicleStats>('/api/vehicles/stats');
  }

  // VCC (Vehicle Classification and Counting) endpoints
  async getVCCStats(options?: {
    startTime?: string;
    endTime?: string;
    groupBy?: 'hour' | 'day' | 'week' | 'month' | 'minute';
    location?: string;
    excludeDevicePrefix?: string;
  }): Promise<VCCStats> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.groupBy) params.append('groupBy', options.groupBy);
    if (options?.location) params.append('location', options.location);
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    const query = params.toString();
    return this.request<VCCStats>(`/api/vcc/stats${query ? `?${query}` : ''}`);
  }

  async getVCCByDevice(deviceId: string, options?: {
    startTime?: string;
    endTime?: string;
    groupBy?: 'hour' | 'day' | 'minute';
  }): Promise<VCCDeviceStats> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.groupBy) params.append('groupBy', options.groupBy);
    const query = params.toString();
    return this.request<VCCDeviceStats>(`/api/vcc/device/${deviceId}${query ? `?${query}` : ''}`);
  }

  async getVCCRealtime(options?: {
    excludeDevicePrefix?: string;
  }): Promise<VCCRealtime> {
    const params = new URLSearchParams();
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    const query = params.toString();
    return this.request<VCCRealtime>(`/api/vcc/realtime${query ? `?${query}` : ''}`);
  }

  async getVCCCameras(options?: {
    active?: boolean;
  }): Promise<{ cameras: Array<{ id: string; name: string; location?: string; workerId?: string }> }> {
    const params = new URLSearchParams();
    if (options?.active !== undefined) params.append('active', String(options.active));
    const query = params.toString();
    return this.request(`/api/vcc/cameras${query ? `?${query}` : ''}`);
  }

  async getVCCHeatmap(options?: {
    startTime?: string;
    endTime?: string;
    location?: string;
    deviceIds?: string;
    excludeDevicePrefix?: string;
  }): Promise<VCCStats> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.location) params.append('location', options.location);
    if (options?.deviceIds) params.append('deviceIds', options.deviceIds);
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    const query = params.toString();
    return this.request<VCCStats>(`/api/vcc/stats${query ? `?${query}` : ''}`);
  }

  async getVCCEvents(options?: {
    startTime?: string;
    endTime?: string;
    deviceIds?: string;
    excludeDevicePrefix?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: any[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.deviceIds) params.append('deviceIds', options.deviceIds);
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const query = params.toString();
    return this.request(`/api/vcc/events${query ? `?${query}` : ''}`);
  }

  // ==================== Worker Management ====================

  // Admin: Get all workers
  async getWorkers(status?: WorkerStatus): Promise<WorkerWithCounts[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    const query = params.toString();
    return this.request<WorkerWithCounts[]>(`/api/admin/workers${query ? `?${query}` : ''}`);
  }

  // Admin: Get single worker
  async getWorker(id: string): Promise<Worker> {
    return this.request<Worker>(`/api/admin/workers/${id}`);
  }

  // Admin: Update worker
  async updateWorker(id: string, updates: { name?: string; tags?: string[] }): Promise<Worker> {
    return this.request<Worker>(`/api/admin/workers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Admin: Revoke worker
  async revokeWorker(id: string): Promise<void> {
    return this.request<void>(`/api/admin/workers/${id}/revoke`, {
      method: 'POST',
    });
  }

  // Admin: Delete worker
  async deleteWorker(id: string): Promise<void> {
    return this.request<void>(`/api/admin/workers/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin: Get pending approval requests
  async getApprovalRequests(status?: string): Promise<WorkerApprovalRequest[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    const query = params.toString();
    return this.request<WorkerApprovalRequest[]>(`/api/admin/workers/approval-requests${query ? `?${query}` : ''}`);
  }

  // Admin: Approve worker request
  async approveWorkerRequest(id: string): Promise<{ message: string; worker_id: string }> {
    return this.request<{ message: string; worker_id: string }>(`/api/admin/workers/approval-requests/${id}/approve`, {
      method: 'POST',
    });
  }

  // Admin: Reject worker request
  async rejectWorkerRequest(id: string, reason?: string): Promise<void> {
    return this.request<void>(`/api/admin/workers/approval-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Admin: Assign cameras to worker
  async assignCamerasToWorker(workerId: string, assignments: CameraAssignment[]): Promise<Worker> {
    return this.request<Worker>(`/api/admin/workers/${workerId}/cameras`, {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    });
  }

  // Admin: Get worker cameras
  async getWorkerCameras(workerId: string): Promise<WorkerCameraAssignment[]> {
    return this.request<WorkerCameraAssignment[]>(`/api/admin/workers/${workerId}/cameras`);
  }

  // Admin: Unassign camera from worker
  async unassignCameraFromWorker(workerId: string, deviceId: string): Promise<void> {
    return this.request<void>(`/api/admin/workers/${workerId}/cameras/${deviceId}`, {
      method: 'DELETE',
    });
  }

  // ==================== Worker Tokens ====================

  // Admin: Create worker token
  async createWorkerToken(data: { name: string; expires_in?: number; created_by?: string }): Promise<WorkerToken> {
    return this.request<WorkerToken>('/api/admin/worker-tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin: Get all tokens
  async getWorkerTokens(options?: { show_used?: boolean; show_revoked?: boolean }): Promise<WorkerTokenWithStatus[]> {
    const params = new URLSearchParams();
    if (options?.show_used) params.append('show_used', 'true');
    if (options?.show_revoked) params.append('show_revoked', 'true');
    const query = params.toString();
    return this.request<WorkerTokenWithStatus[]>(`/api/admin/worker-tokens${query ? `?${query}` : ''}`);
  }

  // Admin: Revoke token
  async revokeWorkerToken(id: string): Promise<void> {
    return this.request<void>(`/api/admin/worker-tokens/${id}/revoke`, {
      method: 'POST',
    });
  }

  // Admin: Delete token
  async deleteWorkerToken(id: string): Promise<void> {
    return this.request<void>(`/api/admin/worker-tokens/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin: Bulk create tokens
  async bulkCreateWorkerTokens(data: { count: number; prefix?: string; expires_in?: number }): Promise<{ tokens: WorkerToken[] }> {
    return this.request<{ tokens: WorkerToken[] }>('/api/admin/worker-tokens/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Operator management (admin)
  async getOperatorAccounts(): Promise<{ operators: any[]; pendingApprovals: number }> {
    return this.request<{ operators: any[]; pendingApprovals: number }>('/api/admin/auth/operators');
  }

  async unlockOperatorAccount(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/admin/auth/operators/${encodeURIComponent(id)}/unlock`, {
      method: 'POST',
    });
  }

  async resetOperatorPassword(id: string, password?: string): Promise<{ message: string; password: string }> {
    return this.request<{ message: string; password: string }>(`/api/admin/auth/operators/${encodeURIComponent(id)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async approveOperatorAccess(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/admin/auth/operators/${encodeURIComponent(id)}/approve-access`, {
      method: 'POST',
    });
  }

  async getOperatorLoginEvents(limit = 200): Promise<{ events: any[] }> {
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    return this.request<{ events: any[] }>(`/api/admin/auth/operators/logins?${q.toString()}`);
  }

  async getOperatorActivityEvents(id: string, limit = 200): Promise<{ events: any[] }> {
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    return this.request<{ events: any[] }>(`/api/admin/auth/operators/${encodeURIComponent(id)}/activity?${q.toString()}`);
  }

  async forceLogoutOperatorAccount(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/admin/auth/operators/${encodeURIComponent(id)}/force-logout`, {
      method: 'POST',
    });
  }

  async operatorResetPassword(data: { email: string; tempPassword: string; newPassword: string }): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/operator/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// Violation Types
export type ViolationType = 'SPEED' | 'HELMET' | 'RIDER_HELMET' | 'PILLION_HELMET' | 'WRONG_SIDE' | 'RED_LIGHT' | 'NO_SEATBELT' | 'OVERLOADING' | 'UNCOVERED_LOAD' | 'ILLEGAL_PARKING' | 'TRIPLE_RIDING' | 'MINOR_RIDER' | 'MOBILE_USE' | 'OTHER';
export type ViolationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FINED' | 'PAID' | 'VOIDED';
export type DetectionMethod = 'RADAR' | 'CAMERA' | 'AI_VISION' | 'MANUAL';

export interface TrafficViolation {
  id: string;
  deviceId: string;
  device?: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: DeviceType;
  };
  timestamp: string;
  violationType: ViolationType;
  status: ViolationStatus;
  detectionMethod: DetectionMethod;
  plateNumber?: string | null;
  plateConfidence?: number | null;
  plateImageUrl?: string | null;
  fullSnapshotUrl?: string | null;
  video?: string | null;
  frameId?: string | null;
  detectedSpeed?: number | null;
  speedLimit2W?: number | null;
  speedLimit4W?: number | null;
  speedOverLimit?: number | null;
  confidence?: number | null;
  metadata?: any;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  rejectionReason?: string | null;
  fineAmount?: number | null;
  fineIssuedAt?: string | null;
  fineReference?: string | null;
  paidAt?: string | null;
  paidAmount?: number | null;
  paymentReference?: string | null;
  paymentMethod?: string | null;
}

export interface RCDetails {
  rc_number: string;
  owner_name: string;
  owner_number?: string | null;
  address?: string | null;
  chassis_no?: string | null;
  mobile_no?: string | null;
  // Fields below are populated by the legacy wiredleap API but NOT by
  // the SP Belagavi SOAP service. Kept optional for backward compat.
  registration_date?: string;
  maker_description?: string;
  maker_model?: string;
  body_type?: string;
  color?: string;
  fuel_type?: string;
  vehicle_category?: string;
  vehicle_category_description?: string;
  vehicle_chasi_number?: string;
  vehicle_engine_number?: string | null;
  vehicle_class?: string | null;
  vehicle_gross_weight?: string;
  unladen_weight?: string;
  fit_up_to?: string;
  insurance_upto?: string;
  pucc_upto?: string | null;
  rc_status?: string;
  norms_type?: string;
  financed?: boolean;
  blacklist_status?: string;
  permit_number?: string;
  permit_issue_date?: string | null;
  permit_valid_from?: string | null;
  national_permit_number?: string;
  national_permit_upto?: string | null;
}

export interface ViolationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  fined: number;
  byType: Record<string, number>;
  byDevice: Record<string, number>;
  byHour?: Record<number, number>; // 0-23 hour distribution
  byTime?: Array<{ hour: number; count: number }>; // For trendline visualization
}

// Dispute types — see backend/handlers/dispute.go
export type DisputeReason =
  | 'WRONG_PLATE'
  | 'NOT_OWNER'
  | 'WRONG_PERSON'
  | 'ALREADY_PAID'
  | 'NO_VIOLATION'
  | 'DUPLICATE'
  | 'OTHER';

export type DisputeStatus = 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';

export interface ViolationDispute {
  id: number;
  violationId: number;
  violation?: TrafficViolation | null;
  phone: string;
  reason: DisputeReason;
  description: string;
  evidenceUrl?: string;
  status: DisputeStatus;
  operatorId?: string;
  operatorNotes?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
}

// Vehicle Types
export type VehicleType = '2W' | '4W' | 'AUTO' | 'TRUCK' | 'BUS' | 'UNKNOWN';

export interface Vehicle {
  id: string;
  plateNumber?: string | null;
  make?: string | null;
  model?: string | null;
  vehicleType: VehicleType;
  color?: string | null;
  firstSeen: string;
  lastSeen: string;
  detectionCount: number;
  isWatchlisted: boolean;
  thumbnailUrl?: string | null;
  matchedAt?: string | null;
  matchedDeviceId?: string | null;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  watchlist?: Watchlist;
}

export interface VehicleDetection {
  id: string;
  vehicleId?: string | null;
  vehicle?: Vehicle;
  deviceId: string;
  device?: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: DeviceType;
  };
  timestamp: string;
  plateNumber?: string | null;
  plateConfidence?: number | null;
  make?: string | null;
  model?: string | null;
  vehicleType: VehicleType;
  color?: string | null;
  confidence?: number | null;
  plateDetected: boolean;
  makeModelDetected: boolean;
  fullImageUrl?: string | null;
  plateImageUrl?: string | null;
  vehicleImageUrl?: string | null;
  frameId?: string | null;
  direction?: string | null;
  lane?: number | null;
  metadata?: any;
}

export interface Watchlist {
  id: string;
  vehicleId: string;
  vehicle?: Vehicle;
  reason: string;
  addedBy: string;
  addedAt: string;
  isActive: boolean;
  alertOnDetection: boolean;
  alertOnViolation: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistAlert {
  id: string;
  watchlistId: string;
  watchlist?: Watchlist;
  vehicleId?: string;
  vehicle?: Vehicle;
  detectionId?: string;
  detection?: VehicleDetection;
  alertType: 'DETECTION' | 'VIOLATION';
  message: string;
  isRead: boolean;
  readAt?: string;
  deviceId: string;
  device?: Device;
  timestamp: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface AlertStats {
  total: number;
  unread: number;
  read: number;
  today: number;
  byType: Record<string, number>;
}

export interface VehicleStats {
  total: number;
  withPlates: number;
  withoutPlates: number;
  watchlisted: number;
  byType: Record<string, number>;
  byMake: Record<string, number>;
  detectionsToday: number;
}

// VCC (Vehicle Classification and Counting) Types
export interface VCCDeviceSummary {
  deviceId: string;
  deviceName: string;
  count: number;
  totalDetections?: number;
  byType?: Record<string, number>;
}

export interface VCCStats {
  totalDetections: number;
  uniqueVehicles: number;
  byVehicleType: Record<string, number>;
  byTime: Array<{ hour?: string; day?: string; week?: string; month?: string; count: number; [k: string]: any }>;
  byDevice: VCCDeviceSummary[];
  byHour: Record<string, number>; // 0-23
  byDayOfWeek: Record<string, number>;
  peakHour: number;
  peakDay: string;
  averagePerHour: number;
  classification: {
    withPlates: number;
    withoutPlates: number;
    withMakeModel: number;
    plateOnly: number;
    fullClassification: number;
  };
}

export interface VCCDeviceStats {
  deviceId: string;
  deviceName: string;
  totalDetections: number;
  uniqueVehicles: number;
  byVehicleType: Record<string, number>;
  byHour: Record<string, number>;
  byDayOfWeek?: Record<string, number>;
  byTime?: Array<{ hour?: string; day?: string; week?: string; month?: string; count: number; [k: string]: any }>;
  peakHour: number;
  averagePerHour: number;
  classification: {
    withPlates: number;
    withoutPlates: number;
    withMakeModel: number;
    plateOnly: number;
    fullClassification: number;
  };
}

export interface VCCRealtime {
  totalDetections: number;
  byVehicleType: Record<string, number>;
  byDevice: Array<{ deviceId: string; deviceName: string; count: number }>;
  perMinute: number;
}
