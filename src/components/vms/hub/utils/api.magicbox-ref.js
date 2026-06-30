import axios from 'axios'

// Create axios instance with base configuration
const api = axios.create({
  baseURL: '/api', // This will use the current domain + /api (app.magicboxhub.net/api)
  timeout: 10000, // 10 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // Handle common errors
    if (error.response) {
      // Server responded with error status
      console.error('API Error:', error.response.status, error.response.data)
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network Error:', error.message)
    } else {
      // Something else happened
      console.error('Error:', error.message)
    }
    return Promise.reject(error)
  }
)

// API methods
export const deviceAPI = {
  // Get all devices
  getDevices: () => api.get('/devices'),

  // Create a new device
  createDevice: (deviceData) => api.post('/devices', deviceData),

  // Update a device
  updateDevice: (deviceId, deviceData) => api.put(`/devices/${deviceId}`, deviceData),

  // Delete a device
  deleteDevice: (deviceId) => api.delete(`/devices/${deviceId}`),

  // Get cameras for a specific device
  getCameras: (deviceId) => api.get(`/devices/${deviceId}/cameras`),

  // Add camera to a device
  addCamera: (deviceId, cameraData) => api.post(`/devices/${deviceId}/cameras`, cameraData),

  // Update camera
  updateCamera: (deviceId, cameraId, cameraData) => api.put(`/devices/${deviceId}/cameras/${cameraId}`, cameraData),

  // Delete camera
  deleteCamera: (deviceId, cameraId) => api.delete(`/devices/${deviceId}/cameras/${cameraId}`),
}

// Magicbox device API (proxied through our backend)
export const magicboxAPI = {
  // Sync cameras from Magicbox device
  syncCameras: (deviceId) => api.post(`/devices/${deviceId}/cameras/sync`),

  // Get camera AI features
  getCameraAIFeatures: (cameraId) => api.get(`/cameras/${cameraId}/ai-features`),

  // Update camera AI feature
  updateCameraAIFeature: (cameraId, featureId, featureData) =>
    api.put(`/cameras/${cameraId}/ai-features/${featureId}`, featureData),

  // Get camera recording settings
  getCameraRecordingSettings: (cameraId) => api.get(`/cameras/${cameraId}/recording-settings`),

  // Update camera recording settings
  updateCameraRecordingSettings: (cameraId, settingsData) =>
    api.put(`/cameras/${cameraId}/recording-settings`, settingsData),
}

export const playbackAPI = {
  start: (deviceId, cameraId, startTime, endTime) =>
    api.post('/playback/stream', { deviceId, cameraId, startTime, endTime }),
  stop: (playbackId) =>
    api.delete(`/playback/stream/${playbackId}`),
}

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
}

export const userAPI = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
  getAssignedDevices: (id) => api.get(`/users/${id}/devices`),
  setAssignedDevices: (id, deviceIds) => api.put(`/users/${id}/devices`, { deviceIds }),
  getActivities: (id) => api.get(`/users/${id}/activities`),
}

export default api
