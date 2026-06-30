import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { type VCCStats, type VCCDeviceStats } from '@irisdrone/lib/api';
import { type CameraOption } from '@irisdrone/components/vcc/CameraSelector';
import { cleanDeviceName } from '@irisdrone/lib/displayName';
import { format } from 'date-fns';

interface VCCReportPDFProps {
  stats: VCCStats | VCCDeviceStats | null;
  startDate: Date;
  endDate: Date;
  selectedCameraName?: string;
  cameras?: CameraOption[];
  selectedLocation?: string;
  hasExplicitCameraSelection?: boolean;
  selectedCameraIds?: string[];
}

// Brand palette — kept for the bar tiles.
const PALETTE = [
  '#0F4C75', '#E08A1E', '#1E8B5E', '#D63E3E',
  '#7A4FD1', '#11A3A3', '#3DA5D9', '#E45D9F',
];

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28, fontSize: 9, fontFamily: 'Helvetica', color: '#1a202c' },

  headerBand: {
    backgroundColor: '#0F4C75',
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 4,
    marginBottom: 6,
  },
  headerOrg:    { color: '#fff', fontSize: 13, fontWeight: 'bold', letterSpacing: 0.3 },
  headerSub:    { color: '#cfe4f5', fontSize: 8.5, marginTop: 2, letterSpacing: 0.5 },
  headerKicker: { color: '#a8d4ef', fontSize: 7.5, marginTop: 4, letterSpacing: 1.2 },

  subBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#f4f7fb',
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 3,
    marginBottom: 12,
  },
  subItem: { flexDirection: 'row', alignItems: 'baseline' },
  subKey:  { fontSize: 7.5, color: '#5a6b7a', letterSpacing: 0.6, marginRight: 5 },
  subVal:  { fontSize: 9, color: '#0F4C75', fontWeight: 'bold' },

  kpiStrip: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  kpi: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 4, borderTop: '3 solid #0F4C75', backgroundColor: '#fafbfd' },
  kpiLabel: { fontSize: 7, color: '#6b7a89', letterSpacing: 0.8, marginBottom: 3 },
  kpiValue: { fontSize: 17, fontWeight: 'bold', color: '#0F4C75' },
  kpiSub:   { fontSize: 7, color: '#8c98a4', marginTop: 1 },

  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 9, fontWeight: 'bold', color: '#0F4C75',
    letterSpacing: 1.2,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: '1.5 solid #0F4C75',
  },

  tableHead: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#0F4C75', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  th:  { color: '#fff', fontSize: 7.5, fontWeight: 'bold', letterSpacing: 0.6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderBottom: '0.5 solid #e8edf2' },
  tableRowAlt: { backgroundColor: '#fbfcfd' },
  td: { fontSize: 8.3, color: '#2d3748' },

  barTrack: { height: 7, backgroundColor: '#eef1f5', borderRadius: 2, marginHorizontal: 6, flexGrow: 1 },
  barFill:  { height: 7, borderRadius: 2 },

  col35: { width: '35%' },
  col30: { width: '30%' },
  col15r: { width: '15%', textAlign: 'right' },
  col20r: { width: '20%', textAlign: 'right' },

  footer: {
    position: 'absolute', bottom: 18, left: 28, right: 28,
    paddingTop: 6, borderTop: '0.5 solid #cfd6df',
    fontSize: 7.5, color: '#6b7a89', letterSpacing: 0.5,
    textAlign: 'center',
  },
});

