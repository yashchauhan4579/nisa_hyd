// API Client - Updated 2025-12-26
// Use relative path for API calls - Vite will proxy /api to backend
const API_BASE_URL = import.meta.env.VITE_API_Base_URL || '';

// Phase 1: route everything through the in-browser mock layer until the backend lands.
import { USE_MOCK, mockRequest, mockLogin } from '@/mocks';

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

export type DeviceType = 'CAMERA' | 'DRONE' | 'SENSOR';
export type DeviceStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'active' | 'inactive' | 'maintenance';

// Full device interface (for detail views)
export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  lat: number;
  lng: number;
  status: DeviceStatus;
  zoneId?: string;
  description?: string | null;
  rtspUrl?: string | null;
  metadata?: Record<string, any>;
  config?: Record<string, any>;
  events?: any[];
  workerId?: string | null;
  createdAt: string;
  updatedAt: string;
  latestEvent?: {
    id: string;
    eventType: string;
    data: Record<string, any>;
    timestamp: string;
  };
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    role: string;
  };
}

export interface LoginRequest {
  username: string;
  password: string;
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

// Camera Health interfaces
export interface CameraHealth {
  id: string; // IP address
  cameraId: string; // Camera name
  location: string;
  status: string; // "online" | "offline"
  lastPing: string;
  latencyMs: number;
}

export interface CameraHealthHistory {
  timestamp: string;
  status: string;
  latencyMs: number;
  cameraId: string;
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
  cumulativeCount?: number | null;
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

// ----- Alerts (central alert-rules engine + fired alert events) -----
export type AlertModule = 'crowd' | 'itms' | 'frs' | 'search' | 'forensics';

export interface CrowdAlertParams {
  threshold: number;
  deviceIds: string[];
}
export interface ItmsAlertParams {
  watchlistMatch: boolean;
  violationTypes: string[];
  deviceIds: string[];
  plates?: string[];
}
export interface FrsAlertParams {
  personIds: string[];
  minMatchScore: number;
  deviceIds: string[];
}
export interface SearchAlertParams {
  prompt: string;
  minScore: number;
  topK: number;
}
export interface ForensicsAlertParams {
  riskLevels: string[];
  keywords: string[];
}
export type AlertRuleParams =
  | CrowdAlertParams
  | ItmsAlertParams
  | FrsAlertParams
  | SearchAlertParams
  | ForensicsAlertParams;

export interface AlertRule {
  id: number;
  module: AlertModule;
  name: string;
  enabled: boolean;
  params: AlertRuleParams;
  whatsappTo: string;
  cooldownSec: number;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: number;
  ruleId: number;
  module: string;
  title: string;
  message: string;
  snapshotUrl: string | null;
  value: number | null;
  deviceId: string | null;
  sentWhatsapp: boolean;
  sendError: string | null;
  createdAt: string;
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
  private token: string | null = localStorage.getItem('token');

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    if (USE_MOCK) {
      const res = (await mockLogin(data)) as AuthResponse;
      this.setToken(res.token);
      localStorage.setItem('iris_token', res.token);
      return res;
    }
    // Unified backend uses POST /api/auth/login with { email, password }.
    // The login form labels the field "username"; we send it as email.
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.username, password: data.password }),
    });

    if (!response.ok) {
      let errorMessage = 'Login failed';
      try {
        const text = await response.text();
        try {
          const error = JSON.parse(text);
          errorMessage = error.error || errorMessage;
        } catch {
          if (text) errorMessage = text;
          else errorMessage = `Login failed (${response.status})`;
        }
      } catch {
        errorMessage = `Login failed (${response.status})`;
      }
      throw new Error(errorMessage);
    }

    const res = await response.json();
    this.setToken(res.token);
    // Mirror token to the key the ported @sringeri / @irisdrone clients read.
    localStorage.setItem('iris_token', res.token);
    // Normalize user shape (backend returns email, no username).
    if (res.user && !res.user.username) res.user.username = res.user.email ?? 'operator';
    return res;
  }

  // CSRF token cache. Mutating requests (POST/PUT/DELETE/PATCH) must send an
  // X-CSRF-Token header matching the csrf_token cookie (double-submit). We fetch
  // it lazily, cache it, and refetch once on a 403.
  private csrfToken: string | null = null;
  private async ensureCsrf(force = false): Promise<string | null> {
    if (this.csrfToken && !force) return this.csrfToken;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/csrf-token`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
        credentials: 'same-origin',
      });
      if (res.ok) this.csrfToken = (await res.json()).csrfToken || null;
    } catch { /* leave null */ }
    return this.csrfToken;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    if (USE_MOCK) {
      return mockRequest<T>(endpoint, options);
    }

    const method = (options?.method || 'GET').toUpperCase();
    const mutating = method !== 'GET' && method !== 'HEAD';

    const send = async (): Promise<Response> => {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options?.headers,
      };
      if (this.token) {
        // @ts-ignore
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      if (mutating) {
        // @ts-ignore
        headers['X-CSRF-Token'] = (await this.ensureCsrf()) || '';
      }
      return fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'same-origin',
      });
    };

    let response = await send();
    // A stale/missing CSRF token surfaces as 403 — refetch and retry once.
    if (response.status === 403 && mutating) {
      await this.ensureCsrf(true);
      response = await send();
    }

    if (!response.ok) {
      if (response.status === 401) {
        // Automatically logout on 401 (expired/invalid token)
        this.setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.clear();
        window.location.href = '/login';
      }
      throw new Error(`API Error: ${response.statusText}`);
    }

    // 204/empty responses have no JSON body.
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // Device endpoints
  async getDevices(options?: {
    type?: DeviceType;
    minimal?: boolean; // Return only essential fields for map view
    limit?: number;
    offset?: number;
  }): Promise<Device[] | DeviceMapMarker[]> {
    const params = new URLSearchParams();
    if (options?.type) {
      params.append('type', options.type);
    }
    if (options?.minimal) {
      params.append('minimal', 'true');
    }
    // Request all devices if no limit specified (backward compatibility)
    if (options?.limit !== undefined) {
      params.append('limit', options.limit.toString());
    } else {
      params.append('limit', '200'); // Default max limit
    }
    if (options?.offset !== undefined) {
      params.append('offset', options.offset.toString());
    }
    const query = params.toString();
    const response = await this.request<any>(
      `/api/devices${query ? `?${query}` : ''}`
    );
    // Handle paginated response format
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data as Device[] | DeviceMapMarker[];
    }
    // Fallback for old array format (backward compatibility)
    return response as Device[] | DeviceMapMarker[];
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
    return this.request<Device>(`/api/devices/${id}`);
  }

  async createDevice(device: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Promise<Device> {
    return this.request<Device>('/api/devices', {
      method: 'POST',
      body: JSON.stringify(device),
    });
  }

  async updateDevice(id: string, updates: Partial<Device>): Promise<Device> {
    return this.request<Device>(`/api/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteDevice(id: string): Promise<void> {
    return this.request<void>(`/api/devices/${id}`, {
      method: 'DELETE',
    });
  }

  // Camera Health endpoints
  async getCameraHealth(): Promise<CameraHealth[]> {
    return this.request<CameraHealth[]>('/api/camera-health');
  }

  async getCameraHealthHistory(options?: {
    startTime?: string;
    endTime?: string;
  }): Promise<CameraHealthHistory[]> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    const query = params.toString();
    return this.request<CameraHealthHistory[]>(`/api/camera-health/history${query ? `?${query}` : ''}`);
  }

  async addCameraHealthTarget(target: { ip: string; name: string; location?: string }): Promise<void> {
    return this.request<void>('/api/camera-health/targets', {
      method: 'POST',
      body: JSON.stringify(target),
    });
  }

  async deleteCameraHealthTarget(ip: string): Promise<void> {
    return this.request<void>(`/api/camera-health/targets/${encodeURIComponent(ip)}`, {
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
    light?: boolean;
  }): Promise<CrowdAnalysis[]> {
    const params = new URLSearchParams();
    if (options?.light) {
      params.append('light', '1');
    }
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

  async getCrowdTrend(options: { startTime: string; endTime?: string; granularity: '5min' | 'hour' | 'day'; deviceId?: string }): Promise<Array<{
    period: string;
    avgPeople: number;
    maxPeople: number;
    samples: number;
    cumulative: number;
  }>> {
    const params = new URLSearchParams({ startTime: options.startTime, granularity: options.granularity });
    if (options.endTime) params.append('endTime', options.endTime);
    if (options.deviceId) params.append('deviceId', options.deviceId);
    return this.request(`/api/crowd/analysis/trend?${params.toString()}`);
  }

  async getCrowdFootfall(options: { startTime?: string; endTime?: string }): Promise<{
    totalFootfall: number;
    perCamera: Array<{
      deviceId: string;
      name: string;
      footfall: number;
      peakHour?: number;
      peakHourValue: number;
      peakPeople?: number;
      avgPeople?: number;
    }>;
  }> {
    const params = new URLSearchParams();
    if (options.startTime) params.append('startTime', options.startTime);
    if (options.endTime) params.append('endTime', options.endTime);
    const q = params.toString();
    return this.request(`/api/crowd/analysis/footfall${q ? `?${q}` : ''}`);
  }

  async getCrowdAlerts(options?: {
    isResolved?: boolean;
    severity?: string;
    limit?: number;
    startTime?: string;
    endTime?: string;
  }): Promise<CrowdAlertRow[]> {
    const params = new URLSearchParams();
    if (options?.isResolved !== undefined) params.append('isResolved', options.isResolved.toString());
    if (options?.severity) params.append('severity', options.severity);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    const query = params.toString();
    return this.request<CrowdAlertRow[]>(`/api/crowd/alerts${query ? `?${query}` : ''}`);
  }

  async getCrowdAlertThresholds(): Promise<Record<string, number>> {
    return this.request<Record<string, number>>('/api/crowd/alert-thresholds');
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
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FINED';
    violationType?: 'SPEED' | 'HELMET' | 'WRONG_SIDE' | 'RED_LIGHT' | 'NO_SEATBELT' | 'OVERLOADING' | 'ILLEGAL_PARKING' | 'OTHER';
    deviceId?: string;
    plateNumber?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ violations: TrafficViolation[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.violationType) params.append('violationType', options.violationType);
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.plateNumber) params.append('plateNumber', options.plateNumber);
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString();
    return this.request<{ violations: TrafficViolation[]; total: number; limit: number; offset: number }>(
      `/api/violations${query ? `?${query}` : ''}`
    );
  }

  async getViolation(id: string): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}`);
  }

  async approveViolation(id: string, data?: { reviewNote?: string; reviewedBy?: string }): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    });
  }

  async rejectViolation(id: string, data: { rejectionReason: string; reviewedBy?: string }): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateViolationPlate(id: string, plateNumber: string): Promise<TrafficViolation> {
    return this.request<TrafficViolation>(`/api/violations/${id}/plate`, {
      method: 'PATCH',
      body: JSON.stringify({ plateNumber }),
    });
  }

  async getViolationStats(): Promise<ViolationStats> {
    return this.request<ViolationStats>('/api/violations/stats');
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
    deviceIds?: string; // comma-separated camera/device IDs (server-side filter)
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
    if (options?.deviceIds) params.append('deviceIds', options.deviceIds);
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

  // Add a plate to the watchlist directly (creates the vehicle if it doesn't
  // exist yet; the backend also retro-creates alerts for the last 48 h).
  async addWatchlistPlate(data: {
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

  // Watchlist alert feed (WatchlistAlert rows created on ingest matches).
  async getWatchlistAlerts(options?: {
    isRead?: boolean;
    alertType?: string;
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
    return this.request(`/api/alerts${query ? `?${query}` : ''}`);
  }

  async markWatchlistAlertRead(id: string | number): Promise<void> {
    return this.request<void>(`/api/alerts/${id}/read`, { method: 'PATCH' });
  }

  async getAlertStats(): Promise<AlertStats> {
    return this.request<AlertStats>('/api/alerts/stats');
  }

  // FRS (face recognition) — read-only views used by reports/dashboards.
  async getFRSPersons(): Promise<FRSPerson[]> {
    return this.request<FRSPerson[]>('/api/frs/persons');
  }

  async getFRSDetections(options?: { limit?: number; personId?: string; deviceId?: string; unknown?: boolean; startTime?: string; endTime?: string }): Promise<FRSDetection[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.personId) params.append('personId', options.personId);
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.unknown !== undefined) params.append('unknown', options.unknown.toString());
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    const query = params.toString();
    return this.request<FRSDetection[]>(`/api/frs/detections${query ? `?${query}` : ''}`);
  }

  async getVehicleStats(): Promise<VehicleStats> {
    return this.request<VehicleStats>('/api/vehicles/stats');
  }

  async getVehicleStatsTimeline(options?: {
    startTime?: string;
    endTime?: string;
  }): Promise<{
    hourly: number[];
    byCamera: { deviceId: string; deviceName: string; count: number }[];
    totalDetections: number;
    uniquePlates: number;
    watchlistHits: number;
    start: string;
    end: string;
  }> {
    const p = new URLSearchParams();
    if (options?.startTime) p.append('startTime', options.startTime);
    if (options?.endTime) p.append('endTime', options.endTime);
    const q = p.toString();
    return this.request(`/api/vehicles/stats/timeline${q ? `?${q}` : ''}`);
  }

  // VCC (Vehicle Classification and Counting) endpoints
  async getVCCStats(options?: {
    startTime?: string;
    endTime?: string;
    groupBy?: 'minute' | 'hour' | 'day' | 'week' | 'month';
    location?: string;
    deviceIds?: string;
    devicePrefix?: string;
    excludeDevicePrefix?: string;
  }): Promise<VCCStats> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.groupBy) params.append('groupBy', options.groupBy);
    if (options?.location) params.append('location', options.location);
    if (options?.deviceIds) params.append('deviceIds', options.deviceIds);
    if (options?.devicePrefix) params.append('devicePrefix', options.devicePrefix);
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    const query = params.toString();
    return this.request<VCCStats>(`/api/vcc/stats${query ? `?${query}` : ''}`);
  }

  async getVCCHeatmap(options?: {
    startTime?: string;
    endTime?: string;
    location?: string;
    deviceIds?: string;
    devicePrefix?: string;
    excludeDevicePrefix?: string;
  }): Promise<VCCStats> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.location) params.append('location', options.location);
    if (options?.deviceIds) params.append('deviceIds', options.deviceIds);
    if (options?.devicePrefix) params.append('devicePrefix', options.devicePrefix);
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    const query = params.toString();
    return this.request<VCCStats>(`/api/vcc/heatmap${query ? `?${query}` : ''}`);
  }

  async getVCCByDevice(deviceId: string, options?: {
    startTime?: string;
    endTime?: string;
    groupBy?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  }): Promise<VCCDeviceStats> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.groupBy) params.append('groupBy', options.groupBy);
    const query = params.toString();
    return this.request<VCCDeviceStats>(`/api/vcc/device/${deviceId}${query ? `?${query}` : ''}`);
  }

  // Get VCC cameras (data-driven, only cameras that have sent detection data)
  async getVCCCameras(options?: { active?: boolean }): Promise<{
    cameras: { id: string; name: string; location?: string; lastSeen?: string; workerId?: string }[];
    total: number;
    activeLast1h: number;
  }> {
    const params = new URLSearchParams();
    if (options?.active) params.append('active', 'true');
    const query = params.toString();
    return this.request<{
      cameras: { id: string; name: string; location?: string; lastSeen?: string; workerId?: string }[];
      total: number;
      activeLast1h: number;
    }>(`/api/vcc/cameras${query ? `?${query}` : ''}`);
  }

  async getVCCRealtime(options?: { devicePrefix?: string; excludeDevicePrefix?: string }): Promise<VCCRealtime> {
    const params = new URLSearchParams();
    if (options?.devicePrefix) params.append('devicePrefix', options.devicePrefix);
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    const query = params.toString();
    return this.request<VCCRealtime>(`/api/vcc/realtime${query ? `?${query}` : ''}`);
  }

  async getVCCEvents(options?: {
    startTime?: string;
    endTime?: string;
    deviceId?: string;
    deviceIds?: string;
    vehicleType?: string;
    devicePrefix?: string;
    excludeDevicePrefix?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: VehicleDetection[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.deviceIds) params.append('deviceIds', options.deviceIds);
    if (options?.vehicleType) params.append('vehicleType', options.vehicleType);
    if (options?.devicePrefix) params.append('devicePrefix', options.devicePrefix);
    if (options?.excludeDevicePrefix) params.append('excludeDevicePrefix', options.excludeDevicePrefix);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString();
    return this.request<{ events: VehicleDetection[]; total: number; limit: number; offset: number }>(
      `/api/vcc/events${query ? `?${query}` : ''}`
    );
  }

  // ==================== Worker Management ====================

  // Admin: Get all workers
  async getWorkers(status?: WorkerStatus): Promise<WorkerWithCounts[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    const query = params.toString();
    const response = await this.request<any>(`/api/admin/workers${query ? `?${query}` : ''}`);

    // Handle paginated response
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data as WorkerWithCounts[];
    }

    // Fallback for array response
    return response as WorkerWithCounts[];
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
    const response = await this.request<any>(`/api/admin/workers/approval-requests${query ? `?${query}` : ''}`);

    // Handle paginated response
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data as WorkerApprovalRequest[];
    }

    // Fallback for array response
    return response as WorkerApprovalRequest[];
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

  // ==================== Alert Rules & Events ====================

  async getAlertRules(module?: AlertModule): Promise<AlertRule[]> {
    const query = module ? `?module=${encodeURIComponent(module)}` : '';
    return this.request<AlertRule[]>(`/api/alert-rules${query}`);
  }

  async createAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt' | 'lastFiredAt'>): Promise<AlertRule> {
    return this.request<AlertRule>('/api/alert-rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  }

  async updateAlertRule(id: number, rule: Partial<AlertRule>): Promise<AlertRule> {
    return this.request<AlertRule>(`/api/alert-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    });
  }

  async deleteAlertRule(id: number): Promise<void> {
    return this.request<void>(`/api/alert-rules/${id}`, {
      method: 'DELETE',
    });
  }

  async testAlertRule(id: number): Promise<{ ok: boolean; error?: string }> {
    return this.request<{ ok: boolean; error?: string }>(`/api/alert-rules/${id}/test`, {
      method: 'POST',
    });
  }

  async getAlertEvents(opts?: { module?: AlertModule; limit?: number }): Promise<AlertEvent[]> {
    const params = new URLSearchParams();
    if (opts?.module) params.append('module', opts.module);
    if (opts?.limit !== undefined) params.append('limit', opts.limit.toString());
    const query = params.toString();
    return this.request<AlertEvent[]>(`/api/alert-events${query ? `?${query}` : ''}`);
  }

  // Iris-search (CLIP semantic video search) — Python sidecar via Vite proxy (/searchapi -> :8200)
  async search(req: SearchRequest): Promise<SearchResponse> {
    if (USE_MOCK) return mockRequest<SearchResponse>('/api/search', { method: 'POST', body: JSON.stringify(req) });
    const res = await fetch('/searchapi/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    return res.json();
  }

  async getSearchClip(source: string, ts: number): Promise<SearchClip> {
    if (USE_MOCK) return mockRequest<SearchClip>(`/api/search/clip?source=${encodeURIComponent(source)}&ts=${ts}`);
    const res = await fetch(`/searchapi/clip?source=${encodeURIComponent(source)}&ts=${ts}`);
    if (!res.ok) throw new Error(`Clip failed (${res.status})`);
    return res.json();
  }

  // Iris-search cameras: which sources the CLIP sidecar indexes for inference.
  async getSearchCameras(): Promise<SearchCamerasResponse> {
    if (USE_MOCK) return { cameras: [], status: 'ready', indexed: 0, total: 0 };
    const res = await fetch('/searchapi/videos');
    if (!res.ok) throw new Error(`List cameras failed (${res.status})`);
    return res.json();
  }

  async addSearchCamera(cam: { name: string; source: string; id?: string }): Promise<SearchCamera> {
    const res = await fetch('/searchapi/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cam),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Add camera failed (${res.status})`);
    return res.json();
  }

  async removeSearchCamera(id: string): Promise<void> {
    const res = await fetch(`/searchapi/videos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Remove camera failed (${res.status})`);
  }

  // Pause / resume live (RTSP/HLS) indexing for one camera. Pause stops new-segment
  // recording but keeps its already-indexed data searchable; resume restarts it.
  async setSearchCameraPaused(id: string, paused: boolean): Promise<void> {
    const action = paused ? 'pause' : 'resume';
    const res = await fetch(`/searchapi/videos/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `${action} failed (${res.status})`);
  }

  // Upload a local video file to the CLIP sidecar; it's saved + indexed like a
  // static camera. Uses XHR so we can surface upload progress in the UI.
  uploadSearchVideo(
    file: File,
    name: string,
    onProgress?: (pct: number) => void,
  ): Promise<SearchCamera> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name || '');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/searchapi/upload');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Bad upload response')); }
        } else {
          let detail = `Upload failed (${xhr.status})`;
          try { detail = JSON.parse(xhr.responseText).detail || detail; } catch { /* keep default */ }
          reject(new Error(detail));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed — search service unreachable'));
      xhr.send(form);
    });
  }
}

// ----- Iris-search types -----
export interface SearchCamera {
  id: string;
  name: string;
  source: string;
  status: 'queued' | 'indexing' | 'ready' | 'error' | 'live' | 'paused';
  frames?: number;
  error?: string;
  kind?: 'upload' | 'live' | 'static';
}
export interface SearchCamerasResponse {
  cameras: SearchCamera[];
  status: string;
  indexed: number;
  total: number;
}
export interface SearchRequest {
  query: string;
  model?: string;
  fps?: number;
  topK?: number;
  minScore?: number;
  nms?: boolean;
  nmsWindow?: number;
  dedup?: boolean;
  deviceIds?: string[];
}
export interface SearchResult {
  id: string;
  deviceId: string;
  deviceName: string;
  timestamp: number;
  timeLabel: string;
  score: number;
  thumbnailUrl: string;
  clipPath: string;
}
export interface SearchResponse {
  results: SearchResult[];
  total: number;
  hidden: number;
  query: string;
}
export interface SearchClip {
  source: string;
  ts: number;
  frames: string[];
  clipFps: number;
  matchIndex?: number;
}

export const apiClient = new ApiClient(API_BASE_URL);

// Violation Types
export type ViolationType = 'SPEED' | 'HELMET' | 'WRONG_SIDE' | 'RED_LIGHT' | 'NO_SEATBELT' | 'OVERLOADING' | 'ILLEGAL_PARKING' | 'OTHER';
export type ViolationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FINED';
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
}

export interface ViolationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  fined: number;
  byType: Record<string, number>;
  byDevice: Record<string, number>;
}

// Vehicle Types
export type VehicleType = '2W' | '4W' | 'AUTO' | 'BUS' | 'HMV' | 'UNKNOWN';

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
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  watchlist?: Watchlist;
  // GetVehicles attaches the latest detection per vehicle (image URLs live here).
  detections?: VehicleDetection[];
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

// Watchlist alert rows (created when ANPR ingest matches an active watchlist
// entry, retroactively by POST /api/watchlist, or by FRS known-face matches).
export interface WatchlistAlert {
  id: string | number;
  watchlistId: string | number;
  watchlist?: Watchlist;
  vehicleId?: string | number | null;
  vehicle?: Vehicle | null;
  detectionId?: string | number | null;
  detection?: VehicleDetection | null;
  alertType: string; // "DETECTION" | "VIOLATION" | "FRS_KNOWN_FACE"
  message: string;
  isRead: boolean;
  readAt?: string | null;
  deviceId: string;
  device?: Device | null;
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

// FRS (face recognition) types — mirror the backend frs.go JSON.
export interface FRSPerson {
  id: string;
  name: string;
  age: number;
  gender: string;
  status: string;
  height: string;
  aliases: string;
  category: string;
  threatLevel: string;
  notes: string;
  faceImageUrl: string | null;
  embedding?: any;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface FRSDetection {
  id: number;
  personId: string;
  person?: FRSPerson;
  deviceId: string;
  device?: Device;
  timestamp: string;
  confidence: number;
  matchScore: number;
  faceSnapshotUrl: string | null;
  fullSnapshotUrl: string | null;
  frameId: string | null;
  bbox: any;
  metadata?: any;
}

// Crowd alert rows (threshold breaches / worker alerts) as served by
// GET /api/crowd/alerts.
export interface CrowdAlertRow {
  id: string;
  deviceId: string;
  alertType: string;
  severity: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  priority: number;
  peopleCount: number | null;
  densityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  congestionLevel: number | null;
  title: string;
  description: string | null;
  isResolved: boolean;
  timestamp: string;
  frameUrl?: string | null;
  device: { id: string; name: string; lat: number; lng: number; type: string };
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
export interface VCCStats {
  totalDetections: number;
  uniqueVehicles: number;
  byVehicleType: Record<string, number>;
  byTime: Array<{
    hour?: string;
    day?: string;
    week?: string;
    month?: string;
    count: number;
    "2W"?: number;
    "4W"?: number;
    "AUTO"?: number;
    "BUS"?: number;
    "HMV"?: number;
  }>;
  byDevice: Array<{
    deviceId: string;
    deviceName: string;
    totalDetections: number;
    byType: Record<string, number>;
  }>;
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
  byTime: Array<{
    hour?: string;
    day?: string;
    week?: string;
    month?: string;
    count: number;
    "2W"?: number;
    "4W"?: number;
    "AUTO"?: number;
    "BUS"?: number;
    "HMV"?: number;
  }>;
  byHour: Record<string, number>;
  byDayOfWeek: Record<string, number>;
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

