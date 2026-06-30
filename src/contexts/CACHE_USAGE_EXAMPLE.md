# Data Cache Usage Guide

The `DataCacheContext` provides session-based caching for frequently accessed data. Here's how to use it in your components:

## Basic Usage

```tsx
import { useDataCache } from '@/contexts/DataCacheContext';

function MyComponent() {
  const { devices, getDevices, cameras, getCameras } = useDataCache();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Get devices (from cache if available, otherwise fetches)
        const allDevices = await getDevices();
        console.log('Devices:', allDevices);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [getDevices]);

  return (
    <div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <p>Total devices: {devices?.length || 0}</p>
      )}
    </div>
  );
}
```

## Force Refresh

To bypass the cache and fetch fresh data:

```tsx
// Force refresh (bypasses cache)
await getDevices(true);
await getWorkers(true);
await getCameras(true);
```

## Available Methods

### `getDevices(forceRefresh?: boolean): Promise<Device[]>`
- Returns all devices from cache or fetches if not available
- Cache expiry: 15 minutes

### `getCameras(forceRefresh?: boolean): Promise<Device[]>`
- Returns only camera-type devices
- Cache expiry: 15 minutes

### `getWorkers(forceRefresh?: boolean): Promise<Worker[]>`
- Returns all workers from cache or fetches if not available
- Cache expiry: 15 minutes

### `getVCCStatsToday(forceRefresh?: boolean): Promise<VCCStats | null>`
- Returns today's VCC statistics
- Cache expiry: 15 minutes

### `clearCache(): void`
- Clears all cached data from sessionStorage
- Useful when you need to force a complete refresh

### `prefetchAll(): Promise<void>`
- Prefetches all common data in the background
- Automatically called when user lands on HomePage
- Prevents showing spinners/loading states when navigating

## State Properties

All cached data is also available as state:

```tsx
const { devices, workers, cameras, vccStatsToday, isPrefetching } = useDataCache();

// Use directly in render
return (
  <div>
    <p>Devices: {devices?.length || 0}</p>
    <p>Workers: {workers?.length || 0}</p>
    <p>Cameras: {cameras?.length || 0}</p>
    {isPrefetching && <span>Loading data in background...</span>}
  </div>
);
```

## Example: Replacing Direct API Calls

### Before (without cache):
```tsx
function VCCDashboard() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const data = await apiClient.getDevices();
      setDevices(data);
      setLoading(false);
    };
    fetchData();
  }, []);

  return <div>{loading ? 'Loading...' : `${devices.length} devices`}</div>;
}
```

### After (with cache):
```tsx
function VCCDashboard() {
  const { devices, getDevices } = useDataCache();
  const [loading, setLoading] = useState(!devices); // Only show loading if no cache

  useEffect(() => {
    const fetchData = async () => {
      if (!devices) setLoading(true);
      await getDevices();
      setLoading(false);
    };
    fetchData();
  }, [devices, getDevices]);

  // Data is available immediately if cached!
  return <div>{loading ? 'Loading...' : `${devices?.length || 0} devices`}</div>;
}
```

## Benefits

1. **No redundant API calls**: If data is already loaded, visiting a page again doesn't refetch
2. **Faster page loads**: Cached data is available instantly
3. **Background prefetching**: HomePage triggers prefetch so other pages load instantly
4. **Session persistence**: Cache survives page navigation but clears on browser close
5. **Automatic expiry**: Stale data is automatically refetched

## Cache Expiry Times

- Devices: 15 minutes
- Workers: 15 minutes
- Cameras: 15 minutes
- VCC Stats (today): 15 minutes

## Notes

- Cache is stored in `sessionStorage`, so it persists across page navigations but clears when the browser/tab is closed
- Cache is automatically cleared on logout
- Multiple components can safely call the same getter without triggering duplicate API requests
- Use `forceRefresh=true` when you need guaranteed fresh data (e.g., after creating/updating records)
