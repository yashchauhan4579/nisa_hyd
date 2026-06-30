import { Document, Page, Text, View, StyleSheet, Image, Svg, Path, Circle, G } from '@react-pdf/renderer';
import type { Person } from '@sringeri/lib/api';

interface FRSDetection {
  id: number;
  personId?: string;
  deviceId: string;
  /** Hydrated device relation (preloaded by /api/frs/detections). */
  device?: { id?: string; name?: string };
  timestamp: string;
  metadata: any;
  person?: Person;
}

interface FRSReportPDFProps {
  persons: Person[];
  detections: FRSDetection[];
  reportTitle: string;
  generatedAt: string;
  filters?: {
    watchlistFilter?: string;
    searchQuery?: string;
  };
  /**
   * URL → base64 data: URI map. Pre-fetched in the caller so @react-pdf
   * doesn't have to download images serially during PDF render.
   */
  imageMap?: Map<string, string>;
  /** Total counts before slicing for the report (used in summary). */
  totalPersons?: number;
  totalDetections?: number;
  /** Time range the detection set was filtered to (display only). */
  timeRange?: { from?: string; to?: string };
}

const SAFFRON = '#b45309';
const SAFFRON_LIGHT = '#fde68a';
const GOLD = '#f59e0b';
const INK = '#3f2706';
const PAGE_BG = '#fffbf2';
const CARD_BG = '#ffffff';

const THREAT_COLORS: Record<string, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#16a34a',
  unknown: '#9ca3af',
};

