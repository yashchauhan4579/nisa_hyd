// Hierarchical feature taxonomy for the tunable platform.
// Keys are dot-paths: "module", "module.leaf", "module.leaf.child".
// Used by the Platform Settings page (to render nested toggles) and by
// components (to hide disabled features, e.g. individual violation types).

export interface FeatureNode {
  key: string;
  label: string;
  children?: FeatureNode[];
}

export interface FeatureModule {
  module: string;       // top-level key (e.g. "itms")
  label: string;
  accent: string;
  children: FeatureNode[];
}

// Traffic violation types — mirror the backend ViolationType enum.
export const VIOLATION_TYPES: { key: string; label: string }[] = [
  { key: 'SPEED', label: 'Over-speeding' },
  { key: 'HELMET', label: 'No Helmet' },
  { key: 'TRIPLE_RIDING', label: 'Triple Riding' },
  { key: 'WRONG_SIDE', label: 'Wrong Side' },
  { key: 'RED_LIGHT', label: 'Red Light Jump' },
  { key: 'NO_SEATBELT', label: 'No Seatbelt' },
  { key: 'OVERLOADING', label: 'Overloading' },
  { key: 'ILLEGAL_PARKING', label: 'Illegal Parking' },
  { key: 'MOBILE_USE', label: 'Mobile While Driving' },
];

export const FEATURE_TREE: FeatureModule[] = [
  {
    module: 'investigate', label: 'Investigate', accent: '#ef4444',
    children: [
      { key: 'investigate.workspace', label: 'Investigation Workspace' },
    ],
  },
  {
    module: 'vms', label: 'VMS', accent: '#f59e0b',
    children: [
      { key: 'vms.liveview', label: 'Live View' },
      { key: 'vms.cameras', label: 'Cameras' },
      { key: 'vms.analytics', label: 'Camera Analytics' },
      { key: 'vms.recording', label: 'Recording' },
      { key: 'vms.map', label: 'Map' },
      { key: 'vms.camerahealth', label: 'Camera Health' },
    ],
  },
  {
    module: 'itms', label: 'ITMS', accent: '#f59e0b',
    children: [
      { key: 'itms.anpr', label: 'ANPR' },
      { key: 'itms.watchlist', label: 'Watchlist' },
      { key: 'itms.vcc', label: 'VCC' },
      {
        key: 'itms.violations', label: 'Violations',
        children: VIOLATION_TYPES.map(v => ({ key: `itms.violations.${v.key}`, label: v.label })),
      },
      { key: 'itms.alerts', label: 'Alerts' },
    ],
  },
  {
    module: 'safety', label: 'Public Safety', accent: '#f59e0b',
    children: [
      { key: 'safety.crowd', label: 'Crowd' },
      { key: 'safety.frs', label: 'FRS' },
    ],
  },
  {
    module: 'analytics', label: 'Analytics', accent: '#f59e0b',
    children: [
      { key: 'analytics.dashboard', label: 'Dashboard' },
      { key: 'analytics.reports', label: 'Reports' },
      { key: 'analytics.alerts', label: 'Alerts' },
    ],
  },
  {
    module: 'search', label: 'Search', accent: '#f59e0b',
    children: [
      { key: 'search', label: 'IRIS Search' },
      { key: 'search.forensics', label: 'IRIS Observer' },
    ],
  },
  {
    module: 'settings', label: 'Settings', accent: '#6b7280',
    children: [
      { key: 'settings.workers', label: 'Workers' },
      { key: 'settings.operators', label: 'Operators' },
    ],
  },
];

// Flatten to all keys (for "enable/disable all" + default seeding reference).
export function allFeatureKeys(): string[] {
  const keys: string[] = [];
  const walk = (nodes: FeatureNode[]) => nodes.forEach(n => { keys.push(n.key); if (n.children) walk(n.children); });
  FEATURE_TREE.forEach(m => { keys.push(m.module); walk(m.children); });
  return keys;
}
