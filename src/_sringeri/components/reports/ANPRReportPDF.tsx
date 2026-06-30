import { Document, Page, Text, View, StyleSheet, Image, Svg, Path, Circle, G, Rect, Line } from '@react-pdf/renderer';
import type { Vehicle } from '@sringeri/lib/api';

const SAFFRON       = '#b45309';
const SAFFRON_LIGHT = '#fde68a';
const GOLD          = '#f59e0b';
const INK           = '#3f2706';
const PAPER         = '#fffbf2';
const PAPER_2       = '#fffaf0';
const RULE          = '#ece4d2';

// Donut + bar palette — temple-warm with one cool blue accent.
const PALETTE = ['#d97706', '#f59e0b', '#fbbf24', '#a16207', '#7c2d12', '#0d3b66'];

const styles = StyleSheet.create({
  page: {
    padding: 32, paddingTop: 24,
    fontSize: 9, fontFamily: 'Helvetica',
    color: INK, backgroundColor: PAPER,
  },

  // Header band
  headerBand: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: PAPER_2,
    borderTop: `3 solid ${GOLD}`,
    borderBottom: `1 solid ${SAFFRON_LIGHT}`,
    marginBottom: 12,
  },
  headerEmblem: { width: 40, height: 40, marginRight: 12 },
  headerTextWrap: { flex: 1 },
  headerEyebrow: { fontSize: 7, fontWeight: 'bold', color: SAFFRON, letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 14, fontWeight: 'bold', color: INK, marginBottom: 1 },
  headerSubtitle: { fontSize: 8, color: '#7c5a2b' },
  headerMeta: { fontSize: 7, color: '#92400e', textAlign: 'right' },

  // KPI strip
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: '#ffffff',
    border: `1 solid ${RULE}`,
    borderRadius: 3,
    borderLeft: `2 solid ${GOLD}`,
  },
  kpiLabel: {
    fontSize: 6.5, color: '#7c5a2b',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3,
  },
  kpiValue: { fontSize: 16, fontWeight: 'bold', color: INK, lineHeight: 1.1 },
  kpiHint: { fontSize: 6.5, color: '#92733b', marginTop: 2 },

  // Section title
  sectionTitle: {
    fontSize: 10, fontWeight: 'bold', color: SAFFRON,
    marginBottom: 6, marginTop: 4,
    borderBottom: `1 solid ${SAFFRON_LIGHT}`, paddingBottom: 3,
    textTransform: 'uppercase', letterSpacing: 1.1,
  },

  // Chart cards
  chartsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chartCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    border: `1 solid ${RULE}`,
    borderRadius: 3,
    padding: 10,
  },
  chartTitle: {
    fontSize: 8.5, fontWeight: 'bold', color: INK,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.7,
  },

  // Donut chart
  donutWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  donutSvgWrap: { width: 110, height: 110 },
  donutCenter: {
    position: 'absolute', top: 0, left: 0,
    width: 110, height: 110,
    alignItems: 'center', justifyContent: 'center',
  },
  donutCenterValue: { fontSize: 16, fontWeight: 'bold', color: INK },
  donutCenterLabel: { fontSize: 6, color: '#7c5a2b', textTransform: 'uppercase' },
  donutLegend: { flex: 1 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  donutSwatch: { width: 9, height: 9, borderRadius: 1, marginRight: 6 },
  donutLegendLabel: { flex: 1, fontSize: 7.5, color: INK },
  donutLegendValue: { fontSize: 7.5, color: '#7c5a2b', fontWeight: 'bold' },

  // Camera leaderboard
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4,
    borderBottom: `0.5 solid ${RULE}`,
  },
  topRank: { width: 14, fontSize: 8, color: '#92733b', fontWeight: 'bold' },
  topName: { flex: 1, fontSize: 8, color: INK },
  topBar: {
    width: 80, height: 6, backgroundColor: '#fef3c7',
    borderRadius: 1, marginRight: 6,
  },
  topBarFill: { height: 6, backgroundColor: GOLD, borderRadius: 1 },
  topVal: { width: 22, fontSize: 8, color: '#7c5a2b', textAlign: 'right', fontWeight: 'bold' },

  // Detection table
  table: { width: '100%', marginTop: 4 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: SAFFRON, color: 'white',
    paddingVertical: 6, paddingHorizontal: 5, fontWeight: 'bold', fontSize: 8.5,
  },
  tableRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: SAFFRON_LIGHT,
    paddingVertical: 6, paddingHorizontal: 5, fontSize: 8.5, alignItems: 'center',
  },
  tableRowEven: { backgroundColor: '#fffbeb' },
  thumb: { width: 76, height: 52, objectFit: 'cover', borderRadius: 2, backgroundColor: '#1f2937' },

  // Footer
  footer: {
    position: 'absolute', bottom: 16, left: 32, right: 32,
    fontSize: 7, color: '#92400e', textAlign: 'center',
    borderTop: `1 solid ${SAFFRON_LIGHT}`, paddingTop: 5,
  },

  // Column widths for table
  c1: { width: '4%' },
  c2: { width: '20%' },
  c3: { width: '12%' },
  c6: { width: '12%' },
  c7: { width: '24%' },
  c8: { width: '8%' },
  c9: { width: '14%' },
});

