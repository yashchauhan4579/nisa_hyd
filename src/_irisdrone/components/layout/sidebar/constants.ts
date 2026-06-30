import {
  LayoutDashboard, Car, TrendingUp, AlertTriangle,
  Eye, Bell, CheckSquare, FileSearch, LineChart,
  Server, Filter, Map,
  Settings, Video, Film, MonitorPlay,
  Gavel,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
  badge?: number;
}

export interface MenuSection {
  id: string;
  label: string;
  items: MenuItem[];
}

export const menuSections: MenuSection[] = [
  {
    id: 'traffic',
    label: 'Traffic Management',
    items: [
      { id: 'dashboard', path: '/itms', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview & metrics' },
      { id: 'anpr', path: '/itms/anpr', label: 'ANPR', icon: Car, description: 'License plate recognition' },
      { id: 'vcc', path: '/itms/vcc', label: 'VCC', icon: TrendingUp, description: 'Vehicle counting' },
      { id: 'violations', path: '/itms/violations', label: 'Violations', icon: AlertTriangle, description: 'Traffic violations' },
      { id: 'watchlist', path: '/itms/watchlist', label: 'Watchlist', icon: Eye, description: 'Monitored vehicles' },
      { id: 'alerts', path: '/itms/alerts', label: 'Alerts', icon: Bell, description: 'System notifications' },
      { id: 'review', path: '/itms/review', label: 'Review Center', icon: CheckSquare, description: 'Pending reviews' },
      { id: 'disputes', path: '/itms/disputes', label: 'Disputes', icon: Gavel, description: 'Citizen-raised disputes' },
      { id: 'investigation', path: '/itms/investigation', label: 'Investigation', icon: FileSearch, description: 'Case management' },
      { id: 'analytics', path: '/itms/analytics', label: 'Analytics', icon: LineChart, description: 'Reports & insights' },
      { id: 'rules', path: '/itms/watchlist/rules', label: 'Watchlist Rules', icon: Filter, description: 'Alert configurations' },
    ],
  },
  {
    id: 'vms',
    label: 'VMS',
    items: [
      { id: 'vms-live', path: '/vms/live', label: 'Live Feed', icon: Video, description: 'Camera grid & live view' },
      { id: 'vms-recording', path: '/vms/recording', label: 'Recording', icon: Film, description: 'Playback & download' },
      { id: 'vms-devices', path: '/vms/devices', label: 'Devices', icon: MonitorPlay, description: 'Camera & device management' },
      { id: 'vms-map', path: '/vms/map', label: 'Map View', icon: Map, description: 'Camera locations on map' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      // Analytics moved up into ITMS section to avoid a duplicate entry —
      // /analytics now just redirects to /itms/analytics.
      { id: 'settings', path: '/settings', label: 'Settings', icon: Settings, description: 'System configuration' },
      { id: 'magicbox', path: '/itms/magicbox', label: 'MagicBox', icon: Server, description: 'Edge devices' },
    ],
  },
];

export const colors = {
  bg: '#020408',
  surface: 'rgba(5, 16, 25, 0.85)',
  surfaceHover: 'rgba(0, 240, 255, 0.05)',
  surfaceActive: 'rgba(0, 240, 255, 0.1)',
  border: 'rgba(0, 95, 115, 0.25)',
  borderHover: 'rgba(0, 240, 255, 0.35)',
  textPrimary: '#F0FBFD',
  textSecondary: '#DCEEF1',
  textMuted: '#9FC0C7',
  accent: '#00F0FF',
  accentDim: 'rgba(0, 240, 255, 0.12)',
  accentPink: '#FF2A2A',
  accentPinkDim: 'rgba(255, 42, 42, 0.12)',
};

export const userData = { name: 'Operator', role: 'Admin', initials: 'OP' };
