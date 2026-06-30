import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, type Device, type Worker, type VCCStats } from '@/lib/api';
import { isAdmin } from '@/lib/role';

// Cache keys
const CACHE_KEYS = {
  DEVICES: 'iris_cache_devices',
  WORKERS: 'iris_cache_workers',
  VCC_STATS_TODAY: 'iris_cache_vcc_stats_today',
  CAMERAS: 'iris_cache_cameras',
  LAST_FETCH: 'iris_cache_last_fetch',
} as const;

// Cache expiry times (in milliseconds)
const CACHE_EXPIRY = {
  DEVICES: 15 * 60 * 1000, // 15 minutes
  WORKERS: 15 * 60 * 1000, // 15 minutes
  VCC_STATS: 15 * 60 * 1000, // 15 minutes
  CAMERAS: 15 * 60 * 1000, // 15 minutes
} as const;

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface DataCacheContextType {
  // Devices
  devices: Device[] | null;
  getDevices: (forceRefresh?: boolean) => Promise<Device[]>;

  // Workers
  workers: Worker[] | null;
  getWorkers: (forceRefresh?: boolean) => Promise<Worker[]>;

  // VCC Stats (today)
  vccStatsToday: VCCStats | null;
  getVCCStatsToday: (forceRefresh?: boolean) => Promise<VCCStats | null>;

  // Cameras (filtered devices)
  cameras: Device[] | null;
  getCameras: (forceRefresh?: boolean) => Promise<Device[]>;

  // Cache management
  clearCache: () => void;
  prefetchAll: () => Promise<void>;
  isPrefetching: boolean;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined);

