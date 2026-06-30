import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate, Outlet } from 'react-router-dom';
import { RevealProvider } from './components/transitions/RevealTransition';
import { ThemeProvider } from './contexts/ThemeContext';
import { DeviceFilterProvider } from './contexts/DeviceFilterContext';
import { LayerVisibilityProvider } from './contexts/LayerVisibilityContext';
import { CameraGridProvider } from './contexts/CameraGridContext';
import { CrowdDashboardProvider } from './contexts/CrowdDashboardContext';
import { MapTypeProvider } from './contexts/MapTypeContext';
import { FullscreenProvider, useFullscreen } from './contexts/FullscreenContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataCacheProvider } from './contexts/DataCacheContext';
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { HomePage } from './components/home/HomePage';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { ModuleAlertsLayer } from './components/alerts/ModuleAlertsLayer';
import { ThemeProvider as SringeriThemeProvider } from '@sringeri/contexts/ThemeContext';
import { CrowdDashboardProvider as SringeriCrowdProvider } from '@sringeri/contexts/CrowdDashboardContext';

// ── Heavy route components are code-split (React.lazy) so they don't bloat the
//    first-paint bundle; they load on navigation behind a <Suspense> skeleton.
const named = <M, K extends keyof M>(loader: () => Promise<M>, key: K) =>
  lazy(() => loader().then((m) => ({ default: m[key] as unknown as React.ComponentType<any> })));

const MapView = named(() => import('./components/map/MapView'), 'MapView');
const CameraView = named(() => import('./components/cameras/CameraView'), 'CameraView');
const CrowdDashboard = named(() => import('./components/crowd/CrowdDashboard'), 'CrowdDashboard');
const ANPRDashboard = named(() => import('./components/anpr/ANPRDashboard'), 'ANPRDashboard');
const NVCCDashboard = named(() => import('./components/nvcc/NVCCDashboard'), 'NVCCDashboard');
const WorkersDashboard = named(() => import('./components/workers/WorkersDashboard'), 'WorkersDashboard');
const CameraHealthPage = named(() => import('./pages/CameraHealthPage'), 'CameraHealthPage');
const AnalyticsDashboard = named(() => import('./pages/AnalyticsDashboard'), 'AnalyticsDashboard');
const ReportsPage = named(() => import('./pages/ReportsPage'), 'ReportsPage');
const CameraManagementPage = named(() => import('./pages/CameraManagementPage'), 'CameraManagementPage');
const SettingsPage = named(() => import('./pages/SettingsPage'), 'SettingsPage');
const WatchlistPage = named(() => import('./pages/WatchlistPage'), 'WatchlistPage');
const SearchPage = named(() => import('./pages/SearchPage'), 'SearchPage');
const ForensicsPage = named(() => import('./pages/ForensicsPage'), 'ForensicsPage');
const PerimeterIntrusionPage = named(() => import('./pages/PerimeterIntrusionPage'), 'PerimeterIntrusionPage');
const PlatformSettingsPage = named(() => import('./pages/PlatformSettingsPage'), 'PlatformSettingsPage');
const CrowdSurveillance = named(() => import('./components/crowd/CrowdSurveillance'), 'CrowdSurveillance');
const FRSSurveillance = named(() => import('./components/frs/FRSSurveillance'), 'FRSSurveillance');
const SringeriAnalyticsPage = named(() => import('@sringeri/components/analytics/AnalyticsPage'), 'AnalyticsPage');
const AlertsHubPage = named(() => import('./pages/AlertsHubPage'), 'AlertsHubPage');
const ItmsAlertsPage = named(() => import('./pages/ModuleAlertsPages'), 'ItmsAlertsPage');
const SringeriVCCDashboard = named(() => import('@sringeri/components/vcc/VCCDashboard'), 'VCCDashboard');
const VmsCameras = named(() => import('./components/vms/Cameras'), 'VmsCameras');
const IrisViolationsDashboard = named(() => import('@irisdrone/components/violations/ViolationsDashboard'), 'ViolationsDashboard');
const AnprVcc = named(() => import('./components/itms/AnprVcc'), 'AnprVcc');
const ITMSCommandCenter = named(() => import('./components/itms/ITMSCommandCenter'), 'ITMSCommandCenter');
const VehicleDetailPage = named(() => import('./pages/VehicleDetailPage'), 'VehicleDetailPage');
const InvestigatePage = named(() => import('./pages/InvestigatePage'), 'InvestigatePage');
const HubLiveView = lazy(() => import('./components/vms/VmsWall'));
const HubDevices = lazy(() => import('./components/vms/hub/Devices'));
const HubRecording = lazy(() => import('./components/vms/hub/Recording'));
const HubMapView = lazy(() => import('./components/vms/hub/MapView'));

function RouteFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
    </div>
  );
}

function RequireAuth() {
  const { isAuthenticated, checkAuth } = useAuth();
  const location = useLocation();

  // Check both state and direct storage to avoid blips.
  // Unauthenticated users land on the public landing page (which links to /login).
  if (!isAuthenticated && !checkAuth()) {
    return <Navigate to="/landing" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isFullscreen } = useFullscreen();
  const { isAuthenticated, checkAuth } = useAuth();

  // Get active view from URL path
  const activeView = location.pathname === '/' ? 'home' :
    location.pathname.startsWith('/itms/') ? location.pathname.slice(1) :
      location.pathname.slice(1);

  const handleViewChange = (view: string) => {
    if (view === 'home') {
      navigate('/');
    } else if (view === 'map') {
      navigate('/map');
    } else {
      navigate(`/${view}`);
    }
  };

  // Determine if sidebar and topbar should be shown
  const isLoginPage = location.pathname === '/login' || location.pathname === '/landing';
  const isHomePage = activeView === 'home';
  const isImmersive = location.pathname === '/search' || location.pathname === '/forensics' || location.pathname === '/investigate';
  const showTopBar = !isLoginPage && !isHomePage && !isImmersive && activeView !== 'itms/tvcc' && activeView !== 'itms/nvcc' && activeView !== 'analytics/dashboard';
  const showSidebar = !isLoginPage && !isHomePage && !isFullscreen;

  return (
    <RevealProvider>
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
      {/* Sidebar - Hidden on home page and login */}
      {showSidebar && <Sidebar activeView={activeView} onViewChange={handleViewChange} />}

      {/* Top Bar - Hidden for VCC and Home pages and login */}
      {showTopBar && <TopBar activeView={activeView} />}

      {/* Main Content */}
      <main
        className={
          isLoginPage || isHomePage
            ? "absolute inset-0" // Full screen for login/home
            : isFullscreen
              ? "absolute inset-0" // Fullscreen mode - no sidebar or topbar
              : showTopBar
                ? "absolute top-14 left-16 right-0 bottom-0" // With sidebar and topbar
                : "absolute top-0 left-16 right-0 bottom-0" // With sidebar, no topbar
        }
      >
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/landing" element={<LandingPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/map" element={<MapView />} />

            {/* VMS module — MagicBox-functionality pages in the unified IRIS shell */}
            <Route path="/vms/liveview" element={<div className="h-full w-full"><HubLiveView /></div>} />
            <Route path="/vms/devices" element={<div className="h-full w-full"><HubDevices /></div>} />
            <Route path="/vms/cameras" element={<VmsCameras />} />
            <Route path="/vms/recording" element={<div className="h-full w-full"><HubRecording /></div>} />
            <Route path="/vms/map" element={<div className="h-full w-full"><HubMapView /></div>} />
            <Route path="/vms/camerahealth" element={<CameraHealthPage />} />

            {/* ITMS Routes */}
            <Route path="/itms" element={<ITMSCommandCenter />} />
            <Route path="/itms/anpr" element={<ANPRDashboard />} />
            <Route path="/itms/anpr-vcc" element={<AnprVcc />} />
            <Route path="/itms/anpr/:id" element={<VehicleDetailPage />} />
            <Route path="/itms/watchlist" element={<WatchlistPage />} />
            <Route path="/itms/violations" element={<IrisViolationsDashboard />} />
            <Route path="/itms/alerts" element={<ItmsAlertsPage />} />
            {/* VCC — sringeri VCCDashboard (per user) */}
            <Route path="/itms/vcc" element={<SringeriThemeProvider><SringeriVCCDashboard /></SringeriThemeProvider>} />
            <Route path="/itms/tvcc" element={<SringeriThemeProvider><SringeriVCCDashboard /></SringeriThemeProvider>} />
            <Route path="/itms/nvcc" element={<SringeriThemeProvider><SringeriVCCDashboard /></SringeriThemeProvider>} />

            {/* Analytics Routes */}
            {/* Analytics dashboard — sringeri's /dashboard (AnalyticsPage), not atcc */}
            <Route path="/analytics/dashboard" element={<SringeriCrowdProvider><SringeriAnalyticsPage /></SringeriCrowdProvider>} />
            <Route path="/analytics/reports" element={<ReportsPage />} />

            {/* Crowd Routes */}
            <Route path="/crowd" element={<CrowdDashboard />} />

            {/* Analytics: Crowd + FRS (ported from iris-sringeri). Alerts live
                in-module via the floating Alerts drawer (ModuleAlertsLayer).
                ⚠️ DO NOT remove the ModuleAlertsLayer wrappers below — the
                operator explicitly wants the draggable Alerts bell on these
                four pages (requested + restored 3x on 2026-06-10). If alert
                access is being redesigned, coordinate before stripping. */}
            <Route path="/analytics/crowd" element={<ModuleAlertsLayer module="crowd"><CrowdSurveillance /></ModuleAlertsLayer>} />
            <Route path="/analytics/frs" element={<ModuleAlertsLayer module="frs"><FRSSurveillance /></ModuleAlertsLayer>} />

            {/* Iris-search (CLIP semantic video search) */}
            <Route path="/investigate" element={<InvestigatePage />} />
            <Route path="/search" element={<ModuleAlertsLayer module="search"><SearchPage /></ModuleAlertsLayer>} />
            {/* Iris-forensics (frame-by-frame crowd AI analysis) */}
            <Route path="/forensics" element={<ModuleAlertsLayer module="forensics"><ForensicsPage /></ModuleAlertsLayer>} />
            <Route path="/perimeter" element={<PerimeterIntrusionPage />} />

            {/* Settings Routes */}
            <Route path="/settings/platform" element={<PlatformSettingsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/workers" element={<WorkersDashboard />} />
            <Route path="/settings/workers/:id" element={<WorkersDashboard />} />

            {/* Alerts hub — per-module rules + fired alerts (legacy sringeri view = "All Alerts" tab) */}
            <Route path="/alerts" element={<AlertsHubPage />} />
            <Route path="/alerts/rules" element={<Navigate to="/alerts" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>

      {/* IRIS Buddy — only once logged in (never on login/landing or pre-auth) */}
    </div>
    </RevealProvider>
  );
}

function AppContent() {
  return (
    <FeatureFlagsProvider>
    <DataCacheProvider>
      <ThemeProvider>
        <FullscreenProvider>
          <DeviceFilterProvider>
            <LayerVisibilityProvider>
              <CameraGridProvider>
                <CrowdDashboardProvider>
                  <MapTypeProvider>
                    <AppLayout />
                  </MapTypeProvider>
                </CrowdDashboardProvider>
              </CameraGridProvider>
            </LayerVisibilityProvider>
          </DeviceFilterProvider>
        </FullscreenProvider>
      </ThemeProvider>
    </DataCacheProvider>
    </FeatureFlagsProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