const styles = StyleSheet.create({
  page: {
    padding: 28,
    paddingTop: 22,
    paddingBottom: 36,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: PAGE_BG,
  },
  headerBand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#fff7ed',
    borderTop: `3 solid ${GOLD}`,
    borderBottom: `1 solid ${SAFFRON_LIGHT}`,
    marginBottom: 12,
  },
  headerEmblem: { width: 38, height: 38, marginRight: 10 },
  headerTextWrap: { flex: 1 },
  headerEyebrow: {
    fontSize: 7,
    fontWeight: 'bold',
    color: SAFFRON,
    marginBottom: 2,
  },
  headerTitle: { fontSize: 13, fontWeight: 'bold', color: INK, marginBottom: 1 },
  headerSubtitle: { fontSize: 8, color: '#7c5a2b' },
  headerMetaRight: { fontSize: 7, color: '#92400e', textAlign: 'right' },

  // KPI tiles row
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiTile: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 4,
    padding: 8,
    borderLeft: `3 solid ${GOLD}`,
  },
  kpiLabel: {
    fontSize: 7,
    color: SAFFRON,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  kpiValue: { fontSize: 18, fontWeight: 'bold', color: INK },
  kpiHint: { fontSize: 7, color: '#7c5a2b', marginTop: 2 },

  // Two-column charts row
  chartsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  chartCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 4,
    padding: 10,
    border: `1 solid ${SAFFRON_LIGHT}`,
  },
  chartTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: SAFFRON,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barLabel: { width: '36%', fontSize: 8.5, color: INK },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#fff1d6',
    borderRadius: 2,
    marginRight: 6,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: SAFFRON, borderRadius: 2 },
  barValue: { width: 26, fontSize: 8.5, color: INK, textAlign: 'right', fontWeight: 'bold' },

  // 24-bar hourly distribution (vertical sparkline-style chart).
  hourlyWrap: { marginTop: 6 },
  hourlyBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
    gap: 2,
    paddingLeft: 6,
    paddingRight: 6,
  },
  hourlyBar: {
    flex: 1,
    backgroundColor: SAFFRON,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    minHeight: 1,
  },
  hourlyLabelsRow: {
    flexDirection: 'row',
    paddingLeft: 6,
    paddingRight: 6,
    marginTop: 2,
  },
  hourlyLabel: {
    flex: 1,
    fontSize: 6,
    color: '#7c5a2b',
    textAlign: 'center',
  },
  hourlyHint: { fontSize: 7, color: '#7c5a2b', marginTop: 4 },

  // Donut chart layout (camera distribution)
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

  // Threat level cells
  threatGrid: { flexDirection: 'row', gap: 6 },
  threatCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 3,
    alignItems: 'center',
  },
  threatCellLabel: { fontSize: 6.5, color: 'white', fontWeight: 'bold', letterSpacing: 0.3 },
  threatCellValue: { fontSize: 14, color: 'white', fontWeight: 'bold', marginTop: 2 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: SAFFRON,
    marginBottom: 6,
    marginTop: 4,
    paddingBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    borderBottom: `1 solid ${SAFFRON_LIGHT}`,
  },

  // Row-wise detection log. Each detection is one row (~110 pt tall):
  //   [#] [frame thumb 140x90] [face 60x90] [name + dept + threat] [time + camera + conf]
  // Rows declare wrap=false so react-pdf moves an entire row to the next
  // page instead of splitting it.
  rowsTableHeader: {
    flexDirection: 'row',
    backgroundColor: SAFFRON,
    color: 'white',
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  detectionRow: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: SAFFRON_LIGHT,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  detectionRowAlt: {
    backgroundColor: '#fff5e0',
  },
  cellNum: { width: '4%', fontSize: 8, color: INK, textAlign: 'center' },
  cellFrame: { width: '20%', paddingRight: 6 },
  cellFace: { width: '8%', paddingRight: 6 },
  cellPerson: { width: '32%', paddingRight: 8 },
  cellMeta: { width: '36%' },
  rowFrame: {
    width: '100%',
    height: 68,
    objectFit: 'cover',
    borderRadius: 3,
    backgroundColor: '#1f1109',
  },
  rowFace: {
    width: '100%',
    height: 60,
    objectFit: 'cover',
    borderRadius: 3,
    backgroundColor: '#1f1109',
  },
  cellLabel: {
    fontSize: 6.5,
    color: '#7c5a2b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cellValue: { fontSize: 9, color: INK, fontWeight: 'bold' },
  cellValueSm: { fontSize: 8, color: INK },
  threatPill: {
    fontSize: 6.5,
    color: 'white',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 2,
    alignSelf: 'flex-start',
    marginTop: 3,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  metaPair: { flexDirection: 'row', marginBottom: 2 },
  metaPairLabel: { width: 58, fontSize: 7, color: '#7c5a2b' },
  metaPairValue: { fontSize: 8, color: INK, fontWeight: 'bold', flex: 1 },

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

const formatDateTime = (timestamp: string) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

const PageHeader = ({
  title,
  subtitle,
  rightTop,
  rightBottom,
}: {
  title: string;
  subtitle?: string;
  rightTop?: string;
  rightBottom?: string;
}) => (
  <View style={styles.headerBand}>
    <Image src="/sringeri-emblem.png" style={styles.headerEmblem} />
    <View style={styles.headerTextWrap}>
      <Text style={styles.headerEyebrow}>SRI SRINGERI SHARADA PEETHAM</Text>
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
    <View>
      {rightTop ? <Text style={styles.headerMetaRight}>{rightTop}</Text> : null}
      {rightBottom ? <Text style={styles.headerMetaRight}>{rightBottom}</Text> : null}
    </View>
  </View>
);

const KPI = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <View style={styles.kpiTile}>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={styles.kpiValue}>{value}</Text>
    {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
  </View>
);

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
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
};

// Saffron-themed palette for the donut chart slices.
const SLICE_COLORS = ['#b45309', '#f59e0b', '#fbbf24', '#92400e', '#d97706', '#fb923c', '#fcd34d', '#9ca3af'];

const Donut = ({
  data,
  total,
  centerLabel,
}: {
  data: Array<{ label: string; value: number }>;
  total: number;
  centerLabel?: string;
}) => {
  // SVG geometry
  const cx = 65;
  const cy = 65;
  const rOuter = 58;
  const rInner = 32;

  // Build slice paths.
  let cursor = -Math.PI / 2; // start at 12 o'clock
  const slices = data.map((d, i) => {
    const angle = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    const start = cursor;
    const end = cursor + angle;
    cursor = end;

    // Skip degenerate slices (zero or near-zero) to avoid invalid arcs.
    if (angle < 0.0001) {
      return { path: '', color: SLICE_COLORS[i % SLICE_COLORS.length] };
    }

    const sxOuter = cx + rOuter * Math.cos(start);
    const syOuter = cy + rOuter * Math.sin(start);
    const exOuter = cx + rOuter * Math.cos(end);
    const eyOuter = cy + rOuter * Math.sin(end);
    const sxInner = cx + rInner * Math.cos(end);
    const syInner = cy + rInner * Math.sin(end);
    const exInner = cx + rInner * Math.cos(start);
    const eyInner = cy + rInner * Math.sin(start);

    const largeArc = angle > Math.PI ? 1 : 0;

    // Donut wedge: outer arc forward, line to inner, inner arc reverse, close.
    const dPath =
      `M ${sxOuter.toFixed(2)} ${syOuter.toFixed(2)} ` +
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${exOuter.toFixed(2)} ${eyOuter.toFixed(2)} ` +
      `L ${sxInner.toFixed(2)} ${syInner.toFixed(2)} ` +
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${exInner.toFixed(2)} ${eyInner.toFixed(2)} Z`;

    return { path: dPath, color: SLICE_COLORS[i % SLICE_COLORS.length] };
  });

  return (
    <View style={styles.donutWrap}>
      <View style={styles.donutSvgWrap}>
        <Svg width={130} height={130} viewBox="0 0 130 130">
          <G>
            {slices.map((s, i) =>
              s.path ? <Path key={i} d={s.path} fill={s.color} /> : null,
            )}
            {/* Center hole — kept slightly smaller than rInner to mask any
                 anti-aliasing gaps where wedges meet. */}
            <Circle cx={cx} cy={cy} r={rInner - 1} fill="#ffffff" />
          </G>
        </Svg>
        <View style={styles.donutCenterText}>
          <Text style={styles.donutCenterValue}>{total}</Text>
          {centerLabel ? <Text style={styles.donutCenterLabel}>{centerLabel}</Text> : null}
        </View>
      </View>
      <View style={styles.donutLegend}>
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <View key={d.label} style={styles.donutLegendRow}>
              <View style={[styles.donutSwatch, { backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }]} />
              <Text style={styles.donutLegendLabel}>{d.label}</Text>
              <Text style={styles.donutLegendValue}>{d.value} · {pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export const FRSReportPDF = ({
  persons,
  detections,
  reportTitle,
  generatedAt,
  filters,
  imageMap,
  totalDetections,
  timeRange,
}: FRSReportPDFProps) => {
  // Resolve a URL to its pre-fetched data: URI if we have one. Falls through
  // to the original URL so the report still renders if the cache is missing.
  const src = (u?: string | null): string | undefined => {
    if (!u) return undefined;
    return imageMap?.get(u) || u;
  };

  // For each detection, find the matched person (so we can show name,
  // department, threat level on each row).
  const personById = new Map<string, Person>();
  persons.forEach((p) => personById.set(String(p.id), p));
  const matchOf = (d: FRSDetection): Person | undefined => {
    if (d.person) return d.person;
    const pid = (d as any)?.personId ?? d.metadata?.person_id;
    if (pid != null) return personById.get(String(pid));
    return undefined;
  };

  // Sort detections by time (most recent first) so the report reads
  // chronologically newest-on-top.
  const sortedDetections = [...detections].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // ---- Aggregations on the SIGHTED-only set ----
  const totalSightings = sortedDetections.length;
  const sightedPersonIds = new Set(
    sortedDetections
      .map((d) => matchOf(d)?.id)
      .filter((id): id is string => Boolean(id))
      .map((id) => String(id)),
  );
  const uniquePersons = sightedPersonIds.size;

  // Sightings by threat level (using the matched person's threat).
  let highSightings = 0;
  let mediumSightings = 0;
  let lowSightings = 0;
  let unknownSightings = 0;
  sortedDetections.forEach((d) => {
    const t = (matchOf(d)?.threatLevel || '').toLowerCase();
    if (t === 'high') highSightings++;
    else if (t === 'medium') mediumSightings++;
    else if (t === 'low') lowSightings++;
    else unknownSightings++;
  });

  // Top persons by sighting count (who showed up the most).
  const sightingsByPerson: Record<string, { person?: Person; name: string; count: number }> = {};
  sortedDetections.forEach((d) => {
    const m = matchOf(d);
    const key = String(m?.id ?? d.metadata?.person_id ?? d.metadata?.person_name ?? 'unknown');
    const name = m?.name || d.metadata?.person_name || 'Unknown';
    if (!sightingsByPerson[key]) sightingsByPerson[key] = { person: m, name, count: 0 };
    sightingsByPerson[key].count++;
  });
  const topSighted = Object.values(sightingsByPerson)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topMax = topSighted.length ? topSighted[0].count : 0;

  // Resolve a detection to a human-readable camera/location label.
  // Prefer the preloaded device.name; fall back to a short device ID
  // suffix so the chart and table never show a 16-char internal ID.
  const cameraLabel = (d: FRSDetection): string => {
    const name = (d as any)?.device?.name?.toString().trim();
    if (name) return name;
    const id = d.deviceId || '';
    if (!id) return 'Unknown';
    return id.length > 14 ? `…${id.slice(-6)}` : id;
  };

  // Sightings by camera/device.
  const camCounts: Record<string, number> = {};
  sortedDetections.forEach((d) => {
    camCounts[cameraLabel(d)] = (camCounts[cameraLabel(d)] || 0) + 1;
  });
  const topCams = Object.entries(camCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Sightings by hour-of-day (0..23) — useful to spot peak times.
  const hourly = new Array(24).fill(0) as number[];
  sortedDetections.forEach((d) => {
    const dt = new Date(d.timestamp);
    if (!Number.isNaN(dt.getTime())) hourly[dt.getHours()]++;
  });
  const hourlyMax = Math.max(0, ...hourly);
  const peakHour = hourly.indexOf(hourlyMax);

  // Sightings by department/category of the matched person.
  const deptCounts: Record<string, number> = {};
  sortedDetections.forEach((d) => {
    const m = matchOf(d);
    const raw = (m?.category || '').trim();
    const key = raw ? titleCase(raw) : 'Unassigned';
    deptCounts[key] = (deptCounts[key] || 0) + 1;
  });
  const topDepts = Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const deptMax = topDepts.length ? topDepts[0][1] : 0;

  // Confidence histogram bins. Useful to see how strong the matches are.
  const confBins = [
    { label: '< 50 %', min: 0, max: 0.5, count: 0 },
    { label: '50–60 %', min: 0.5, max: 0.6, count: 0 },
    { label: '60–70 %', min: 0.6, max: 0.7, count: 0 },
    { label: '70–80 %', min: 0.7, max: 0.8, count: 0 },
    { label: '80–90 %', min: 0.8, max: 0.9, count: 0 },
    { label: '≥ 90 %', min: 0.9, max: 2, count: 0 },
  ];
  sortedDetections.forEach((d) => {
    const c = (d as any)?.metadata?.confidence ?? (d as any)?.metadata?.match_score ?? (d as any)?.confidence ?? (d as any)?.matchScore;
    if (typeof c !== 'number') return;
    for (const b of confBins) {
      if (c >= b.min && c < b.max) {
        b.count++;
        return;
      }
    }
  });
  const confMax = Math.max(0, ...confBins.map((b) => b.count));

  // 5 rows per page now that each row is taller (78 pt frame thumbnail
  // + 68 pt face + padding ≈ 92 pt per row). 5 × 92 = 460 pt fits the
  // A4 landscape body height edge-to-edge.
  const ROWS_PER_PAGE = 5;
  const detectionPages = chunk(sortedDetections, ROWS_PER_PAGE);

  // Range label for header
  const rangeLabel = (() => {
    if (!timeRange) return undefined;
    const f = timeRange.from;
    const t = timeRange.to;
    if (!f && !t) return undefined;
    return `${f || 'All time'} → ${t || 'Now'}`;
  })();

  // ---- Render ----
  return (
    <Document>
      {/* ===== Page 1: Summary of sightings in this time range ===== */}
      <Page size="A4" style={styles.page} orientation="landscape">
        <PageHeader
          title="Facial Recognition — Sightings Report"
          subtitle={
            rangeLabel
              ? `${reportTitle}  ·  ${rangeLabel}`
              : reportTitle
          }
          rightTop="Generated"
          rightBottom={generatedAt}
        />

        {filters && (filters.watchlistFilter && filters.watchlistFilter !== 'all' || filters.searchQuery) ? (
          <Text style={{ fontSize: 7, color: '#92400e', marginBottom: 8 }}>
            Filter:{' '}
            {filters.watchlistFilter && filters.watchlistFilter !== 'all'
              ? filters.watchlistFilter
              : 'All'}
            {filters.searchQuery ? `  ·  Search: "${filters.searchQuery}"` : ''}
          </Text>
        ) : null}

        {totalDetections != null && totalDetections > sortedDetections.length ? (
          <Text style={{ fontSize: 7, color: '#92400e', marginBottom: 8, fontStyle: 'italic' }}>
            Showing {sortedDetections.length} of {totalDetections} matched sightings in this range.
            Narrow the time range to see all detections.
          </Text>
        ) : null}

        <View style={styles.kpiRow}>
          <KPI
            label="Total Sightings"
            value={totalDetections ?? totalSightings}
            hint={totalDetections != null && totalDetections > totalSightings ? `${totalSightings} shown` : undefined}
          />
          <KPI label="Unique Persons Seen" value={uniquePersons} />
          <KPI
            label="High-Threat Sightings"
            value={highSightings}
            hint={totalSightings ? `${Math.round((highSightings / totalSightings) * 100)}% of sightings` : undefined}
          />
          <KPI label="Cameras with Hits" value={Object.keys(camCounts).length} />
        </View>

        <View style={styles.chartsRow}>
          {/* Most-sighted persons */}
          <View style={[styles.chartCard, { flex: 1.4 }]}>
            <Text style={styles.chartTitle}>Most-Sighted Persons (Top {topSighted.length})</Text>
            {topSighted.length === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>
                No matched sightings in this range.
              </Text>
            ) : (
              topSighted.map((row) => (
                <HBar key={row.name} label={row.name} value={row.count} max={topMax} />
              ))
            )}
          </View>

          {/* Threat split */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Sightings by Threat</Text>
            <View style={styles.threatGrid}>
              <View style={[styles.threatCell, { backgroundColor: THREAT_COLORS.high }]}>
                <Text style={styles.threatCellLabel}>HIGH</Text>
                <Text style={styles.threatCellValue}>{highSightings}</Text>
              </View>
              <View style={[styles.threatCell, { backgroundColor: THREAT_COLORS.medium }]}>
                <Text style={styles.threatCellLabel}>MEDIUM</Text>
                <Text style={styles.threatCellValue}>{mediumSightings}</Text>
              </View>
              <View style={[styles.threatCell, { backgroundColor: THREAT_COLORS.low }]}>
                <Text style={styles.threatCellLabel}>LOW</Text>
                <Text style={styles.threatCellValue}>{lowSightings}</Text>
              </View>
              <View style={[styles.threatCell, { backgroundColor: THREAT_COLORS.unknown }]}>
                <Text style={styles.threatCellLabel}>UNKNOWN</Text>
                <Text style={styles.threatCellValue}>{unknownSightings}</Text>
              </View>
            </View>

            <Text style={[styles.chartTitle, { marginTop: 14 }]}>Match Confidence</Text>
            {confMax === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>
                No data.
              </Text>
            ) : (
              confBins.map((b) => (
                <HBar key={b.label} label={b.label} value={b.count} max={confMax} />
              ))
            )}
          </View>

          {/* Camera donut */}
          <View style={[styles.chartCard, { flex: 1.4 }]}>
            <Text style={styles.chartTitle}>Sightings by Camera</Text>
            {topCams.length === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>
                No data.
              </Text>
            ) : (
              <Donut
                total={totalSightings}
                centerLabel="sightings"
                data={(() => {
                  const top = topCams.slice(0, 6).map(([label, value]) => ({ label, value }));
                  const otherTotal = Object.entries(camCounts)
                    .slice(6)
                    .reduce((a, [, v]) => a + v, 0);
                  if (otherTotal > 0) top.push({ label: 'Other', value: otherTotal });
                  return top;
                })()}
              />
            )}
          </View>
        </View>

        {/* Second charts row: hourly distribution + dept + confidence */}
        <View style={styles.chartsRow}>
          {/* Hourly distribution as a 24-bar vertical sparkline */}
          <View style={[styles.chartCard, { flex: 2 }]}>
            <Text style={styles.chartTitle}>
              Sightings by Hour of Day
              {hourlyMax > 0 ? `  ·  peak ${peakHour.toString().padStart(2, '0')}:00 (${hourlyMax})` : ''}
            </Text>
            {hourlyMax === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>No data.</Text>
            ) : (
              <View style={styles.hourlyWrap}>
                <View style={styles.hourlyBarsRow}>
                  {hourly.map((n, h) => (
                    <View
                      key={h}
                      style={[
                        styles.hourlyBar,
                        { height: `${Math.max(2, Math.round((n / hourlyMax) * 100))}%` },
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.hourlyLabelsRow}>
                  {hourly.map((_, h) => (
                    <Text key={h} style={styles.hourlyLabel}>
                      {h % 3 === 0 ? h.toString().padStart(2, '0') : ''}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Department / category breakdown */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Top Departments Sighted</Text>
            {topDepts.length === 0 ? (
              <Text style={{ fontSize: 8, color: '#7c5a2b', fontStyle: 'italic' }}>
                No department data.
              </Text>
            ) : (
              topDepts.slice(0, 7).map(([dept, n]) => (
                <HBar key={dept} label={dept} value={n} max={deptMax} />
              ))
            )}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>FRS Sightings  ·  Sri Sringeri Sharada Peetham</Text>
        </View>
      </Page>

      {/* ===== Pages 2+: Row-wise sighting log ===== */}
      {detectionPages.map((pageItems, pageIndex) => (
        <Page key={`log-${pageIndex}`} size="A4" style={styles.page} orientation="landscape">
          <PageHeader
            title="Recognized Persons"
            subtitle={rangeLabel}
            rightTop={`Page ${pageIndex + 1} of ${detectionPages.length}`}
            rightBottom={generatedAt}
          />

          <View style={styles.rowsTableHeader}>
            <Text style={styles.cellNum}>#</Text>
            <Text style={styles.cellFrame}>Camera Frame</Text>
            <Text style={styles.cellFace}>Face</Text>
            <Text style={styles.cellPerson}>Person · Department</Text>
            <Text style={styles.cellMeta}>Where & When</Text>
          </View>

          {pageItems.map((d, i) => {
            const matched = matchOf(d);
            const images = d.metadata?.images || {};
            const matchUrl =
              images['face_crop.jpg'] ||
              images['face.jpg'] ||
              (d as any)?.faceSnapshotUrl ||
              d.metadata?.face_snapshot_url ||
              '';
            const frameUrl =
              images['frame.jpg'] ||
              (d as any)?.fullSnapshotUrl ||
              d.metadata?.full_snapshot_url ||
              d.metadata?.fullImageUrl ||
              '';
            const refUrl = matched?.faceImageUrl || '';
            const conf = d.metadata?.confidence ?? d.metadata?.match_score;
            const confPct = conf != null ? `${Math.round(conf * 100)}%` : '—';
            const quality =
              d.metadata?.quality_score != null
                ? `${Math.round(d.metadata.quality_score * 100)}%`
                : '—';
            const threat = (matched?.threatLevel || 'unknown').toLowerCase();
            const threatColor = THREAT_COLORS[threat] || THREAT_COLORS.unknown;
            const dept = matched?.category ? titleCase(matched.category) : '—';
            const rowIndex = pageIndex * ROWS_PER_PAGE + i + 1;
            return (
              <View
                key={d.id}
                style={[styles.detectionRow, i % 2 === 1 ? styles.detectionRowAlt : {}]}
                wrap={false}
              >
                <Text style={styles.cellNum}>{rowIndex}</Text>

                <View style={styles.cellFrame}>
                  {frameUrl && src(frameUrl) ? (
                    <Image src={src(frameUrl) as string} style={styles.rowFrame} />
                  ) : (
                    <View style={styles.rowFrame} />
                  )}
                </View>

                <View style={styles.cellFace}>
                  {matchUrl && src(matchUrl) ? (
                    <Image src={src(matchUrl) as string} style={styles.rowFace} />
                  ) : refUrl && src(refUrl) ? (
                    <Image src={src(refUrl) as string} style={styles.rowFace} />
                  ) : (
                    <View style={styles.rowFace} />
                  )}
                </View>

                <View style={styles.cellPerson}>
                  <Text style={styles.cellValue}>
                    {matched?.name || d.metadata?.person_name || 'Unknown'}
                  </Text>
                  <Text style={styles.cellValueSm}>{dept}</Text>
                  {matched?.gender || matched?.age ? (
                    <Text style={[styles.cellValueSm, { color: '#7c5a2b' }]}>
                      {matched?.gender ? titleCase(matched.gender) : ''}
                      {matched?.gender && matched?.age ? ' · ' : ''}
                      {matched?.age ? `Age ${matched.age}` : ''}
                    </Text>
                  ) : null}
                  <Text style={[styles.threatPill, { backgroundColor: threatColor }]}>
                    {(matched?.threatLevel || 'UNKNOWN').toUpperCase()} THREAT
                  </Text>
                </View>

                <View style={styles.cellMeta}>
                  <View style={styles.metaPair}>
                    <Text style={styles.metaPairLabel}>Time</Text>
                    <Text style={styles.metaPairValue}>{formatDateTime(d.timestamp)}</Text>
                  </View>
                  <View style={styles.metaPair}>
                    <Text style={styles.metaPairLabel}>Camera</Text>
                    <Text style={styles.metaPairValue}>{cameraLabel(d)}</Text>
                  </View>
                  <View style={styles.metaPair}>
                    <Text style={styles.metaPairLabel}>Confidence</Text>
                    <Text style={styles.metaPairValue}>{confPct}</Text>
                  </View>
                  <View style={styles.metaPair}>
                    <Text style={styles.metaPairLabel}>Quality</Text>
                    <Text style={styles.metaPairValue}>{quality}</Text>
                  </View>
                </View>
              </View>
            );
          })}

          <View style={styles.footer} fixed>
            <Text>
              Recognized Persons  ·  Page {pageIndex + 1} of {detectionPages.length}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
};
