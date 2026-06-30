// IRIS adapter for the MagicBox-hub VMS pages.
// VMS is a SEPARATE module: its cameras live in their own `vms_cameras` table
// (backend /api/vms/cameras), independent of the shared /api/devices the
// crowd/ANPR/violation modules use. This module emulates the MagicBox device→
// camera API *surface* on top of that flat camera list so the pages render and
// add/remove cameras manually. Each vms_camera is both a "device" and its single
// camera (IRIS is camera-centric); live video is MediaMTX HLS off the edge host.

const token = () => localStorage.getItem('token') || localStorage.getItem('iris_token');
const authHeaders = () => (token() ? { Authorization: `Bearer ${token()}` } : {});

async function jget(path) {
  const res = await fetch(path, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return { data: await res.json() };
}

// CSRF: mutations need X-CSRF-Token matching the csrf_token cookie. Fetch once,
// cache, and refetch on a 403 (expired/missing).
let _csrf = null;
async function getCsrf(force) {
  if (_csrf && !force) return _csrf;
  try {
    const res = await fetch('/api/auth/csrf-token', { headers: { ...authHeaders() }, credentials: 'same-origin' });
    if (res.ok) _csrf = (await res.json()).csrfToken || null;
  } catch { /* leave null */ }
  return _csrf;
}

async function jmut(path, method, body) {
  const send = async () => fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-CSRF-Token': (await getCsrf()) || '' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  let res = await send();
  if (res.status === 403) { await getCsrf(true); res = await send(); }
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return { data: res.status === 204 ? {} : await res.json() };
}

// MediaMTX HLS lives on the edge host (port 8888), not the frontend host.
const MEDIAMTX_FALLBACK =
  import.meta.env.VITE_MEDIAMTX_HLS_URL ||
  `${window.location.protocol}//${window.location.hostname}:8888`;
export const hlsStreamUrl = (id, host) => {
  const base = host ? `${window.location.protocol}//${host}:8888` : MEDIAMTX_FALLBACK;
  return `${base}/camera_${id}/index.m3u8`;
};

const VMS_BASE = '/api/vms/cameras';

// A vms_camera row -> the "device" shape the pages expect (a device == its camera).
function vmsAsDevice(c) {
  const status = c.status ?? 'active';
  return {
    id: c.id,
    name: c.name ?? c.id,
    status,
    isActive: ['active', 'online', 'connected'].includes(String(status).toLowerCase()),
    latitude: c.latitude,
    longitude: c.longitude,
    host: c.host,
    streamId: c.streamId ?? c.id,
    locationName: c.name,
  };
}

// A vms_camera row -> the "camera" shape. The pages build the HLS path from
// (magicboxCameraId || id); point that at streamId so the URL is camera_<streamId>,
// while keeping id == the vms_camera id so CRUD by id still works.
function vmsAsCamera(c) {
  const meta = c.metadata || {};
  const streamId = c.streamId ?? c.id;
  const status = c.status ?? 'active';
  return {
    id: c.id,
    magicboxCameraId: streamId,
    deviceId: c.id,
    host: c.host,
    name: c.name ?? c.id,
    brand: meta.brand || 'IRIS',
    connectionType: meta.connectionType || 'direct',
    location: c.name ?? '',
    status,
    isActive: ['active', 'online', 'connected'].includes(String(status).toLowerCase()),
    streamUrl: hlsStreamUrl(streamId, c.host),
  };
}

async function listVms() {
  const { data } = await jget(VMS_BASE);
  return Array.isArray(data) ? data : (data?.cameras ?? []);
}

// A camera discovered live from the MagicBox edge app (<host>:8080) -> camera shape.
// The MediaMTX path is camera_<edge-uuid> on the edge's :8888 (matches MagicBox).
function edgeAsCamera(ec, host, deviceId) {
  const status = ec.status || 'active';
  return {
    id: ec.id,
    magicboxCameraId: ec.id,
    deviceId,
    host,
    name: ec.name || ec.id,
    brand: ec.brand || 'IRIS',
    connectionType: 'direct',
    location: ec.name || '',
    status,
    isActive: ['active', 'online', 'connected', ''].includes(String(status).toLowerCase()),
    streamUrl: hlsStreamUrl(ec.id, host),
  };
}

// Ask the backend to pull the cameras configured on a device's edge box.
async function discoverCameras(host, deviceId) {
  if (!host) return [];
  try {
    const { data } = await jget(`${VMS_BASE}/discover?host=${encodeURIComponent(host)}`);
    return (data?.cameras ?? []).map((ec) => edgeAsCamera(ec, host, deviceId));
  } catch {
    return [];
  }
}

// Build a vms_cameras payload from the page's device/camera forms.
function toPayload(form) {
  const lat = form.latitude !== undefined ? parseFloat(form.latitude) : undefined;
  const lng = form.longitude !== undefined ? parseFloat(form.longitude) : undefined;
  const known = ['name', 'host', 'streamId', 'latitude', 'longitude', 'status'];
  const meta = {};
  for (const k of Object.keys(form)) {
    if (!known.includes(k) && form[k] !== '' && form[k] != null) meta[k] = form[k];
  }
  return {
    name: form.name,
    host: form.host,
    streamId: form.streamId || form.primaryStream || undefined,
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
    status: form.status,
    metadata: Object.keys(meta).length ? meta : undefined,
  };
}

async function allCameras() {
  const rows = await listVms();
  const lists = await Promise.all(rows.map(async (r) => {
    const found = await discoverCameras(r.host, r.id);
    return found.length ? found : [vmsAsCamera(r)];
  }));
  return lists.flat();
}

// ── Per-camera analytics assignment (max 2) ──
// Assignment lives on a vms_cameras row; discovered MagicBox cameras get a row
// lazily on first Apply (matched by host + streamId).
export const analyticsAPI = {
  rows: async () => listVms(),
  findRow: (rows, camera) =>
    rows.find((r) =>
      String(r.host) === String(camera.host) &&
      (String(r.streamId || r.id) === String(camera.magicboxCameraId || camera.id) ||
        String(r.id) === String(camera.id))) || null,
  ensureRow: async (camera) => {
    const rows = await listVms();
    const hit = analyticsAPI.findRow(rows, camera);
    if (hit) return hit;
    const { data } = await jmut(VMS_BASE, 'POST', {
      name: camera.name,
      host: camera.host,
      streamId: String(camera.magicboxCameraId || camera.id),
    });
    return data;
  },
  get: async (vmsId) => (await jget(`${VMS_BASE}/${encodeURIComponent(vmsId)}/analytics`)).data,
  set: async (vmsId, body) => (await jmut(`${VMS_BASE}/${encodeURIComponent(vmsId)}/analytics`, 'PUT', body)).data,
};

export const deviceAPI = {
  getDevices: async () => ({ data: (await listVms()).map(vmsAsDevice) }),
  // A VMS "device" is an edge box; its cameras are discovered live from the
  // MagicBox edge app. Fall back to the row itself if the edge has none/unreachable.
  getCameras: async (deviceId) => {
    const row = (await listVms()).find((c) => String(c.id) === String(deviceId));
    if (!row) return { data: [] };
    const found = await discoverCameras(row.host, row.id);
    return { data: found.length ? found : [vmsAsCamera(row)] };
  },
  getDeviceHealth: async () => ({ data: [] }),
  createDevice: async (form) => jmut(VMS_BASE, 'POST', toPayload(form)),
  updateDevice: async (id, form) => jmut(`${VMS_BASE}/${encodeURIComponent(id)}`, 'PUT', toPayload(form)),
  deleteDevice: async (id) => jmut(`${VMS_BASE}/${encodeURIComponent(id)}`, 'DELETE'),
  // Register a MagicBox edge box (host) so its cameras can be discovered/added.
  createMagicBox: async ({ name, host, latitude, longitude }) =>
    jmut(VMS_BASE, 'POST', toPayload({ name, host, latitude, longitude, status: 'active' })),
  // Provision a camera ON the edge MagicBox (host:8080) — the edge creates the
  // MediaMTX stream; the camera then appears via discover. `body` is the MagicBox
  // device-app shape: { name, ip, address, brand, username, password, channel, ... }.
  provisionCamera: async (host, body) =>
    jmut(`${VMS_BASE}/provision?host=${encodeURIComponent(host)}`, 'POST', body),
  // Probe an RTSP/camera on the edge before saving (proxied to the edge verify API).
  verifyCamera: async (host, body) =>
    jmut(`${VMS_BASE}/verify?host=${encodeURIComponent(host)}`, 'POST', body),
  // Camera-level ops map onto the same flat record (device == camera).
  addCamera: async (_deviceId, form) => jmut(VMS_BASE, 'POST', toPayload(form)),
  updateCamera: async (_deviceId, cameraId, form) => jmut(`${VMS_BASE}/${encodeURIComponent(cameraId)}`, 'PUT', toPayload(form)),
  deleteCamera: async (_deviceId, cameraId) => jmut(`${VMS_BASE}/${encodeURIComponent(cameraId)}`, 'DELETE'),
};

export const magicboxAPI = {
  syncCameras: async () => ({ data: { synced: 0 } }),
  getCameraAIFeatures: async () => ({ data: [] }),
  updateCameraAIFeature: async () => ({ data: {} }),
  getCameraRecordingSettings: async () => ({ data: {} }),
  updateCameraRecordingSettings: async () => ({ data: {} }),
};

export const playbackAPI = {
  start: async () => ({ data: {} }),
  stop: async () => ({ data: {} }),
};

// Device-deployment tree — VMS is flat, so each camera is its own one-level node.
export const deploymentAPI = {
  getTree: async () => {
    const { data } = await deviceAPI.getDevices();
    return { data: { nodes: data, devices: data, tree: data } };
  },
  createDevice: async () => ({ data: {} }),
};

// User/assignment management isn't part of IRIS VMS — safe stubs.
export const userAPI = {
  list: async () => ({ data: [] }),
  getAssignedDevices: async () => ({ data: [] }),
  setAssignedDevices: async () => ({ data: {} }),
};

// Generic axios-like client used by a few call sites.
const api = {
  get: async (p) => {
    const camForDevice = p.match(/\/devices\/([^/]+)\/cameras/);
    if (camForDevice) return deviceAPI.getCameras(decodeURIComponent(camForDevice[1]));
    if (/^\/cameras\/?$/.test(p)) return { data: await allCameras() };
    return jget(p.startsWith('/api') ? p : `/api${p}`);
  },
  post: async (p, body) => jmut(p.startsWith('/api') ? p : `/api${p}`, 'POST', body),
  put: async (p, body) => jmut(p.startsWith('/api') ? p : `/api${p}`, 'PUT', body),
  delete: async (p) => jmut(p.startsWith('/api') ? p : `/api${p}`, 'DELETE'),
};
export default api;
