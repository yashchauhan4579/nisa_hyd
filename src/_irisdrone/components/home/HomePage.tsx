import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Map, Car, TrendingUp, AlertTriangle,
  BarChart3, Bell, Settings, Monitor, Shield,
  Video, FileText, Cog, Server, Compass, LogOut,
  Eye, CheckSquare, FileSearch, LineChart, Filter, Cpu,
  LayoutDashboard, MonitorPlay, Film, UserCog,
} from 'lucide-react';
import { MapBackground } from './MapBackground';
import { useAuth } from '@irisdrone/contexts/AuthContext';
import { playSound } from '@irisdrone/hooks/useSound';
import { ModuleSelectorWidget, type MainModule } from './widgets/ModuleSelectorWidget';
import './HomePage.css';

const mainModules: MainModule[] = [
  {
    id: 'vms', icon: Monitor, label: 'VMS', sub: 'Video Management', side: 'left',
    subItems: [
      { id: 'live', icon: Video, label: 'Live Feed', desc: 'Camera grid & live view', path: '/vms/live' },
      { id: 'recording', icon: Film, label: 'Recording', desc: 'Playback & download', path: '/vms/recording' },
      { id: 'devices', icon: MonitorPlay, label: 'Devices', desc: 'Camera & device management', path: '/vms/devices' },
      { id: 'map', icon: Map, label: 'Map View', desc: 'Camera locations', path: '/vms/map' },
    ],
    info: {
      brief: 'Centralized video surveillance with multi-camera grid views, PTZ control, and AI-powered anomaly detection across all connected feeds.',
      color: '#00F0FF',
      status: 'All Cameras Online',
      stats: [{ val: '15', label: 'Cameras' }, { val: '4K', label: 'Max Res' }, { val: '30d', label: 'Retention' }],
      features: ['Multi-grid layouts', 'PTZ control', 'Motion zones', 'AI detection'],
      highlights: [
        'Live multi-camera grid with drag-and-drop layout customization',
        'AI-powered motion detection with configurable alert zones',
        'Continuous recording with 30-day retention policy',
      ],
    },
  },
  {
    id: 'itms', icon: Compass, label: 'ITMS', sub: 'Traffic Management', side: 'left',
    subItems: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Traffic overview & KPIs', path: '/itms' },
      { id: 'anpr', icon: Car, label: 'ANPR', desc: 'Plate recognition system', path: '/itms/anpr' },
      { id: 'vcc', icon: TrendingUp, label: 'VCC', desc: 'Vehicle classification', path: '/itms/vcc' },
      { id: 'violations', icon: AlertTriangle, label: 'Violations', desc: 'Traffic violation tracking', path: '/itms/violations' },
      { id: 'watchlist', icon: Eye, label: 'Watchlist', desc: 'Monitored vehicles', path: '/itms/watchlist' },
      { id: 'alerts', icon: Bell, label: 'Alerts', desc: 'ITMS notifications', path: '/itms/alerts' },
      { id: 'review', icon: CheckSquare, label: 'Review Center', desc: 'Pending violation reviews', path: '/itms/review' },
      { id: 'investigation', icon: FileSearch, label: 'Investigation', desc: 'Vehicle case management', path: '/itms/investigation' },
      { id: 'analytics', icon: LineChart, label: 'Analytics', desc: 'Reports & insights', path: '/itms/analytics' },
      { id: 'devices', icon: Server, label: 'Device Management', desc: 'Edge device CRUD', path: '/itms/devices' },
      { id: 'magicbox', icon: Cpu, label: 'MagicBox', desc: 'Edge AI nodes', path: '/itms/magicbox' },
      { id: 'rules', icon: Filter, label: 'Watchlist Rules', desc: 'Alert rule engine', path: '/itms/watchlist/rules' },
    ],
    info: {
      brief: 'Intelligent traffic management with ANPR, vehicle classification, speed detection, and automated violation processing across corridors.',
      color: '#00F0FF',
      status: '12 Junctions Active',
      stats: [{ val: '12', label: 'Junctions' }, { val: '98.2%', label: 'ANPR Acc.' }, { val: '142', label: 'Violations' }],
      features: ['Plate recognition', 'Speed profiling', 'Red-light detection', 'Vehicle counting'],
      highlights: [
        'ANPR with 98.2% accuracy across day/night conditions',
        '14-class vehicle classification with speed profiling',
        'Automated challan generation for red-light and speed violations',
      ],
    },
  },
  {
    id: 'analytics', icon: BarChart3, label: 'ANALYTICS', sub: 'Data Insights', side: 'right',
    subItems: [
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', desc: 'Aggregated analytics', path: '/analytics' },
      { id: 'reports', icon: FileText, label: 'Reports', desc: 'ITMS reports & exports', path: '/itms/analytics' },
    ],
    info: {
      brief: 'Aggregated data intelligence from all modules. Custom dashboards, trend analysis, exportable reports, and predictive insights.',
      color: '#00F0FF',
      status: '1.2M Data Points',
      stats: [{ val: '24', label: 'Reports' }, { val: '1.2M', label: 'Data Pts' }, { val: '6', label: 'Sources' }],
      features: ['Custom dashboards', 'Trend analysis', 'PDF/CSV export', 'Scheduled reports'],
      highlights: [
        'Cross-module aggregation from VMS, ITMS, and Crowd data',
        'Scheduled PDF/CSV report generation with email delivery',
        'Historical trend analysis with comparative time-range views',
      ],
    },
  },
  {
    id: 'alerts', icon: Bell, label: 'ALERTS', sub: '3 Active', side: 'right',
    subItems: [
      { id: 'notifications', icon: Bell, label: 'Alert Center', desc: 'Active notifications', path: '/alerts' },
      { id: 'rules', icon: Shield, label: 'Rules Engine', desc: 'Watchlist alert rules', path: '/itms/watchlist/rules' },
    ],
    info: {
      brief: 'Unified alert management with configurable rules, escalation chains, and multi-channel notifications for all system events.',
      color: '#FF2A2A',
      status: '3 Active Alerts',
      stats: [{ val: '3', label: 'Active' }, { val: '18', label: 'Rules' }, { val: '99.9%', label: 'Delivery' }],
      features: ['Rule engine', 'Escalation chains', 'SMS/Email/Push', 'Alert correlation'],
      highlights: [
        'Multi-condition rule engine with AND/OR logic builders',
        'Tiered escalation chains with configurable timeouts',
        'Cross-module alert correlation to reduce false positives',
      ],
    },
  },
  {
    id: 'settings', icon: Settings, label: 'SETTINGS', sub: 'Configuration', side: 'right',
    subItems: [
      { id: 'system', icon: Cog, label: 'System', desc: 'Global configuration', path: '/settings' },
      { id: 'workers', icon: Server, label: 'Edge Workers', desc: 'Processing nodes', path: '/settings/workers' },
      { id: 'operators', icon: UserCog, label: 'Operators', desc: 'Operator access & roles', path: '/settings/operators' },
    ],
    info: {
      brief: 'System configuration and infrastructure management. Edge workers, device provisioning, user roles, and global system parameters.',
      color: '#005F73',
      status: 'System Healthy',
      stats: [{ val: '4', label: 'Workers' }, { val: '22', label: 'Devices' }, { val: '3', label: 'Users' }],
      features: ['Edge compute', 'Device CRUD', 'Role management', 'System health'],
      highlights: [
        'Edge worker orchestration with auto-scaling and health checks',
        'Zero-downtime device provisioning and firmware updates',
        'Role-based access control with audit logging',
      ],
    },
  },
];

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hrs = String(time.getHours()).padStart(2, '0');
  const mins = String(time.getMinutes()).padStart(2, '0');
  return (
    <div className="nx-clock">
      <span>{hrs}</span>
      <span className="nx-clock-sep">:</span>
      <span>{mins}</span>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let p = 0;
    const id = setInterval(() => {
      p += Math.random() * 15;
      if (p >= 100) { p = 100; clearInterval(id); setTimeout(() => setLoaded(true), 300); }
      setLoadProgress(p);
    }, 80);
    return () => clearInterval(id);
  }, []);

  // Boot sound on entry
  useEffect(() => {
    if (loaded) playSound('boot');
  }, [loaded]);

  if (!loaded) {
    return (
      <div className="nx-loader">
        <div className="nx-loader-logo">IRIS</div>
        <div className="nx-loader-bar">
          <div className="nx-loader-progress" style={{ width: `${loadProgress}%` }} />
        </div>
        <div className="nx-loader-text">Initializing</div>
      </div>
    );
  }

  return (
    <div className="nx-root nx-root-v2">
      <div className="nx-scene">
        <MapBackground color="#00F0FF" />
      </div>

      <div className="nx-film-grain" />
      <div className="nx-vignette" />
      <div className="nx-color-wash" />

      {/* Header */}
      <header className="nx-header nx-fadein">
        <div className="nx-logo">
          <div className="nx-logo-icon">
            <svg viewBox="0 0 32 32" fill="none" stroke="#38bdba" strokeWidth="1.2">
              <polygon points="16,3 29,11 29,21 16,29 3,21 3,11" />
              <circle cx="16" cy="16" r="5" />
              <line x1="16" y1="11" x2="16" y2="3" />
            </svg>
          </div>
          <span className="nx-logo-text">IRIS</span>
        </div>

        <div className="nx-status-center">
          <div className="nx-status-pill">
            <div className="nx-status-dot nx-warn" />
            <span className="nx-status-label">Alerts</span>
            <span className="nx-status-val">—</span>
          </div>
          <Clock />
          <div className="nx-status-pill">
            <div className="nx-status-dot nx-ok" />
            <span className="nx-status-label">Online</span>
            <span className="nx-status-val">—</span>
          </div>
        </div>

        <div className="nx-header-actions">
          <button className="nx-action-btn" style={{ position: 'relative' }} onClick={() => navigate('/alerts')}>
            <Bell size={16} />
          </button>
          <button className="nx-action-btn" onClick={() => navigate('/settings')}>
            <Settings size={16} />
          </button>
          <button className="nx-action-btn" onClick={() => { logout(); navigate('/login'); }} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Module Selector — center hero */}
      <div className="nx-layout">
        <ModuleSelectorWidget modules={mainModules} />
      </div>

      {/* Bottom status bar */}
      <div className="nx-statusbar nx-fadein-up">
        <div className="nx-statusbar-item">
          <div className="nx-statusbar-dot" />
          <span className="nx-statusbar-text">IRIS Command Center · Belagavi</span>
        </div>
      </div>
    </div>
  );
}
