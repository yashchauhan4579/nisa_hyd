import { Document, Page, Text, View, StyleSheet, Image, Svg, Path, Circle, G } from '@react-pdf/renderer';
import type { CrowdAnalysis, CrowdAlert } from '@sringeri/lib/api';

const SAFFRON = '#b45309';
const SAFFRON_LIGHT = '#fde68a';
const GOLD = '#f59e0b';
const INK = '#3f2706';
const PAGE_BG = '#fffbf2';
const CARD_BG = '#ffffff';
const RULE = '#ece4d2';

const SEV_COLOR: Record<string, string> = {
  RED: '#dc2626',
  ORANGE: '#f97316',
  YELLOW: '#f59e0b',
  GREEN: '#16a34a',
};
const DENSITY_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#16a34a',
};

// Saffron-themed donut palette.
const SLICE_COLORS = ['#b45309', '#f59e0b', '#fbbf24', '#92400e', '#d97706', '#fb923c', '#fcd34d', '#9ca3af'];

const styles = StyleSheet.create({
  page: {
    padding: 22,
    paddingTop: 18,
    paddingBottom: 28,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: PAGE_BG,
  },
  headerBand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff7ed',
    borderTop: `3 solid ${GOLD}`,
    borderBottom: `1 solid ${SAFFRON_LIGHT}`,
    marginBottom: 8,
  },
  headerEmblem: { width: 30, height: 30, marginRight: 10 },
  headerTextWrap: { flex: 1 },
  headerEyebrow: { fontSize: 6.5, fontWeight: 'bold', color: SAFFRON, marginBottom: 1 },
  headerTitle: { fontSize: 12, fontWeight: 'bold', color: INK, marginBottom: 1 },
  headerSubtitle: { fontSize: 7.5, color: '#7c5a2b' },
  headerMetaRight: { fontSize: 7, color: '#92400e', textAlign: 'right' },

  // KPI tiles
  kpiRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  kpiTile: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 3,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderLeft: `3 solid ${GOLD}`,
  },
  kpiLabel: {
    fontSize: 6.5,
    color: SAFFRON,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  kpiValue: { fontSize: 16, fontWeight: 'bold', color: INK, lineHeight: 1.1 },
  kpiHint: { fontSize: 6.5, color: '#7c5a2b', marginTop: 1 },

  // Chart cards
  chartsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chartCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 3,
    padding: 8,
    border: `1 solid ${SAFFRON_LIGHT}`,
  },
  chartTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: SAFFRON,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },

  // Horizontal bars
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barLabel: { width: '40%', fontSize: 9, color: INK },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: '#fff1d6',
    borderRadius: 2,
    marginRight: 6,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: SAFFRON, borderRadius: 2 },
  barValue: { width: 38, fontSize: 9, color: INK, textAlign: 'right', fontWeight: 'bold' },

  // Time-series bar chart — slots flex to fill full chart width so bar
  // width scales with the bin count (fewer bins → wider bars, more
  // bins → thinner bars). Bar is 65% of its slot so adjacent bars
  // don't touch.
  hourlyBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 62,
    marginTop: 2,
    paddingLeft: 6,
    paddingRight: 6,
  },
  hourlyBarSlot: {
    flex: 1,
    height: 62,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  hourlyBar: {
    width: '65%',
    maxWidth: 28,
    backgroundColor: SAFFRON,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    minHeight: 1,
  },
  hourlyLabelsRow: {
    flexDirection: 'row',
    paddingLeft: 6,
    paddingRight: 6,
    marginTop: 2,
  },
  hourlyLabel: { flex: 1, fontSize: 7, color: '#7c5a2b', textAlign: 'center' },

  // Y-axis: 3 ticks (peak / peak/2 / 0) right-aligned in a fixed column.
  yAxisCol: {
    width: 22,
    height: 62,
    justifyContent: 'space-between',
    paddingTop: 2,
    paddingBottom: 4,
    paddingRight: 4,
  },
  yAxisTick: { fontSize: 6.5, color: '#7c5a2b', textAlign: 'right' },

  // Value label above each non-zero bar.
  hourlyBarValue: {
    fontSize: 6.5,
    color: '#7c5a2b',
    textAlign: 'center',
    marginBottom: 1,
    fontWeight: 'bold',
  },

  // Caption below the chart explaining what each bar's height encodes.
  chartUnit: {
    marginTop: 4,
    fontSize: 6.5,
    color: '#92733b',
    fontStyle: 'italic',
    textAlign: 'right',
  },

  // Severity grid (4 colored cells)
  sevGrid: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  sevCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 3,
    alignItems: 'center',
  },
  sevCellLabel: { fontSize: 6.5, color: 'white', fontWeight: 'bold', letterSpacing: 0.3 },
  sevCellValue: { fontSize: 14, color: 'white', fontWeight: 'bold', marginTop: 2 },

  // Donut + legend
  donutWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  donutSvgWrap: { width: 130, height: 130 },
  donutCenterText: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  donutCenterValue: { fontSize: 18, fontWeight: 'bold', color: INK },
  donutCenterLabel: { fontSize: 6, color: '#7c5a2b', textTransform: 'uppercase' },
  donutLegend: { flex: 1 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  donutSwatch: { width: 9, height: 9, borderRadius: 1, marginRight: 6 },
  donutLegendLabel: { flex: 1, fontSize: 8, color: INK },
  donutLegendValue: { fontSize: 8, color: '#7c5a2b', fontWeight: 'bold' },

  // Per-camera summary table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: SAFFRON,
    color: 'white',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    borderBottomWidth: 1,
    borderBottomColor: SAFFRON_LIGHT,
    backgroundColor: CARD_BG,
    alignItems: 'center',
  },
  tableRowAlt: { backgroundColor: '#fff5e0' },
  cCam: { width: '34%' },
  cFootfall: { width: '14%', textAlign: 'right' },
  cPeak: { width: '12%', textAlign: 'right' },
  cAvg: { width: '12%', textAlign: 'right' },
  cCritical: { width: '12%', textAlign: 'right' },
  cPeakHour: { width: '16%', textAlign: 'right' },

  // Alert events table (page 3+)
  alertRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    borderBottomWidth: 1,
    borderBottomColor: SAFFRON_LIGHT,
    backgroundColor: CARD_BG,
    alignItems: 'center',
  },
  aWhen: { width: '14%' },
  aCam: { width: '20%' },
  aSev: { width: '12%' },
  aDensity: { width: '10%' },
  aPeople: { width: '10%', textAlign: 'right' },
  aCong: { width: '12%', textAlign: 'right' },
  aTitle: { width: '22%' },
  sevPill: {
    fontSize: 7,
    color: 'white',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 2,
    alignSelf: 'flex-start',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // Alert image cards — bottom of page 2 alongside the per-camera table.
  alertCardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  alertCard: {
    width: '24.4%',
    backgroundColor: CARD_BG,
    border: `1 solid ${SAFFRON_LIGHT}`,
    borderRadius: 4,
    padding: 5,
  },
  alertImage: {
    width: '100%',
    height: 70,
    objectFit: 'cover',
    borderRadius: 3,
    backgroundColor: '#1f1109',
    marginBottom: 4,
  },
  alertImageFallback: {
    width: '100%',
    height: 70,
    borderRadius: 3,
    backgroundColor: '#fef3c7',
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  alertCardTitle: { fontSize: 7.5, fontWeight: 'bold', color: INK, flex: 1 },
  alertCardMeta: { fontSize: 6.5, color: '#7c5a2b' },

  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 7,
    color: '#92400e',
    textAlign: 'center',
    borderTop: `1 solid ${SAFFRON_LIGHT}`,
    paddingTop: 5,
  },
});

