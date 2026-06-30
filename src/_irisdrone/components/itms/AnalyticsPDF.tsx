import { Document, Page, Text, View, Image, Svg, Path, StyleSheet } from '@react-pdf/renderer';
import type { ViolationStats, VCCStats, VCCDeviceStats } from '@irisdrone/lib/api';

interface AnalyticsPDFProps {
  cameraName: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  violationStats: ViolationStats | null;
  vccStats: VCCStats | VCCDeviceStats | null;
  avgPerDay: number;
  avgPerDayLabel?: string;
  deviceNames?: Record<string, string>;
}

// react-pdf needs absolute URLs for Image — relative paths silently fail.
const assetOrigin = typeof window !== 'undefined' ? window.location.origin : '';

// Brand palette — distinct hues so the pie reads at a glance instead of
// looking like a single navy gradient. Ordered to maximise visual
// separation between adjacent slices.
const PALETTE = [
  '#0F4C75', // navy
  '#E08A1E', // amber
  '#1E8B5E', // emerald
  '#D63E3E', // crimson
  '#7A4FD1', // purple
  '#11A3A3', // teal
  '#3DA5D9', // sky
  '#E45D9F', // pink
  '#8B5A2B', // brown
  '#4B5563', // slate
];

const STATUS = {
  PENDING:  { color: '#E08A1E', label: 'Pending' },
  APPROVED: { color: '#1E8B5E', label: 'Approved' },
  REJECTED: { color: '#D63E3E', label: 'Rejected' },
  FINED:    { color: '#0F4C75', label: 'Fined' },
};

const styles = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 36, paddingHorizontal: 28, fontSize: 9, fontFamily: 'Helvetica', color: '#1a202c' },

  // ── Header band ─────────────────────────────────────────────
  headerBand: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0F4C75',
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 4,
  },
  headerLogo: { width: 44, height: 44, marginRight: 12 },
  headerTextBlock: { flexGrow: 1 },
  headerOrg:   { color: '#fff', fontSize: 13, fontWeight: 'bold', letterSpacing: 0.3 },
  headerSub:   { color: '#cfe4f5', fontSize: 8.5, marginTop: 1, letterSpacing: 0.5 },
  headerKicker:{ color: '#a8d4ef', fontSize: 7.5, marginTop: 4, letterSpacing: 1.2 },
  headerRight: { alignItems: 'flex-end' },
  headerLabel: { color: '#a8d4ef', fontSize: 7, letterSpacing: 0.8 },
  headerValue: { color: '#fff', fontSize: 9, fontWeight: 'bold' },

  // ── Sub-bar (period + coverage) ────────────────────────────
  subBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#f4f7fb',
    paddingVertical: 5, paddingHorizontal: 14,
    borderRadius: 3,
    marginBottom: 10,
  },
  subItem: { flexDirection: 'row', alignItems: 'baseline' },
  subKey: { fontSize: 7.5, color: '#5a6b7a', letterSpacing: 0.6, marginRight: 5 },
  subVal: { fontSize: 9, color: '#0F4C75', fontWeight: 'bold' },

  // ── KPI strip ──────────────────────────────────────────────
  kpiStrip: { flexDirection: 'row', gap: 6, marginBottom: 13 },
  kpi: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 4, borderTop: '3 solid #0F4C75', backgroundColor: '#fafbfd' },
  kpiLabel: { fontSize: 7, color: '#6b7a89', letterSpacing: 0.8, marginBottom: 3 },
  kpiValue: { fontSize: 17, fontWeight: 'bold', color: '#0F4C75' },
  kpiSub:   { fontSize: 7, color: '#8c98a4', marginTop: 1 },

  // ── Section frame ──────────────────────────────────────────
  section: { marginBottom: 13 },
  sectionTitle: {
    fontSize: 9, fontWeight: 'bold', color: '#0F4C75',
    letterSpacing: 1.2,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: '1.5 solid #0F4C75',
  },

  // ── Pie + legend two-column ───────────────────────────────
  twoCol: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  pieBox: { width: 130, alignItems: 'center', justifyContent: 'center' },
  legendBox: { flexGrow: 1 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendSwatch: { width: 9, height: 9, borderRadius: 2, marginRight: 6 },
  legendName: { flexGrow: 1, fontSize: 8.5, color: '#2d3748' },
  legendCount:{ fontSize: 8.5, color: '#0F4C75', fontWeight: 'bold', marginLeft: 4, minWidth: 28, textAlign: 'right' },
  legendPct:  { fontSize: 7.5, color: '#6b7a89', marginLeft: 5, minWidth: 32, textAlign: 'right' },

  // ── Status grid (replaces old plain boxes) ────────────────
  statusGrid: { flexDirection: 'row', gap: 6 },
  statusCard: { flex: 1, borderRadius: 4, padding: 10, backgroundColor: '#fafbfd', borderLeft: '4 solid #0F4C75' },
  statusLabel: { fontSize: 7.5, color: '#5a6b7a', letterSpacing: 0.7 },
  // Big number + % on the same row so the eye reads "8 (0.2%)" instead
  // of stacking three lines.
  statusValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  statusValue: { fontSize: 20, fontWeight: 'bold' },
  statusPct:   { fontSize: 8, color: '#8c98a4', marginLeft: 5 },

  // ── Horizontal bar table rows ─────────────────────────────
  tableHead: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#0F4C75', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  th:  { color: '#fff', fontSize: 7.5, fontWeight: 'bold', letterSpacing: 0.6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderBottom: '0.5 solid #e8edf2' },
  tableRowAlt: { backgroundColor: '#fbfcfd' },
  td: { fontSize: 8.3, color: '#2d3748' },

  barTrack: { height: 7, backgroundColor: '#eef1f5', borderRadius: 2, marginHorizontal: 6, flexGrow: 1 },
  barFill: { height: 7, borderRadius: 2 },

  col30: { width: '30%' },
  col35: { width: '35%' },
  col15r: { width: '15%', textAlign: 'right' },
  col20r: { width: '20%', textAlign: 'right' },
  col25r: { width: '25%', textAlign: 'right' },

  // ── Footer ─────────────────────────────────────────────────
  footer: {
    position: 'absolute', bottom: 16, left: 28, right: 28,
    paddingTop: 6, borderTop: '0.5 solid #cfd6df',
    fontSize: 7.5, color: '#6b7a89', letterSpacing: 0.5,
  },
});