interface Timeline {
  hourly: number[];                                                       // length 24
  byCamera: { deviceId: string; deviceName: string; count: number }[];    // sorted desc
  totalDetections: number;
  uniquePlates: number;
  watchlistHits: number;
}

interface Props {
  vehicles: Vehicle[];
  /** Hourly + per-camera + KPI rollups from /api/vehicles/stats/timeline.
   *  Server-computed off vehicle_detections so we get true per-detection
   *  hour buckets (vs. only one per vehicle from lastSeen). */
  timeline?: Timeline;
  reportTitle: string;
  generatedAt: string;
  fromDate?: string;
  toDate?: string;
  /** Window bounds — used to highlight only the actually-reported hours
   *  in the bar chart, not a hardcoded range. */
  startIso?: string;
  endIso?: string;
  imageMap?: Map<string, string>;
}

const fmt = (d: string) =>
  d ? new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : 'N/A';

// Donut SVG built from value list. Returns paths + center text wrap.
function Donut({ values, total, centerValue, centerLabel }: {
  values: { label: string; n: number; color: string }[];
  total: number;
  centerValue: string;
  centerLabel: string;
}) {
  const cx = 55, cy = 55, rOuter = 50, rInner = 32;
  let acc = 0;
  const slices = values.map((v) => {
    const startAng = (acc / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
    acc += v.n;
    const endAng = (acc / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
    const large = endAng - startAng > Math.PI ? 1 : 0;
    const sx1 = cx + rOuter * Math.cos(startAng), sy1 = cy + rOuter * Math.sin(startAng);
    const sx2 = cx + rOuter * Math.cos(endAng),   sy2 = cy + rOuter * Math.sin(endAng);
    const ex1 = cx + rInner * Math.cos(endAng),   ey1 = cy + rInner * Math.sin(endAng);
    const ex2 = cx + rInner * Math.cos(startAng), ey2 = cy + rInner * Math.sin(startAng);
    const path = v.n > 0
      ? `M ${sx1} ${sy1} A ${rOuter} ${rOuter} 0 ${large} 1 ${sx2} ${sy2} L ${ex1} ${ey1} A ${rInner} ${rInner} 0 ${large} 0 ${ex2} ${ey2} Z`
      : null;
    return { ...v, path };
  });
  return (
    <View style={styles.donutSvgWrap}>
      <Svg width={110} height={110} viewBox="0 0 110 110">
        <G>
          {slices.map((s, i) => (s.path ? <Path key={i} d={s.path} fill={s.color} /> : null))}
          <Circle cx={cx} cy={cy} r={rInner - 1} fill="#ffffff" />
        </G>
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutCenterValue}>{centerValue}</Text>
        <Text style={styles.donutCenterLabel}>{centerLabel}</Text>
      </View>
    </View>
  );
}

// Hourly bar chart. 24 bars; the in-window hours are emphasised (deep
// gold), out-of-window bars are muted. Window bounds derived from props
// — nothing hardcoded. Hour labels rendered below as Text (Svg <Text>
// is unreliable in @react-pdf, so we put React-PDF Text in a sibling row).
function HourlyBars({
  buckets, peak, windowStartHr, windowEndHr,
}: {
  buckets: number[];
  peak: number;
  windowStartHr: number | null;
  windowEndHr: number | null;
}) {
  const W = 280, H = 90;
  const padL = 8, padR = 6, padT = 6, padB = 2;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / 24;
  const barW = Math.max(2.5, slot * 0.6);
  const inWindow = (h: number) => {
    if (windowStartHr == null || windowEndHr == null) return true;
    return h >= windowStartHr && h <= windowEndHr;
  };
  // Show every 3rd hour as a label so 8 labels fit cleanly.
  const labelHours = [0, 3, 6, 9, 12, 15, 18, 21, 23];
  return (
    <View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH}
              stroke={RULE} strokeWidth={0.5} />
        {buckets.map((v, h) => {
          const ratio = peak > 0 ? v / peak : 0;
          const bh = Math.max(0, ratio * innerH);
          const x = padL + h * slot + (slot - barW) / 2;
          const y = padT + innerH - bh;
          const fill = inWindow(h) ? GOLD : '#fcd9a4';
          return (
            <G key={h}>
              <Rect x={x} y={padT + innerH - 0.7} width={barW} height={0.7} fill={RULE} />
              {bh > 0 && <Rect x={x} y={y} width={barW} height={bh} fill={fill} />}
            </G>
          );
        })}
      </Svg>
      {/* Hour-axis labels — Text inside a positioned row aligned to the SVG width. */}
      <View style={{ flexDirection: 'row', width: W, marginTop: 1, paddingLeft: padL, paddingRight: padR }}>
        {Array.from({ length: 24 }).map((_, h) => {
          const show = labelHours.includes(h);
          return (
            <View key={h} style={{ width: slot, alignItems: 'center' }}>
              <Text style={{ fontSize: 5.5, color: '#7c5a2b' }}>
                {show ? `${String(h).padStart(2, '0')}:00` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function ANPRReportPDF({
  vehicles, timeline, reportTitle, generatedAt,
  fromDate, toDate, startIso, endIso, imageMap,
}: Props) {
  const src = (u?: string | null) => (u ? (imageMap?.get(u) || u) : undefined);

  // ── Window bounds (IST hours), derived from props — no hardcoding.
  const istHourOf = (iso?: string): number | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() + 5.5 * 3_600_000).getUTCHours();
  };
  const windowStartHr = istHourOf(startIso);
  const windowEndHr = istHourOf(endIso);
  const chartTitle = (windowStartHr != null && windowEndHr != null)
    ? `Hourly Traffic (${String(windowStartHr).padStart(2, '0')}:00 — ${String(windowEndHr).padStart(2, '0')}:00)`
    : 'Hourly Traffic';

  // ── KPIs (prefer server-computed timeline numbers — they count every
  //    detection, not just one per vehicle).
  const totalVehicles = vehicles.length;
  const totalDetections = timeline?.totalDetections
    ?? vehicles.reduce((s, v) => s + (v.detectionCount || 0), 0);
  const watchlisted = timeline?.watchlistHits
    ?? vehicles.filter((v) => v.isWatchlisted).length;
  const avgPerVehicle = totalVehicles ? Math.round(totalDetections / totalVehicles) : 0;

  // By type (from vehicle list — type doesn't change with time).
  const typeCounts: Record<string, number> = {};
  vehicles.forEach((v) => {
    typeCounts[v.vehicleType || 'UNKNOWN'] = (typeCounts[v.vehicleType || 'UNKNOWN'] || 0) + 1;
  });
  const typeEntries = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, n], i) => ({ label, n, color: PALETTE[i % PALETTE.length] }));

  // By camera — use server-resolved names, not raw IDs.
  const topCameras: { name: string; n: number }[] = (timeline?.byCamera ?? [])
    .slice(0, 5)
    .map((c) => ({ name: c.deviceName || c.deviceId, n: c.count }));
  const topCameraMax = topCameras[0]?.n || 1;

  // Hourly distribution — true per-detection counts from timeline.
  const hourly = timeline?.hourly && timeline.hourly.length === 24
    ? timeline.hourly
    : (() => {
        // Fallback: bucket from vehicle.lastSeen (one per vehicle).
        const arr = new Array(24).fill(0);
        vehicles.forEach((v) => {
          if (!v.lastSeen) return;
          const d = new Date(v.lastSeen);
          if (isNaN(d.getTime())) return;
          const ist = new Date(d.getTime() + 5.5 * 3_600_000);
          arr[ist.getUTCHours()]++;
        });
        return arr;
      })();
  const peakHourValue = Math.max(...hourly);
  const peakHour = hourly.indexOf(peakHourValue);
  const peakLabel = peakHourValue > 0
    ? `${String(peakHour).padStart(2, '0')}:00 — ${peakHourValue} detections`
    : 'No traffic';

  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.headerBand}>
          <Image src="/sringeri-emblem.png" style={styles.headerEmblem} />
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerEyebrow}>SRI SRINGERI SHARADA PEETHAM</Text>
            <Text style={styles.headerTitle}>ANPR — Vehicle Detection Report</Text>
            <Text style={styles.headerSubtitle}>{reportTitle}</Text>
          </View>
          <View>
            <Text style={styles.headerMeta}>Generated</Text>
            <Text style={styles.headerMeta}>{generatedAt}</Text>
            {(fromDate || toDate) && (
              <Text style={styles.headerMeta}>{fromDate || 'All time'} → {toDate || 'Now'}</Text>
            )}
          </View>
        </View>

        {/* ── KPI strip ─────────────────────────────────────── */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Vehicles</Text>
            <Text style={styles.kpiValue}>{totalVehicles}</Text>
            <Text style={styles.kpiHint}>unique plates / records</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Detections</Text>
            <Text style={styles.kpiValue}>{totalDetections}</Text>
            <Text style={styles.kpiHint}>across all cameras</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Watchlist Hits</Text>
            <Text style={styles.kpiValue}>{watchlisted}</Text>
            <Text style={styles.kpiHint}>flagged vehicles seen</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Peak Hour</Text>
            <Text style={styles.kpiValue}>
              {peakHourValue > 0 ? `${String(peakHour).padStart(2, '0')}:00` : '—'}
            </Text>
            <Text style={styles.kpiHint}>{peakLabel}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg / Vehicle</Text>
            <Text style={styles.kpiValue}>{avgPerVehicle}</Text>
            <Text style={styles.kpiHint}>detections per plate</Text>
          </View>
        </View>

        {/* ── Charts row ────────────────────────────────────── */}
        <View style={styles.chartsRow}>
          {/* Hourly traffic */}
          <View style={[styles.chartCard, { flex: 1.4 }]}>
            <Text style={styles.chartTitle}>{chartTitle}</Text>
            <HourlyBars
              buckets={hourly}
              peak={Math.max(peakHourValue, 1)}
              windowStartHr={windowStartHr}
              windowEndHr={windowEndHr}
            />
          </View>

          {/* Vehicle type donut */}
          <View style={[styles.chartCard, { flex: 1 }]}>
            <Text style={styles.chartTitle}>Vehicle Types</Text>
            <View style={styles.donutWrap}>
              <Donut
                values={typeEntries}
                total={totalVehicles}
                centerValue={String(totalVehicles)}
                centerLabel="vehicles"
              />
              <View style={styles.donutLegend}>
                {typeEntries.slice(0, 6).map((t, i) => (
                  <View key={i} style={styles.donutLegendRow}>
                    <View style={[styles.donutSwatch, { backgroundColor: t.color }]} />
                    <Text style={styles.donutLegendLabel}>{t.label}</Text>
                    <Text style={styles.donutLegendValue}>{t.n}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Top cameras */}
          <View style={[styles.chartCard, { flex: 1 }]}>
            <Text style={styles.chartTitle}>Top Cameras</Text>
            {topCameras.length > 0 ? topCameras.map(({ name, n }, i) => (
              <View key={i} style={styles.topRow}>
                <Text style={styles.topRank}>{i + 1}</Text>
                <Text style={styles.topName}>{name}</Text>
                <View style={styles.topBar}>
                  <View style={[styles.topBarFill, { width: `${(n / topCameraMax) * 100}%` }]} />
                </View>
                <Text style={styles.topVal}>{n}</Text>
              </View>
            )) : (
              <Text style={{ fontSize: 8, color: '#92733b', marginTop: 8 }}>
                No camera attribution available.
              </Text>
            )}
          </View>
        </View>

        {/* ── Detection table ───────────────────────────────── */}
        <Text style={styles.sectionTitle}>VEHICLE RECORDS</Text>
        <View style={styles.table}>
          {/* Header repeats on each page so the table is readable
              after a page break. */}
          <View style={styles.tableHeader} fixed>
            <Text style={styles.c1}>#</Text>
            <Text style={styles.c2}>Plate</Text>
            <Text style={styles.c3}>Type</Text>
            <Text style={styles.c6}>Detections</Text>
            <Text style={styles.c7}>Last Seen</Text>
            <Text style={styles.c8}>Watch</Text>
            <Text style={styles.c9}>Image</Text>
          </View>
          {vehicles.slice(0, 120).map((v, i) => {
            const thumb =
              (v as any).thumbnailUrl ||
              v.detections?.[0]?.vehicleImageUrl ||
              v.detections?.[0]?.fullImageUrl ||
              v.detections?.[0]?.plateImageUrl ||
              null;
            const thumbSrc = src(thumb);
            // wrap={false} keeps the entire row (including its image)
            // on a single page — fixes the "image bleeds onto next
            // page" issue when a row falls right at a page boundary.
            return (
              <View
                key={v.id}
                wrap={false}
                style={[styles.tableRow, i % 2 === 0 ? styles.tableRowEven : {}]}
              >
                <Text style={styles.c1}>{i + 1}</Text>
                <Text style={styles.c2}>{v.plateNumber || 'UNKNOWN'}</Text>
                <Text style={styles.c3}>{v.vehicleType}</Text>
                <Text style={styles.c6}>{v.detectionCount}</Text>
                <Text style={styles.c7}>{fmt(v.lastSeen)}</Text>
                <Text style={styles.c8}>{v.isWatchlisted ? 'YES' : '—'}</Text>
                <View style={styles.c9}>
                  {thumbSrc ? <Image src={thumbSrc} style={styles.thumb} /> : <View style={styles.thumb} />}
                </View>
              </View>
            );
          })}
        </View>
        {vehicles.length > 120 && (
          <Text style={{ marginTop: 6, fontSize: 7, color: '#9ca3af' }}>
            Showing first 120 of {vehicles.length} records.
          </Text>
        )}

        <View style={styles.footer} fixed>
          <Text>IRIS · Sri Sringeri Sharada Peetham · ANPR Vehicle Report</Text>
        </View>
      </Page>
    </Document>
  );
}