// Helper: Get cached data from sessionStorage (must be outside component)
const getCachedDataSync = <T,>(key: string, expiryMs: number): T | null => {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;

    const { data, timestamp }: CachedData<T> = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age > expiryMs) {
      sessionStorage.removeItem(key);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Error reading cache for ${key}:`, error);
    return null;
  }
};

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  // Initialize from sessionStorage synchronously
  const [devices, setDevices] = useState<Device[] | null>(() =>
    getCachedDataSync<Device[]>(CACHE_KEYS.DEVICES, CACHE_EXPIRY.DEVICES)
  );
  const [workers, setWorkers] = useState<Worker[] | null>(() =>
    getCachedDataSync<Worker[]>(CACHE_KEYS.WORKERS, CACHE_EXPIRY.WORKERS)
  );
  const [vccStatsToday, setVccStatsToday] = useState<VCCStats | null>(() =>
    getCachedDataSync<VCCStats>(CACHE_KEYS.VCC_STATS_TODAY, CACHE_EXPIRY.VCC_STATS)
  );
  const [cameras, setCameras] = useState<Device[] | null>(() =>
    getCachedDataSync<Device[]>(CACHE_KEYS.CAMERAS, CACHE_EXPIRY.CAMERAS)
  );
  const [isPrefetching, setIsPrefetching] = useState(false);

  // Use refs to track ongoing fetches to prevent duplicate requests
  const fetchingDevices = useRef(false);
  const fetchingWorkers = useRef(false);
  const fetchingVCCStats = useRef(false);

  // Helper: Get cached data from sessionStorage
  const getCachedData = useCallback(<T,>(key: string, expiryMs: number): T | null => {
    return getCachedDataSync<T>(key, expiryMs);
  }, []);

  // Helper: Set cached data in sessionStorage
  const setCachedData = useCallback(<T,>(key: string, data: T): void => {
    try {
      const cached: CachedData<T> = {
        data,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(key, JSON.stringify(cached));
    } catch (error) {
      console.error(`Error writing cache for ${key}:`, error);
    }
  }, []);

  // Get devices with caching
  const getDevices = useCallback(async (forceRefresh = false): Promise<Device[]> => {
    // Return cached if available and not forcing refresh
    if (!forceRefresh && devices) {
      return devices;
    }

    // Check sessionStorage
    if (!forceRefresh) {
      const cached = getCachedData<Device[]>(CACHE_KEYS.DEVICES, CACHE_EXPIRY.DEVICES);
      if (cached) {
        setDevices(cached);
        return cached;
      }
    }

    // Prevent duplicate fetches
    if (fetchingDevices.current) {
      // Wait for ongoing fetch
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (!fetchingDevices.current && devices) {
            clearInterval(interval);
            resolve(devices);
          }
        }, 100);
      });
    }

    // Fetch from API
    fetchingDevices.current = true;
    try {
      const data = await apiClient.getDevices({ minimal: false }) as Device[];
      const devicesArray: Device[] = Array.isArray(data) ? data : [];
      setDevices(devicesArray);
      setCachedData(CACHE_KEYS.DEVICES, devicesArray);

      // Also update cameras cache
      const cameraDevices: Device[] = devicesArray.filter(d => d.type === 'CAMERA');
      setCameras(cameraDevices);
      setCachedData(CACHE_KEYS.CAMERAS, cameraDevices);

      return devicesArray;
    } catch (error) {
      console.error('Error fetching devices:', error);
      return devices || [];
    } finally {
      fetchingDevices.current = false;
    }
  }, [devices, getCachedData, setCachedData]);

  // Get workers with caching
  const getWorkers = useCallback(async (forceRefresh = false): Promise<Worker[]> => {
    if (!forceRefresh && workers) {
      return workers;
    }

    if (!forceRefresh) {
      const cached = getCachedData<Worker[]>(CACHE_KEYS.WORKERS, CACHE_EXPIRY.WORKERS);
      if (cached) {
        setWorkers(cached);
        return cached;
      }
    }

    if (fetchingWorkers.current) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (!fetchingWorkers.current && workers) {
            clearInterval(interval);
            resolve(workers);
          }
        }, 100);
      });
    }

    fetchingWorkers.current = true;
    try {
      const data = await apiClient.getWorkers();
      const workersArray = Array.isArray(data) ? data : [];
      setWorkers(workersArray);
      setCachedData(CACHE_KEYS.WORKERS, workersArray);
      return workersArray;
    } catch (error) {
      console.error('Error fetching workers:', error);
      return workers || [];
    } finally {
      fetchingWorkers.current = false;
    }
  }, [workers, getCachedData, setCachedData]);

  // Get VCC stats for today with caching
  const getVCCStatsToday = useCallback(async (forceRefresh = false): Promise<VCCStats | null> => {
    if (!forceRefresh && vccStatsToday) {
      return vccStatsToday;
    }

    if (!forceRefresh) {
      const cached = getCachedData<VCCStats>(CACHE_KEYS.VCC_STATS_TODAY, CACHE_EXPIRY.VCC_STATS);
      if (cached) {
        setVccStatsToday(cached);
        return cached;
      }
    }

    if (fetchingVCCStats.current) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (!fetchingVCCStats.current) {
            clearInterval(interval);
            resolve(vccStatsToday);
          }
        }, 100);
      });
    }

    fetchingVCCStats.current = true;
    try {
      // Get today's date range
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const data = await apiClient.getVCCStats({
        startTime: startOfDay.toISOString(),
        endTime: endOfDay.toISOString(),
      });

      setVccStatsToday(data);
      setCachedData(CACHE_KEYS.VCC_STATS_TODAY, data);
      return data;
    } catch (error) {
      console.error('Error fetching VCC stats:', error);
      return vccStatsToday;
    } finally {
      fetchingVCCStats.current = false;
    }
  }, [vccStatsToday, getCachedData, setCachedData]);

  // Get cameras (filtered devices)
  const getCameras = useCallback(async (forceRefresh = false): Promise<Device[]> => {
    if (!forceRefresh && cameras) {
      return cameras;
    }

    if (!forceRefresh) {
      const cached = getCachedData<Device[]>(CACHE_KEYS.CAMERAS, CACHE_EXPIRY.CAMERAS);
      if (cached) {
        setCameras(cached);
        return cached;
      }
    }

    // Fetch devices and filter
    const allDevices = await getDevices(forceRefresh);
    const cameraDevices = allDevices.filter(d => d.type === 'CAMERA');
    setCameras(cameraDevices);
    setCachedData(CACHE_KEYS.CAMERAS, cameraDevices);
    return cameraDevices;
  }, [cameras, getDevices, getCachedData, setCachedData]);

  // Clear all cache
  const clearCache = useCallback(() => {
    Object.values(CACHE_KEYS).forEach(key => {
      sessionStorage.removeItem(key);
    });
    setDevices(null);
    setWorkers(null);
    setVccStatsToday(null);
    setCameras(null);
  }, []);

  // Prefetch all common data in background
  const prefetchAll = useCallback(async () => {
    if (isPrefetching) return;

    setIsPrefetching(true);
    try {
      // Workers is an admin-only endpoint — skip it for operators so the home
      // prefetch doesn't 403-spam the console.
      const jobs = [getDevices(), getVCCStatsToday()];
      if (isAdmin()) jobs.push(getWorkers());
      await Promise.allSettled(jobs);
      console.log('✅ Data prefetch completed');
    } catch (error) {
      console.error('Error during prefetch:', error);
    } finally {
      setIsPrefetching(false);
    }
  }, [isPrefetching, getDevices, getWorkers, getVCCStatsToday]);

  const value: DataCacheContextType = {
    devices,
    getDevices,
    workers,
    getWorkers,
    vccStatsToday,
    getVCCStatsToday,
    cameras,
    getCameras,
    clearCache,
    prefetchAll,
    isPrefetching,
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}

export const useDataCache = () => {
  const context = useContext(DataCacheContext);
  if (context === undefined) {
    throw new Error('useDataCache must be used within a DataCacheProvider');
  }
  return context;
};
