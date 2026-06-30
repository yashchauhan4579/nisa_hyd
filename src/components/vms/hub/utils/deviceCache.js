// Shared session-level cache for device, camera, and user data.
// Module singleton — survives route/tab changes within the same browser tab,
// cleared only on full page reload.

export const deviceCache = {
  devices: null,         // null = never fetched
  cameras: [],           // flat array: [{ ...camera, deviceId, deviceName }]
  loadedIds: new Set(),  // device IDs whose cameras have been successfully loaded
  failedIds: new Set(),  // device IDs where camera fetch failed
  users: null,           // null = never fetched
  bgTimer: null,         // background retry interval (owned by HlsGrid)
  onUpdate: null,        // callback set by the mounted HlsGrid to push bg updates into React state
}

export function cacheDeviceList(arr) {
  deviceCache.devices = arr
}

export function cacheCamerasForDevice(deviceId, deviceName, cameras) {
  const withMeta = cameras.map(c => ({ ...c, deviceId, deviceName }))
  deviceCache.cameras = [...deviceCache.cameras.filter(c => c.deviceId !== deviceId), ...withMeta]
  deviceCache.loadedIds.add(deviceId)
  deviceCache.failedIds.delete(deviceId)
  return withMeta
}

export function getCamerasForDevice(deviceId) {
  return deviceCache.cameras.filter(c => c.deviceId === deviceId)
}

export function invalidateDevice(deviceId) {
  deviceCache.cameras = deviceCache.cameras.filter(c => c.deviceId !== deviceId)
  deviceCache.loadedIds.delete(deviceId)
  deviceCache.failedIds.delete(deviceId)
}

export function invalidateAll() {
  deviceCache.cameras = []
  deviceCache.loadedIds = new Set()
  deviceCache.failedIds = new Set()
}

export function cacheUserList(arr) {
  deviceCache.users = arr
}

export function invalidateUsers() {
  deviceCache.users = null
}

export function getOnlineDeviceIds() {
  if (!deviceCache.devices) return new Set()
  return new Set(deviceCache.devices.filter(d => d.status === 'online' || d.isOnline === true).map(d => d.id))
}

export function getOnlineCameras() {
  const onlineIds = getOnlineDeviceIds()
  return deviceCache.cameras.filter(c => onlineIds.has(c.deviceId))
}

export function resetCache() {
  deviceCache.devices = null
  deviceCache.cameras = []
  deviceCache.loadedIds = new Set()
  deviceCache.failedIds = new Set()
  deviceCache.users = null
}