interface TrendBucket {
  period: string;
  /** For 5min/hour: avg people. For day: total daily footfall. */
  avgPeople: number;
  maxPeople: number;
  samples: number;
}

interface FootfallResult {
  totalFootfall: number;
  perCamera: Array<{
    deviceId: string;
    name: string;
    footfall: number;
    peakHour?: number;
    peakHourValue?: number;
    /** Highest single-frame people_count from the full table (uncapped). */
    peakPeople?: number;
    avgPeople?: number;
  }>;
}

interface Props {
  analyses: CrowdAnalysis[];
  /**
   * Pre-bucketed time series from /api/crowd/analysis/trend at the
   * granularity that fits the timeframe (5min / hour / day).
   * Used to render the trend chart.
   */
  trend?: TrendBucket[];
  /**
   * Window-aware footfall computed by the backend
   * (/api/crowd/analysis/footfall): (last cumulative_count − first
   * cumulative_count) per camera, summed. Used for both the headline
   * KPI AND the per-camera table so they always agree.
   */
  footfall?: FootfallResult;
  /** Crowd alerts fired inside the report's time window. Rendered as
   *  image cards at the bottom of page 2 if any are present. */
  alerts?: CrowdAlert[];
  /** People-count thresholds that drive the alert severity classification. */
  thresholds?: { yellow?: number; orange?: number; red?: number };
  /** URL → data: URI map for alert snapshot frames (pre-fetched so
   *  we don't have to download each image during PDF render). */
  imageMap?: Map<string, string>;
  granularity?: '5min' | 'hour' | 'day';
  reportTitle: string;
  generatedAt: string;
  fromDate?: string;
  toDate?: string;
  /** ISO bounds of the user-selected window. Used to filter trendDaily
   *  to days actually inside the report's range (the caller widens the
   *  query by one day so the LAG has previous-day context). */
  startIso?: string;
  endIso?: string;
}