// ── SVG pie geometry ────────────────────────────────────────
// Builds the SVG arc-path "M cx,cy L sx,sy A r,r 0 large,1 ex,ey Z" for a
// single slice. r=40 inside the 100×100 viewBox keeps a small margin so
// the strokes/labels never clip.
function piePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const a0 = ((startAngle - 90) * Math.PI) / 180;
  const a1 = ((endAngle   - 90) * Math.PI) / 180;
  const sx = cx + r * Math.cos(a0);
  const sy = cy + r * Math.sin(a0);
  const ex = cx + r * Math.cos(a1);
  const ey = cy + r * Math.sin(a1);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx},${cy} L ${sx},${sy} A ${r},${r} 0 ${large},1 ${ex},${ey} Z`;
}

interface PieDatum { name: string; value: number; color: string }

function PieChart({ data, size = 150 }: { data: PieDatum[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const cx = 50, cy = 50, r = 40;
  let cursor = 0;
  const slices = data.map((d) => {
    const startAngle = (cursor / total) * 360;
    cursor += d.value;
    const endAngle = (cursor / total) * 360;
    // Edge case: a single 100% slice can't be drawn as one arc; emit a circle path.
    if (data.length === 1 || d.value === total) {
      return { d, path: `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0` };
    }
    return { d, path: piePath(cx, cy, r, startAngle, endAngle) };
  });
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {slices.map((s, i) => (
        <Path key={i} d={s.path} fill={s.d.color} />
      ))}
      {/* Inner donut hole for a cleaner look. */}
      <Path d={`M ${cx - 16},${cy} a 16,16 0 1,0 32,0 a 16,16 0 1,0 -32,0`} fill="#ffffff" />
    </Svg>
  );
}

export function AnalyticsPDF({ cameraName, dateFrom, dateTo, generatedAt, violationStats, vccStats, avgPerDay, avgPerDayLabel }: AnalyticsPDFProps) {
  const violationTypes = violationStats?.byType
    ? Object.entries(violationStats.byType).sort((a, b) => b[1] - a[1])
    : [];

  // Pie payload: top 7 + "Other" bucket so the chart stays legible.
  const PIE_LIMIT = 7;
  const violationPie: PieDatum[] = (() => {
    if (!violationTypes.length) return [];
    const top = violationTypes.slice(0, PIE_LIMIT).map(([t, c], i) => ({
      name: t.replace(/_/g, ' '),
      value: c,
      color: PALETTE[i % PALETTE.length],
    }));
    if (violationTypes.length > PIE_LIMIT) {
      const rest = violationTypes.slice(PIE_LIMIT).reduce((s, [, c]) => s + c, 0);
      if (rest > 0) top.push({ name: 'Other', value: rest, color: '#94a3b8' });
    }
    return top;
  })();

  // Fined violations grouped by type — count, total fined amount,
  // amount actually collected. The SP office reads this as a revenue
  // ledger: how many notices per offence, ₹ issued, ₹ realised.
  type FinedRow = { type: string; count: number; fined: number; paid: number };
  const finedRows: FinedRow[] = (() => {
    const counts = (violationStats as any)?.byFinedType as Record<string, number> | undefined;
    const fined = (violationStats as any)?.byFinedAmount as Record<string, number> | undefined;
    const paid = (violationStats as any)?.byPaidAmount as Record<string, number> | undefined;
    if (!counts) return [];
    return Object.entries(counts)
      .filter(([, c]) => c > 0)
      .map(([type, c]) => ({
        type,
        count: c,
        fined: fined?.[type] ?? 0,
        paid: paid?.[type] ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  })();
  const finedTotal = finedRows.reduce((s, r) => s + r.count, 0);
  const finedAmountTotal = finedRows.reduce((s, r) => s + r.fined, 0);
  const paidAmountTotal = finedRows.reduce((s, r) => s + r.paid, 0);
  const fmtAmount = (n: number) =>
    n > 0 ? `Rs. ${Math.round(n).toLocaleString('en-IN')}` : '—';
  const singleCamera = cameraName !== 'All Cameras';
  const coverageLabel = singleCamera ? cameraName : 'Fleet-wide';

  const vehicleTypes = vccStats?.byVehicleType
    ? Object.entries(vccStats.byVehicleType).sort((a, b) => b[1] - a[1])
    : [];

  const totalDetections = vccStats?.totalDetections ?? 0;
  const uniqueVehicles = vccStats?.uniqueVehicles ?? 0;
  const total = violationStats?.total ?? 0;

  const violationPieTotal = violationPie.reduce((s, d) => s + d.value, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header band: emblem + organization + meta ── */}
        <View style={styles.headerBand}>
          <Image src={`${assetOrigin}/logos/belagavi-police-emblem.png`} style={styles.headerLogo} />
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerOrg}>BELAGAVI DISTRICT POLICE</Text>
            <Text style={styles.headerSub}>Enforcement Automation Centre — ITMS</Text>
            <Text style={styles.headerKicker}>TRAFFIC VIOLATIONS ANALYTICS REPORT</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>GENERATED</Text>
            <Text style={styles.headerValue}>{generatedAt}</Text>
          </View>
        </View>

        {/* Period + coverage band */}
        <View style={styles.subBar}>
          <View style={styles.subItem}>
            <Text style={styles.subKey}>REPORTING PERIOD</Text>
            <Text style={styles.subVal}>{dateFrom}  to  {dateTo}</Text>
          </View>
          <View style={styles.subItem}>
            <Text style={styles.subKey}>COVERAGE</Text>
            <Text style={styles.subVal}>{coverageLabel}</Text>
          </View>
        </View>

        {/* ── KPI strip ── */}
        <View style={styles.kpiStrip}>
          <View style={[styles.kpi, { borderTopColor: '#0F4C75' }]}>
            <Text style={styles.kpiLabel}>TOTAL VIOLATIONS</Text>
            <Text style={styles.kpiValue}>{total.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>{(violationStats?.pending ?? 0).toLocaleString()} pending</Text>
          </View>
          <View style={[styles.kpi, { borderTopColor: '#1E8B5E' }]}>
            <Text style={styles.kpiLabel}>
              {avgPerDayLabel && avgPerDayLabel.includes('hour') ? 'AVG PER HOUR' : 'AVG PER DAY'}
            </Text>
            <Text style={[styles.kpiValue, { color: '#1E8B5E' }]}>{avgPerDay.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>{avgPerDayLabel || 'across period'}</Text>
          </View>
          <View style={[styles.kpi, { borderTopColor: '#3DA5D9' }]}>
            <Text style={styles.kpiLabel}>UNIQUE VEHICLES</Text>
            <Text style={[styles.kpiValue, { color: '#3DA5D9' }]}>{uniqueVehicles.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>distinct tracked</Text>
          </View>
          <View style={[styles.kpi, { borderTopColor: '#E08A1E' }]}>
            <Text style={styles.kpiLabel}>VEHICLE DETECTIONS</Text>
            <Text style={[styles.kpiValue, { color: '#E08A1E' }]}>{totalDetections.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>raw count</Text>
          </View>
        </View>

        {/* ── Violation type distribution: pie + legend ── */}
        {violationPie.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>VIOLATION TYPE DISTRIBUTION</Text>
            <View style={styles.twoCol}>
              <View style={styles.pieBox}>
                <PieChart data={violationPie} size={140} />
              </View>
              <View style={styles.legendBox}>
                {violationPie.map((d) => {
                  const pct = violationPieTotal > 0 ? ((d.value / violationPieTotal) * 100).toFixed(1) : '0.0';
                  return (
                    <View key={d.name} style={styles.legendRow}>
                      <View style={[styles.legendSwatch, { backgroundColor: d.color }]} />
                      <Text style={styles.legendName}>{d.name}</Text>
                      <Text style={styles.legendCount}>{d.value.toLocaleString()}</Text>
                      <Text style={styles.legendPct}>{pct}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ── Status breakdown — colored cards with percentage of total ──
            Order follows the violation lifecycle (PENDING → APPROVED →
            FINED → REJECTED) so the cards read left-to-right as the
            workflow progresses, with REJECTED parked at the end as the
            terminal negative outcome. Value + percentage share a line
            so the eye doesn't have to jump down twice per card. */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>STATUS BREAKDOWN</Text>
          <View style={styles.statusGrid}>
            {([
              ['PENDING',  violationStats?.pending ?? 0],
              ['APPROVED', violationStats?.approved ?? 0],
              ['FINED',    violationStats?.fined ?? 0],
              ['REJECTED', violationStats?.rejected ?? 0],
            ] as const).map(([key, val]) => {
              const meta = STATUS[key];
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
              return (
                <View key={key} style={[styles.statusCard, { borderLeftColor: meta.color }]}>
                  <Text style={styles.statusLabel}>{key}</Text>
                  <View style={styles.statusValueRow}>
                    <Text style={[styles.statusValue, { color: meta.color }]}>{val.toLocaleString()}</Text>
                    <Text style={styles.statusPct}>· {pct}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Fined violations by type — revenue ledger ── */}
        {finedRows.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>FINED VIOLATIONS BY TYPE</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.col35]}>Violation Type</Text>
              <Text style={[styles.th, styles.col15r]}>Fined</Text>
              <Text style={[styles.th, styles.col25r]}>Fined Amount</Text>
              <Text style={[styles.th, styles.col25r]}>Paid Amount</Text>
            </View>
            {finedRows.map((r, i) => {
              const label = r.type.replace(/_/g, ' ');
              return (
                <View key={r.type} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.td, styles.col35]}>{label}</Text>
                  <Text style={[styles.td, styles.col15r]}>{r.count.toLocaleString()}</Text>
                  <Text style={[styles.td, styles.col25r]}>{fmtAmount(r.fined)}</Text>
                  <Text style={[styles.td, styles.col25r]}>{fmtAmount(r.paid)}</Text>
                </View>
              );
            })}
            <View style={[styles.tableRow, { backgroundColor: '#E8EEF2', fontWeight: 'bold' }]} wrap={false}>
              <Text style={[styles.td, styles.col35, { fontFamily: 'Helvetica-Bold' }]}>Total</Text>
              <Text style={[styles.td, styles.col15r, { fontFamily: 'Helvetica-Bold' }]}>{finedTotal.toLocaleString()}</Text>
              <Text style={[styles.td, styles.col25r, { fontFamily: 'Helvetica-Bold' }]}>{fmtAmount(finedAmountTotal)}</Text>
              <Text style={[styles.td, styles.col25r, { fontFamily: 'Helvetica-Bold' }]}>{fmtAmount(paidAmountTotal)}</Text>
            </View>
          </View>
        )}

        {/* ── Vehicle types ── */}
        {/* wrap={false} keeps the title + every row on one page so the
            section never splits in the middle. With ~5 vehicle types this
            block is short enough that pushing it whole to the next page
            is the correct trade-off vs the ugly mid-table break. */}
        {vehicleTypes.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>VEHICLE DETECTIONS BY TYPE</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.col35]}>Vehicle Type</Text>
              <Text style={[styles.th, styles.col30, { textAlign: 'center' }]}>Volume</Text>
              <Text style={[styles.th, styles.col15r]}>Detections</Text>
              <Text style={[styles.th, styles.col20r]}>% of Total</Text>
            </View>
            {vehicleTypes.map(([type, count], i) => {
              const pct = totalDetections > 0 ? ((count / totalDetections) * 100).toFixed(1) : '0.0';
              const maxCount = vehicleTypes[0][1];
              const widthPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
              const color = ['#1E8B5E', '#56B870', '#7AC78E', '#9ED7AC'][i % 4];
              return (
                <View key={type} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.td, styles.col35]}>{type}</Text>
                  <View style={[styles.col30, { paddingVertical: 2 }]}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${widthPct}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                  <Text style={[styles.td, styles.col15r]}>{count.toLocaleString()}</Text>
                  <Text style={[styles.td, styles.col20r]}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={{ width: '100%', textAlign: 'center' }}>IRIS generated report</Text>
        </View>
      </Page>
    </Document>
  );
}