const safeFmt = (d: any): string => {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (!dt || Number.isNaN(dt.getTime())) return '—';
    return format(dt, 'dd MMM yyyy, HH:mm');
  } catch {
    return '—';
  }
};

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function VCCReportPDF({
  stats,
  startDate,
  endDate,
  selectedCameraName,
  cameras,
  selectedLocation,
  hasExplicitCameraSelection = false,
  selectedCameraIds = [],
}: VCCReportPDFProps) {
  // Bare-minimum guard so the render never throws.
  const safe: any = stats ?? {};
  const totalDetections = num(safe.totalDetections);
  const uniqueVehicles  = num(safe.uniqueVehicles);
  const averagePerHour  = num(safe.averagePerHour);
  const withPlates      = num(safe.classification?.withPlates);

  const byVehicleType: Record<string, any> = safe.byVehicleType && typeof safe.byVehicleType === 'object' ? safe.byVehicleType : {};
  const sortedTypes: [string, number][] = Object.entries(byVehicleType)
    .map(([t, v]) => [
      t === '2W' ? '2 Wheeler' : t === '4W' ? '4 Wheeler' : t,
      num(v),
    ] as [string, number])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);

  let coverageLabel = 'Fleet-wide';
  if (selectedLocation) {
    coverageLabel = selectedLocation;
  } else if (hasExplicitCameraSelection && selectedCameraIds.length === 1 && selectedCameraName) {
    coverageLabel = cleanDeviceName(selectedCameraName) || selectedCameraName;
  } else if (hasExplicitCameraSelection && selectedCameraIds.length > 1) {
    coverageLabel = `${selectedCameraIds.length} cameras`;
  }

  const byDevice: Record<string, any> = safe.byDevice && typeof safe.byDevice === 'object' ? safe.byDevice : {};
  const camById = new Map<string, string>();
  (cameras ?? []).forEach((c) => { if (c?.id) camById.set(c.id, c.name ?? c.id); });
  const grouped = new Map<string, number>();
  for (const [id, c] of Object.entries(byDevice)) {
    const label = cleanDeviceName(camById.get(id) ?? id) || id;
    grouped.set(label, (grouped.get(label) ?? 0) + num(c));
  }
  const topLocations: [string, number][] = [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const periodStr   = `${safeFmt(startDate)}  to  ${safeFmt(endDate)}`;
  const generatedAt = safeFmt(new Date());

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header band (text-only — no Image to avoid silent blanks) */}
        <View style={styles.headerBand}>
          <Text style={styles.headerOrg}>BELAGAVI DISTRICT POLICE</Text>
          <Text style={styles.headerSub}>Enforcement Automation Centre — ITMS</Text>
          <Text style={styles.headerKicker}>VEHICLE CLASSIFICATION &amp; COUNT REPORT</Text>
        </View>

        <View style={styles.subBar}>
          <View style={styles.subItem}>
            <Text style={styles.subKey}>REPORTING PERIOD</Text>
            <Text style={styles.subVal}>{periodStr}</Text>
          </View>
          <View style={styles.subItem}>
            <Text style={styles.subKey}>COVERAGE</Text>
            <Text style={styles.subVal}>{coverageLabel}</Text>
          </View>
          <View style={styles.subItem}>
            <Text style={styles.subKey}>GENERATED</Text>
            <Text style={styles.subVal}>{generatedAt}</Text>
          </View>
        </View>

        <View style={styles.kpiStrip}>
          <View style={[styles.kpi, { borderTopColor: '#0F4C75' }]}>
            <Text style={styles.kpiLabel}>TOTAL DETECTIONS</Text>
            <Text style={styles.kpiValue}>{totalDetections.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>raw count</Text>
          </View>
          <View style={[styles.kpi, { borderTopColor: '#1E8B5E' }]}>
            <Text style={styles.kpiLabel}>UNIQUE VEHICLES</Text>
            <Text style={[styles.kpiValue, { color: '#1E8B5E' }]}>{uniqueVehicles.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>{withPlates.toLocaleString()} with plate</Text>
          </View>
          <View style={[styles.kpi, { borderTopColor: '#3DA5D9' }]}>
            <Text style={styles.kpiLabel}>AVG PER HOUR</Text>
            <Text style={[styles.kpiValue, { color: '#3DA5D9' }]}>{Math.round(averagePerHour).toLocaleString()}</Text>
            <Text style={styles.kpiSub}>across period</Text>
          </View>
          <View style={[styles.kpi, { borderTopColor: '#E08A1E' }]}>
            <Text style={styles.kpiLabel}>PLATE CAPTURE RATE</Text>
            <Text style={[styles.kpiValue, { color: '#E08A1E' }]}>
              {totalDetections > 0 ? `${((withPlates / totalDetections) * 100).toFixed(1)}%` : '—'}
            </Text>
            <Text style={styles.kpiSub}>of total detections</Text>
          </View>
        </View>

        {sortedTypes.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>VEHICLE TYPE DISTRIBUTION</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.col35]}>Vehicle Type</Text>
              <Text style={[styles.th, styles.col30, { textAlign: 'center' }]}>Volume</Text>
              <Text style={[styles.th, styles.col15r]}>Detections</Text>
              <Text style={[styles.th, styles.col20r]}>% of Total</Text>
            </View>
            {sortedTypes.map(([type, count], i) => {
              const pct = totalDetections > 0 ? ((count / totalDetections) * 100).toFixed(1) : '0.0';
              const max = sortedTypes[0][1];
              const widthPct = max > 0 ? Math.round((count / max) * 100) : 0;
              const color = PALETTE[i % PALETTE.length];
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

        {topLocations.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>TOP LOCATIONS</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.col35]}>Location</Text>
              <Text style={[styles.th, styles.col30, { textAlign: 'center' }]}>Activity</Text>
              <Text style={[styles.th, styles.col15r]}>Detections</Text>
              <Text style={[styles.th, styles.col20r]}>Share</Text>
            </View>
            {topLocations.map(([label, count], i) => {
              const max = topLocations[0][1];
              const widthPct = max > 0 ? Math.round((count / max) * 100) : 0;
              const pct = totalDetections > 0 ? ((count / totalDetections) * 100).toFixed(1) : '0.0';
              return (
                <View key={label} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.td, styles.col35]}>{label}</Text>
                  <View style={[styles.col30, { paddingVertical: 2 }]}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${widthPct}%`, backgroundColor: '#0F4C75' }]} />
                    </View>
                  </View>
                  <Text style={[styles.td, styles.col15r]}>{count.toLocaleString()}</Text>
                  <Text style={[styles.td, styles.col20r]}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {sortedTypes.length === 0 && topLocations.length === 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NO DATA</Text>
            <Text style={[styles.td, { padding: 8 }]}>No VCC data available for the selected window.</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>IRIS generated report</Text>
        </View>
      </Page>
    </Document>
  );
}
