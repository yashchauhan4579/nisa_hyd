import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// NISA demo build — served on 219, all backend calls proxied to the 206 metal
// server (live IRIS Observer / Qwen pipeline + Go backend). Copilot bot removed.
const API = 'http://10.10.0.206:3001'        // Go backend (events, crowd, frs, auth)
const FORENSICS = 'http://10.10.0.206:8080'  // forensics adapter -> Qwen observer sidecar
const SEARCH = 'http://10.10.0.206:8200'     // CLIP search
const MEDIA = 'http://10.10.0.206:8888'
const WEBRTC = 'http://10.10.0.206:8889'
const ITMS = 'http://127.0.0.1:8003'    // 219 local ANPR/VCC engine
const PERIMETER = 'http://10.10.0.221:8080'  // 221 perimeter backend (module 4)

const proxy = {
  '/forensicsapi': { target: FORENSICS, changeOrigin: true, secure: false, ws: true, rewrite: (p: string) => p.replace(/^\/forensicsapi/, '') },
  '/searchapi': { target: SEARCH, changeOrigin: true, secure: false, rewrite: (p: string) => p.replace(/^\/searchapi/, '') },
  '/hls219': { target: 'http://127.0.0.1:8888', changeOrigin: true, secure: false, rewrite: (p: string) => p.replace(/^\/hls219/, '') },
  '/hls221': { target: 'http://10.10.0.221:8888', changeOrigin: true, secure: false, rewrite: (p: string) => p.replace(/^\/hls221/, '') },
  '/itmsapi': { target: ITMS, changeOrigin: true, secure: false, ws: true, rewrite: (p: string) => p.replace(/^\/itmsapi/, '') },
  '/perimeterapi': { target: PERIMETER, changeOrigin: true, secure: false, rewrite: (p: string) => p.replace(/^\/perimeterapi/, '') },
  '/api': { target: API, changeOrigin: true, secure: false },
  '/uploads': { target: API, changeOrigin: true, secure: false },
  '/heatmaps': { target: API, changeOrigin: true, secure: false },
  '/ws/feeds': { target: API, ws: true, changeOrigin: true, secure: false },
  '/media': { target: MEDIA, changeOrigin: true, secure: false, rewrite: (p: string) => p.replace(/^\/media/, '') },
  '/webrtc': { target: WEBRTC, changeOrigin: true, secure: false, rewrite: (p: string) => p.replace(/^\/webrtc/, '') },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@sringeri": path.resolve(__dirname, "./src/_sringeri"),
      "@irisdrone": path.resolve(__dirname, "./src/_irisdrone"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-leaflet': ['leaflet', 'react-leaflet'],
          'vendor-hls': ['hls.js'],
          'vendor-charts': ['recharts'],
          'vendor-motion': ['framer-motion'],
          'vendor-pdf': ['jspdf'],
        },
      },
    },
  },
  server: { host: true, port: 1112, allowedHosts: true, proxy },
  preview: { host: true, port: 1112, allowedHosts: true, proxy },
})
