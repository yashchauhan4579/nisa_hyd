# Iris Frontend

React 19 + TypeScript + Vite dashboard for the Iris AI-powered traffic management platform.

## Stack

- **Framework**: React 19 + TypeScript
- **Build**: Vite 6
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Routing**: React Router v7
- **Charts**: Custom SVG charts + Recharts
- **Icons**: Lucide React

## Development

```bash
npm install
npm run dev       # Dev server on port 1111 (proxies /api → localhost:3001)
npm run build     # TypeScript check + production build
npm run lint      # ESLint
```

## Production

```bash
npm run build
sudo systemctl restart iris-frontend.service

# Logs
journalctl -u iris-frontend.service -f --no-pager
```

**Environment** (`client/.env`):
```bash
VITE_API_Base_URL=http://localhost:3001  # Required for preview/production mode
```

## Project Structure

```
src/
├── components/
│   ├── nvcc/          # Normal VCC dashboard + components
│   ├── tvcc/          # Thermal VCC dashboard + components
│   ├── itms/          # ITMS analytics dashboard
│   ├── anpr/          # ANPR dashboard
│   ├── crowd/         # Crowd density dashboard
│   ├── map/           # Map view
│   ├── home/          # Home page
│   ├── cameras/       # Camera live view
│   ├── workers/       # Edge worker management
│   ├── violations/    # Traffic violations
│   ├── layout/        # Sidebar, TopBar
│   └── ui/            # shadcn/ui components
├── pages/             # Page-level components (wrapped in RequireAuth)
├── contexts/          # React contexts (Auth, Theme, DataCache, etc.)
├── lib/
│   ├── api.ts         # ApiClient class + all TypeScript interfaces
│   └── dateUtils.ts   # IST timezone utilities
└── App.tsx            # Routes + layout
```

## Key Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | HomePage | Full screen, no sidebar |
| `/itms/tvcc` | VCCDashboard (tvcc) | Thermal VCC, no TopBar |
| `/itms/nvcc` | NVCCDashboard | Normal VCC, no TopBar |
| `/itms/anpr` | ANPRDashboard | |
| `/analytics/dashboard` | ITMSDashboard | No TopBar |
| `/analytics/reports` | ReportsPage | |
| `/vms/liveview` | CameraView | |
| `/vms/cameras` | CameraManagementPage | |
| `/vms/camerahealth` | CameraHealthPage | |
| `/crowd` | CrowdDashboard | |
| `/map` | MapView | |

## VCC Dashboard Features

### Multi-Camera View (default)
- Camera selector with location filter
- KPI row 1: Total Detections, Busiest Day, Busiest Hour, Dominant Vehicle
- KPI row 2: Detection Rate, Busiest Camera, System Uptime, Avg Per Camera
- Vehicle Type Distribution chart
- Detections Over Time (bar chart, user-selected range)
- Today's Activity (24-bar hourly IST chart)
- Top Devices list

### Single Camera View (1 camera selected)
- Camera filter hidden
- KPI row 1: Total Detections, Busiest Day, Busiest Hour, Dominant Vehicle
- KPI row 2: Detection Rate, Peak Hour Count, Avg per Hour, Peak Day Count
- Vehicle Type Distribution chart
- Detections Over Time: **24-hour moving window** line chart (30-min IST buckets, auto-refreshes every 5 min)
- URL state preserved on hard reload (`?cameras=<id>`)

## Data & Timezone

- All timestamps stored in UTC in the database
- All display times converted to IST (UTC+5:30) using `lib/dateUtils.ts`
- `toIST(date)` adds 330 minutes to a UTC date
- `formatUTCHourToIST(utcHour)` converts backend UTC hour to IST range string

## Caching

`DataCacheContext` provides session-based caching (15-min TTL):
- Caches devices, cameras, workers, VCC stats
- Prevents duplicate concurrent fetches
- Cleared on logout

```tsx
const { devices, getDevices } = useDataCache();
await getDevices();          // from cache if fresh
await getDevices(true);      // force refresh
```

## VCC Stats Aggregation

`aggregateStats(deviceStatsList)` in the dashboard components:
- Merges per-device stats into a single `VCCStats` object
- Derives `byDayOfWeek` from `byTime` entries (works for all `groupBy` values)
- Computes `peakDay` from `byDayOfWeek` after aggregation
- `VCCDeviceStats` does **not** include `peakDay` — must be derived from `byDayOfWeek`
