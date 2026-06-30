import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme-compat.css'
import './themes/cyberpunk.css'
import App from './App.tsx'
import { USE_MOCK, installMockFetch } from './mocks'

// Phase 1: intercept raw fetch('/api/...') calls so the app runs with no backend.
if (USE_MOCK) installMockFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