const HBar = ({ label, value, max }: { label: string; value: number; max: number }) => {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} hyphenationCallback={(w) => [w]}>
        {label}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.barValue}>{value.toLocaleString('en-IN')}</Text>
    </View>
  );
};

export function CrowdReportPDF({
  analyses,
  trend = [],
  footfall,
  alerts = [],
  thresholds,
  imageMap,
  granularity = 'hour',
  reportTitle,
  generatedAt,
  fromDate: _fromDate,
  toDate: _toDate,
  startIso,
  endIso,
}: Props) {
  // ---- Aggregations ----

  // Per-camera rollup. Footfall = max cumulativeCount seen, peak = max peopleCount,
  // avg = mean peopleCount, critical = count of records with hotspotSeverity=RED.
  type CamRow = {
    deviceId: string;
    name: string;
    samples: number;
    sumPeople: number;
    peakPeople: number;
    minCumulative: number;
    maxCumulative: number;
    /** Net line crossings within the window: max − min. */
    footfall: number;
    criticalEvents: number;
    hourlyBuckets: number[];
    peakHour: number;
    peakHourValue: number;
  };
  const cams = new Map<string, CamRow>();

  for (const a of analyses) {
    const id = a.deviceId;
    let row = cams.get(id);
    if (!row) {
      row = {
        deviceId: id,
        name: (a as any).device?.name || id,
        samples: 0,
        sumPeople: 0,
        peakPeople: 0,
        minCumulative: Number.POSITIVE_INFINITY,
        maxCumulative: 0,
        footfall: 0,
        criticalEvents: 0,
        hourlyBuckets: new Array(24).fill(0),
        peakHour: 0,
        peakHourValue: 0,
      };
      cams.set(id, row);
    }
    const people = a.peopleCount ?? 0;
    row.samples++;
    row.sumPeople += people;
    if (people > row.peakPeople) row.peakPeople = people;
    if (typeof a.cumulativeCount === 'number') {
      if (a.cumulativeCount > row.maxCumulative) row.maxCumulative = a.cumulativeCount;
      if (a.cumulativeCount < row.minCumulative) row.minCumulative = a.cumulativeCount;
    }
    if (a.hotspotSeverity === 'RED') row.criticalEvents++;
    const dt = new Date(a.timestamp);
    if (!Number.isNaN(dt.getTime())) {
      // Backend buckets in IST; the JSON ISO has Z but digits are IST clock time.
      const h = dt.getUTCHours();
      row.hourlyBuckets[h] += people;
      if (row.hourlyBuckets[h] > row.peakHourValue) {
        row.peakHourValue = row.hourlyBuckets[h];
        row.peakHour = h;
      }
    }
  }
  // Compute per-camera footfall = delta of cumulativeCount within the
  // window. Cameras that never reported a cumulativeCount end up with
  // footfall=0; that's correct (density-only cameras don't have a counter).
  for (const r of cams.values()) {
    if (Number.isFinite(r.minCumulative)) {
      r.footfall = Math.max(0, r.maxCumulative - r.minCumulative);
    }
  }

  // Combine per-camera rows + sort by footfall desc.
  const camRows = Array.from(cams.values()).sort((a, b) =>
    (b.footfall || b.sumPeople) - (a.footfall || a.sumPeople),
  );

  // Headline number — single source of truth from the backend's
  // window-aware footfall endpoint. This is just the sum of the
  // per-camera values that the table on page 2 displays, so the two
  // can never disagree.
  const totalFootfall = footfall?.totalFootfall ?? 0;
  // Build camRows from the backend footfall data (which may include
  // cameras that didn't appear in the row-limited analyses), and pull
  // peak / avg / hourly-bucket info from the analyses-derived map
  // when available.
  const analysesByCam = new Map(camRows.map((r) => [r.deviceId, r]));
  const mergedRows: CamRow[] = (footfall?.perCamera || []).map((f) => {
    const fromAnalyses = analysesByCam.get(f.deviceId);
    const row: CamRow = fromAnalyses
      ? { ...fromAnalyses }
      : {
          deviceId: f.deviceId,
          name: f.name || f.deviceId,
          samples: 0,
          sumPeople: 0,
          peakPeople: 0,
          minCumulative: 0,
          maxCumulative: 0,
          footfall: 0,
          criticalEvents: 0,
          hourlyBuckets: new Array(24).fill(0),
          peakHour: 0,
          peakHourValue: 0,
        };
    row.footfall = f.footfall;
    if (f.name) row.name = f.name;
    // Prefer the backend-computed values (uncapped, full-table) over
    // anything we derived from the row-limited analyses slice. The
    // analyses array misses earlier-in-the-day samples once the
    // 5,000-row cap is hit, which is why peakPeople was reading low
    // (e.g. 31 even when alerts fired at 52 people).
    if (typeof f.peakHour === 'number') {
      row.peakHour = f.peakHour;
      row.peakHourValue = f.peakHourValue ?? row.peakHourValue;
    }
    if (typeof f.peakPeople === 'number' && f.peakPeople > row.peakPeople) {
      row.peakPeople = f.peakPeople;
    }
    if (typeof f.avgPeople === 'number') {
      // Replace the analyses-derived avg with the full-table one.
      row.sumPeople = f.avgPeople;
      row.samples = f.avgPeople > 0 ? 1 : 0;
    }
    return row;
  });
  // Re-sort by the authoritative footfall value.
  mergedRows.sort((a, b) => b.footfall - a.footfall);
  // Replace camRows reference so the rest of the report uses the merged data.
  camRows.length = 0;
  camRows.push(...mergedRows);
  const peakConcurrent = camRows.reduce((m, r) => Math.max(m, r.peakPeople), 0);
  const avgConcurrent = analyses.length > 0
    ? Math.round(analyses.reduce((s, a) => s + (a.peopleCount ?? 0), 0) / analyses.length)
    : 0;

  // Density-level distribution
  const densityCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  analyses.forEach((a) => {
    if (a.densityLevel) densityCounts[a.densityLevel] = (densityCounts[a.densityLevel] || 0) + 1;
  });
  const densityTotal = Object.values(densityCounts).reduce((s, v) => s + v, 0);
  const densityData = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => ({
    label: lvl,
    value: densityCounts[lvl] || 0,
    color: DENSITY_COLOR[lvl],
  }));

  // Severity counts (record-level)
  const sev = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0 };
  analyses.forEach((a) => {
    const s = a.hotspotSeverity as keyof typeof sev | undefined;
    if (s && s in sev) sev[s]++;
  });

  // Time-series chart: build a continuous set of bins spanning the full
  // [startIso, endIso] window so the X-axis runs the entire reported
  // timeframe (e.g. 06:00 → 22:00) — empty buckets render as 0-height
  // ticks instead of being dropped from the chart.
  // Backend ships `period` as ISO with Z suffix where the digits are IST
  // clock time, so we read via UTC accessors and key the lookup the same way.
  type TimeBin = { label: string; value: number; full?: string };

  // Index trend rows by their IST-clock-time bucket key.
  const trendByKey = new Map<string, number>();
  for (const b of trend) {
    const dt = new Date(b.period);
    if (Number.isNaN(dt.getTime())) continue;
    const value = Math.round(b.avgPeople);
    let key: string;
    if (granularity === '5min') {
      const m = Math.floor(dt.getUTCMinutes() / 5) * 5;
      key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}T${dt.getUTCHours()}:${m}`;
    } else if (granularity === 'hour') {
      key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}T${dt.getUTCHours()}`;
    } else {
      key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
    }
    trendByKey.set(key, value);
  }

  // Walk from start → end in granularity steps, in IST clock terms.
  // To get IST clock from real UTC, add 5h30m. Real UTC bounds:
  const startUtc = startIso ? new Date(startIso).getTime() : NaN;
  const endUtc = endIso ? new Date(endIso).getTime() : NaN;
  const monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bins: TimeBin[] = [];
  if (Number.isFinite(startUtc) && Number.isFinite(endUtc) && endUtc >= startUtc) {
    const stepMs =
      granularity === '5min' ? 5 * 60 * 1000 :
      granularity === 'hour' ? 60 * 60 * 1000 :
                               24 * 60 * 60 * 1000;
    // Floor start to the granularity in IST.
    const istOffset = 5.5 * 3_600_000;
    const floorIst = (utcMs: number): number => {
      const istMs = utcMs + istOffset;
      const istD = new Date(istMs);
      if (granularity === '5min') {
        return Date.UTC(istD.getUTCFullYear(), istD.getUTCMonth(), istD.getUTCDate(),
                        istD.getUTCHours(), Math.floor(istD.getUTCMinutes() / 5) * 5) - istOffset;
      }
      if (granularity === 'hour') {
        return Date.UTC(istD.getUTCFullYear(), istD.getUTCMonth(), istD.getUTCDate(),
                        istD.getUTCHours()) - istOffset;
      }
      return Date.UTC(istD.getUTCFullYear(), istD.getUTCMonth(), istD.getUTCDate()) - istOffset;
    };
    let cursor = floorIst(startUtc);
    let safety = 1000;
    while (cursor <= endUtc && safety-- > 0) {
      const ist = new Date(cursor + istOffset);
      let key: string;
      let label: string;
      let full: string;
      if (granularity === '5min') {
        const m = ist.getUTCMinutes();
        key = `${ist.getUTCFullYear()}-${ist.getUTCMonth()}-${ist.getUTCDate()}T${ist.getUTCHours()}:${m}`;
        label = `${ist.getUTCHours().toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        full = label;
      } else if (granularity === 'hour') {
        key = `${ist.getUTCFullYear()}-${ist.getUTCMonth()}-${ist.getUTCDate()}T${ist.getUTCHours()}`;
        label = `${ist.getUTCHours().toString().padStart(2, '0')}:00`;
        full = label;
      } else {
        key = `${ist.getUTCFullYear()}-${ist.getUTCMonth()}-${ist.getUTCDate()}`;
        label = ist.getUTCDate().toString().padStart(2, '0');
        full = `${label} ${monthsShort[ist.getUTCMonth()]}`;
      }
      const value = trendByKey.get(key) ?? 0;
      bins.push({ label, value, full });
      cursor += stepMs;
    }
  } else {
    // Fallback: no window passed — render whatever the backend gave us.
    for (const b of trend) {
      const dt = new Date(b.period);
      if (Number.isNaN(dt.getTime())) continue;
      const value = Math.round(b.avgPeople);
      let label = '';
      let full = '';
      if (granularity === '5min') {
        label = `${dt.getUTCHours().toString().padStart(2, '0')}:${dt.getUTCMinutes().toString().padStart(2, '0')}`;
        full = label;
      } else if (granularity === 'hour') {
        label = `${dt.getUTCHours().toString().padStart(2, '0')}:00`;
        full = label;
      } else {
        label = dt.getUTCDate().toString().padStart(2, '0');
        full = `${label} ${monthsShort[dt.getUTCMonth()]}`;
      }
      bins.push({ label, value, full });
    }
  }
  const trendMax = Math.max(0, ...bins.map((b) => b.value));
  const trendPeak = bins.reduce(
    (best, b) => (b.value > best.value ? b : best),
    { label: '—', value: 0, full: '—' } as TimeBin,
  );
  const trendChartTitle =
    granularity === '5min' ? 'Crowd Trend · 5-minute' :
    granularity === 'hour' ? 'Crowd Trend · Hourly' :
                              'Crowd Trend · Daily';
  const trendValueUnit = granularity === 'day' ? 'total people' : 'avg people';

  // Range label
  const rangeLabel = (_fromDate || _toDate) ? `${_fromDate || 'All time'} → ${_toDate || 'Now'}` : undefined;
  const inr = (n: number) => n.toLocaleString('en-IN');
  const src = (u?: string | null): string | undefined => {
    if (!u) return undefined;
    return imageMap?.get(u) || u;
  };

  return (
    <Document>
      {/* ================== Page 1 ================== */}
      <Page size="A4" style={styles.page} orientation="landscape">
        <View style={styles.headerBand}>
          <Image src="/sringeri-emblem.png" style={styles.headerEmblem} />
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerEyebrow}>SRI SRINGERI SHARADA PEETHAM</Text>
            <Text style={styles.headerTitle}>Crowd Analytics Report</Text>
            <Text style={styles.headerSubtitle}>
              {rangeLabel ? `${reportTitle}  ·  ${rangeLabel}` : reportTitle}
            </Text>
          </View>
          <View>
            <Text style={styles.headerMetaRight}>Generated</Text>
            <Text style={styles.headerMetaRight}>{generatedAt}</Text>
          </View>
        </View>

        {/* KPI tiles */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Total Footfall</Text>
            <Text style={styles.kpiValue}>{inr(totalFootfall)}</Text>
            <Text style={styles.kpiHint}>line-crossing entries</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Peak Concurrent</Text>
            <Text style={styles.kpiValue}>{inr(peakConcurrent)}</Text>
            <Text style={styles.kpiHint}>highest single-frame count</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Avg Concurrent</Text>
            <Text style={styles.kpiValue}>{inr(avgConcurrent)}</Text>
            <Text style={styles.kpiHint}>mean people per sample</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Alerts Fired</Text>
            <Text style={styles.kpiValue}>{inr(alerts.length)}</Text>
            <Text style={styles.kpiHint}>
              {alerts.filter((a) => String(a.severity).toUpperCase() === 'RED').length} critical
            </Text>
          </View>
        </View>

        {/* Trend chart + density mix — chart on the left, density
            distribution on the right fills the otherwise-empty horizontal
            space when the bin count is small (e.g. only 17 bins for a
            06:00–22:00 window). */}
        <View style={[styles.chartsRow, { gap: 8 }]} wrap={false}>
          {/* Time-series chart */}
          <View style={[styles.chartCard, { flex: 1.6 }]}>
            <Text style={styles.chartTitle}>
              {trendChartTitle}
              {trendMax > 0
                ? `  ·  peak ${trendPeak.full} (${inr(trendPeak.value)} ${trendValueUnit})`
                : ''}
            </Text>
            {bins.length === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>
                No trend data in this range.
              </Text>
            ) : (
              <View style={{ marginTop: 6, flexDirection: 'row' }}>
                {/* Y-axis ticks (peak / peak/2 / 0). Right-aligned text in
                    a fixed-width column so the value labels read clearly. */}
                <View style={styles.yAxisCol}>
                  <Text style={styles.yAxisTick}>{inr(trendMax)}</Text>
                  <Text style={styles.yAxisTick}>{inr(Math.round(trendMax / 2))}</Text>
                  <Text style={styles.yAxisTick}>0</Text>
                </View>

                {/* Bars + X-axis labels stack to the right of the Y-axis. */}
                <View style={{ flex: 1 }}>
                  <View style={styles.hourlyBarsRow}>
                    {bins.map((b, i) => (
                      <View key={i} style={styles.hourlyBarSlot}>
                        {/* Value above bar — only when non-zero, so empty
                            hours don't print a row of "0"s. */}
                        {b.value > 0 && (
                          <Text style={styles.hourlyBarValue}>{inr(b.value)}</Text>
                        )}
                        <View
                          style={[
                            styles.hourlyBar,
                            { height: `${Math.max(2, Math.round((b.value / Math.max(trendMax, 1)) * 100))}%` },
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                  <View style={styles.hourlyLabelsRow}>
                    {bins.map((b, i) => {
                      const step = Math.max(1, Math.ceil(bins.length / 12));
                      const show = i % step === 0;
                      return (
                        <Text key={i} style={styles.hourlyLabel}>
                          {show ? b.label : ''}
                        </Text>
                      );
                    })}
                  </View>
                  {/* Value-unit legend (e.g. "avg people / hour") so
                      readers know what the bar height represents. */}
                  <Text style={styles.chartUnit}>
                    Each bar = {trendValueUnit} per {granularity === '5min' ? '5 min' : granularity === 'hour' ? 'hour' : 'day'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Density Mix — share of analyses by density level. Each
              row shows the people-count range that defines the level
              (sourced from the same thresholds the alert engine uses)
              so a "100% LOW" reading is self-explanatory: nobody
              crossed the next threshold. Peak observed people-count is
              shown at the bottom for context. */}
          <View style={[styles.chartCard, { flex: 1 }]}>
            <Text style={styles.chartTitle}>Density Mix</Text>
            {densityTotal === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>
                No density data in this range.
              </Text>
            ) : (
              <View style={{ marginTop: 4 }}>
                {densityData.map((d) => {
                  const pct = densityTotal > 0 ? Math.round((d.value / densityTotal) * 100) : 0;
                  // Threshold range from the alert thresholds passed in.
                  // Use ASCII '<' and '-' / '+' instead of '<', '–', '≥' —
                  // Helvetica (@react-pdf default) maps the unicode ones
                  // to placeholder glyphs ('e', missing chars).
                  const yel = thresholds?.yellow ?? 50;
                  const ora = thresholds?.orange ?? 150;
                  const red = thresholds?.red    ?? 300;
                  const range =
                    d.label === 'LOW'      ? `< ${yel} ppl` :
                    d.label === 'MEDIUM'   ? `${yel}-${ora - 1} ppl` :
                    d.label === 'HIGH'     ? `${ora}-${red - 1} ppl` :
                                             `${red}+ ppl`;
                  return (
                    <View key={d.label} style={{ marginBottom: 6 }}>
                      {/* Row 1: swatch + label + pct (no overlap) */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
                        <View style={{ width: 8, height: 8, backgroundColor: d.color, borderRadius: 1, marginRight: 6 }} />
                        <Text style={{ flex: 1, fontSize: 8.5, color: INK, fontWeight: 'bold' }}>{d.label}</Text>
                        <Text style={{ fontSize: 8.5, color: INK, fontWeight: 'bold' }}>{pct}%</Text>
                      </View>
                      {/* Row 2: threshold-range subtitle, indented under label */}
                      <Text style={{ fontSize: 7, color: '#92733b', marginLeft: 14, marginBottom: 2 }}>
                        {range}
                      </Text>
                      <View style={{ height: 4, backgroundColor: '#fef3c7', borderRadius: 1 }}>
                        <View style={{ height: 4, width: `${pct}%`, backgroundColor: d.color, borderRadius: 1 }} />
                      </View>
                    </View>
                  );
                })}
                <View style={{ marginTop: 6, paddingTop: 5, borderTop: `0.5 solid ${RULE}`, flexDirection: 'row' }}>
                  <Text style={{ flex: 1, fontSize: 7, color: '#7c5a2b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Peak today
                  </Text>
                  <Text style={{ fontSize: 8, color: INK, fontWeight: 'bold' }}>{inr(peakConcurrent)} people</Text>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 2 }}>
                  <Text style={{ flex: 1, fontSize: 7, color: '#7c5a2b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Total samples
                  </Text>
                  <Text style={{ fontSize: 8, color: INK, fontWeight: 'bold' }}>{inr(densityTotal)}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Peak concurrent per camera + Top footfall cameras */}
        <View style={[styles.chartsRow, { marginTop: 10 }]}>
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Peak Concurrent by Camera</Text>
            {camRows.length === 0 || camRows.every((r) => !r.peakPeople) ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>
                No concurrent-people data in this range.
              </Text>
            ) : (
              [...camRows]
                .sort((a, b) => b.peakPeople - a.peakPeople)
                .slice(0, 6)
                .map((r) => (
                  <HBar
                    key={r.deviceId}
                    label={r.name}
                    value={r.peakPeople}
                    max={Math.max(...camRows.map((x) => x.peakPeople), 1)}
                  />
                ))
            )}
            {/* Alert breakdown by severity, with the people-count
                threshold that triggers each level so a 0-count cell
                is still informative ("YELLOW ≥ 50"). */}
            <Text style={[styles.chartTitle, { marginTop: 12 }]}>Alert Breakdown</Text>
            <View style={styles.sevGrid}>
              {([
                { key: 'RED', label: 'CRITICAL', limit: thresholds?.red },
                { key: 'ORANGE', label: 'WARNING', limit: thresholds?.orange },
                { key: 'YELLOW', label: 'NOTICE', limit: thresholds?.yellow },
              ] as const).map((s) => {
                const count = alerts.filter((a) =>
                  String((a as any).severity).toUpperCase() === s.key,
                ).length;
                return (
                  <View key={s.key} style={[styles.sevCell, { backgroundColor: SEV_COLOR[s.key] }]}>
                    <Text style={styles.sevCellLabel}>{s.label}</Text>
                    <Text style={styles.sevCellValue}>{count}</Text>
                    {s.limit ? (
                      <Text style={[styles.sevCellLabel, { fontSize: 6, marginTop: 1 }]}>
                        {s.limit}+ ppl
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Top Cameras by Footfall</Text>
            {camRows.length === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>No data.</Text>
            ) : (
              camRows.slice(0, 5).map((r) => (
                <HBar
                  key={r.deviceId}
                  label={r.name}
                  value={r.footfall || r.sumPeople}
                  max={camRows[0].footfall || camRows[0].sumPeople || 1}
                />
              ))
            )}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{rangeLabel || 'Crowd Analytics'}</Text>
        </View>
      </Page>

      {/* ================== Page 2: Per-camera summary table ================== */}
      <Page size="A4" style={styles.page} orientation="landscape">
        <View style={styles.headerBand}>
          <Image src="/sringeri-emblem.png" style={styles.headerEmblem} />
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerEyebrow}>SRI SRINGERI SHARADA PEETHAM</Text>
            <Text style={styles.headerTitle}>Per-Camera Summary</Text>
            <Text style={styles.headerSubtitle}>
              {rangeLabel ? `Aggregated by camera  ·  ${rangeLabel}` : 'Aggregated by camera'}
            </Text>
          </View>
          <View>
            <Text style={styles.headerMetaRight}>Generated</Text>
            <Text style={styles.headerMetaRight}>{generatedAt}</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.cCam}>Camera</Text>
          <Text style={styles.cFootfall}>Footfall</Text>
          <Text style={styles.cPeak}>Peak</Text>
          <Text style={styles.cAvg}>Avg</Text>
          <Text style={styles.cCritical}>Critical</Text>
          <Text style={styles.cPeakHour}>Peak Hour</Text>
        </View>

        {camRows.map((r, i) => (
          <View
            key={r.deviceId}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={styles.cCam}>{r.name}</Text>
            <Text style={styles.cFootfall}>{inr(r.footfall)}</Text>
            <Text style={styles.cPeak}>{inr(r.peakPeople)}</Text>
            <Text style={styles.cAvg}>{r.samples > 0 ? inr(Math.round(r.sumPeople / r.samples)) : '0'}</Text>
            <Text style={styles.cCritical}>{inr(r.criticalEvents)}</Text>
            <Text style={styles.cPeakHour}>
              {r.peakHourValue > 0 ? `${r.peakHour.toString().padStart(2, '0')}:00` : '—'}
            </Text>
          </View>
        ))}

        {camRows.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#7c5a2b', fontStyle: 'italic', marginTop: 12 }}>
            No camera data in this range.
          </Text>
        ) : null}

        {/* Alert events with snapshot images — packed under the
            per-camera table to fill page 2 instead of an extra page. */}
        {alerts.length > 0 ? (
          <View>
            <Text style={[styles.chartTitle, { marginTop: 14 }]}>
              Crowd Alert Events
            </Text>
            <View style={styles.alertCardsGrid}>
              {alerts
                .slice()
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((a) => {
                  const sev = String((a as any).severity || '').toUpperCase();
                  const sevColor = SEV_COLOR[sev] || '#9ca3af';
                  const dens = (a as any).densityLevel || '—';
                  const people = (a as any).peopleCount;
                  const actual = (a as any).actualValue;
                  const threshold = (a as any).thresholdValue;
                  const congestion = (typeof actual === 'number' && typeof threshold === 'number' && threshold > 0)
                    ? `${Math.round((actual / threshold) * 100)}%`
                    : null;
                  const camName = (a as any).device?.name || (a as any).deviceId || '—';
                  const when = new Date(a.timestamp);
                  const whenLabel = Number.isNaN(when.getTime())
                    ? '—'
                    : when.toLocaleString('en-IN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                  const frame = (a as any).frameUrl || (a as any).frameSnapshot;
                  const frameSrc = src(frame);
                  return (
                    <View key={a.id} style={styles.alertCard} wrap={false}>
                      {frameSrc ? (
                        <Image src={frameSrc} style={styles.alertImage} />
                      ) : (
                        <View style={styles.alertImageFallback}>
                          <Text style={{ fontSize: 7, color: '#a16207' }}>No image</Text>
                        </View>
                      )}
                      <View style={styles.alertCardHeader}>
                        <Text style={styles.alertCardTitle} hyphenationCallback={(w) => [w]}>
                          {camName}
                        </Text>
                        <Text style={[styles.sevPill, { backgroundColor: sevColor, fontSize: 6 }]}>
                          {sev}
                        </Text>
                      </View>
                      <Text style={styles.alertCardMeta}>
                        {whenLabel}  ·  {dens}
                      </Text>
                      <Text style={styles.alertCardMeta}>
                        {people != null ? `${inr(people)} people` : ''}
                        {congestion ? `  ·  ${congestion}` : ''}
                      </Text>
                    </View>
                  );
                })}
            </View>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{rangeLabel || 'Crowd Analytics'}</Text>
        </View>
      </Page>
    </Document>
  );
}
