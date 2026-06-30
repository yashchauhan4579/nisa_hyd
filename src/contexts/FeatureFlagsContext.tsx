import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';

export interface PlatformConfig {
  siteName: string;
  features: Record<string, boolean>;
  deploymentMode: 'server' | 'edge';
  centralServerUrl: string;
}

interface FeatureFlagsContextType {
  config: PlatformConfig;
  loading: boolean;
  isEnabled: (key: string) => boolean;
  refresh: () => Promise<void>;
  updateConfig: (patch: Partial<PlatformConfig>) => Promise<void>;
}

const DEFAULT_CONFIG: PlatformConfig = {
  siteName: 'IRIS Command Center',
  features: {},
  deploymentMode: 'server',
  centralServerUrl: '',
};

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setConfig({
          siteName: data.siteName || DEFAULT_CONFIG.siteName,
          features: data.features || {},
          deploymentMode: data.deploymentMode === 'edge' ? 'edge' : 'server',
          centralServerUrl: data.centralServerUrl || '',
        });
      }
    } catch {
      /* keep defaults (all enabled) on failure */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Missing key → enabled by default (fail-open so new features show until toggled off).
  const isEnabled = useCallback(
    (key: string) => config.features[key] !== false,
    [config.features],
  );

  const updateConfig = useCallback(async (patch: Partial<PlatformConfig>) => {
    const next = { ...config, ...patch, features: { ...config.features, ...(patch.features || {}) } };
    setConfig(next); // optimistic
    const token = localStorage.getItem('token');

    // Fetch a CSRF token (sets the csrf_token cookie) — required on mutations.
    let csrf = '';
    try {
      const r = await fetch('/api/auth/csrf-token', { credentials: 'same-origin' });
      const d = await r.json();
      csrf = d.csrfToken || d.token || '';
    } catch { /* mock mode / no csrf */ }

    await fetch('/api/config', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify(patch),
    });
  }, [config]);

  return (
    <FeatureFlagsContext.Provider value={{ config, loading, isEnabled, refresh, updateConfig }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  return ctx;
}
