import { Buffer } from 'buffer';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { type TrafficViolation, type RCDetails } from '@irisdrone/lib/api';

// @react-pdf/renderer uses Node's Buffer internally; Vite dev doesn't polyfill
// Node globals by default, so we shim it here before the renderer loads it.
if (typeof (globalThis as unknown as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

// react-pdf needs absolute URLs for Font/Image assets — relative paths fail silently.
const assetOrigin = typeof window !== 'undefined' ? window.location.origin : '';

// cleanLocation turns a raw camera identifier/name into a clean, professional
// location string for the challan: drops the "Camera " prefix, the
// "CAM<N>"/"CAMERA<N>" suffix and any stray trailing index, converts
// underscores to spaces, and Title-Cases the result (preserving short
// all-caps initialisms like MK / OP / BCP). Mirrors the backend
// cleanLocationName in handlers/device_location.go.
function cleanLocation(raw: string | null | undefined): string {
  let s = (raw || '')
    .replace(/^Camera[\s_\-]+/i, '')
    .replace(/[\s_\-]*CAM(?:ERA)?[\s_\-]*\d+\s*$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = s.replace(/\s+\d{1,2}$/, '').trim();
  if (stripped.split(' ').filter(Boolean).length >= 2) s = stripped;
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase() && w !== w.toLowerCase()
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(' ');
}

// Register a Unicode-capable font so the ₹ (U+20B9) glyph renders instead of the
// tofu/"1" fallback Helvetica produces. Registered as two separate calls rather than
// the `fonts: []` shorthand — some @react-pdf/renderer versions pick the wrong variant
// from the array form, causing rendering to blow up mid-render.
// Wrapped in try/catch so a bad font file never breaks challan generation outright.
try {
  Font.register({
    family: 'NotoSans',
    src: `${assetOrigin}/fonts/NotoSans-Regular.ttf`,
  });
  Font.register({
    family: 'NotoSans',
    src: `${assetOrigin}/fonts/NotoSans-Bold.ttf`,
    fontWeight: 'bold',
  });
  // Disable the hyphenation callback — default tries to re-layout runs on every char
  // and occasionally throws with custom fonts.
  Font.registerHyphenationCallback((word) => [word]);
} catch {
  // Falls back to Helvetica — ₹ won't render but PDF will still generate.
}

interface ChallanPDFProps {
  violation: TrafficViolation;
  rcDetails?: RCDetails | null;
}

// Fine amounts as per Karnataka Motor Vehicles Act
const getFineAmount = (violationType: string, detectedSpeed?: number | null): number => {
  switch (violationType) {
    case 'SPEED':
      if (detectedSpeed) {
        const overLimit = detectedSpeed - 60;
        if (overLimit <= 10) return 500;
        if (overLimit <= 20) return 1000;
        if (overLimit <= 30) return 2000;
        return 3000;
      }
      return 2000;
    case 'HELMET':
      return 500;
    case 'WRONG_SIDE':
      return 1000;
    case 'RED_LIGHT':
      return 1000;
    case 'NO_SEATBELT':
      return 1000;
    case 'OVERLOADING':
      return 2000;
    case 'UNCOVERED_LOAD':
      return 2000;
    case 'ILLEGAL_PARKING':
      return 500;
    default:
      return 1000;
  }
};

const getViolationDescription = (violationType: string, detectedSpeed?: number | null): string => {
  switch (violationType) {
    case 'SPEED':
      return `Overspeeding — Detected Speed: ${detectedSpeed?.toFixed(1) || 'N/A'} km/h`;
    case 'HELMET':
      return 'Riding two-wheeler without helmet';
    case 'WRONG_SIDE':
      return 'Driving on wrong side of the road';
    case 'RED_LIGHT':
      return 'Jumping red signal';
    case 'NO_SEATBELT':
      return 'Driving without wearing seatbelt';
    case 'OVERLOADING':
      return 'Vehicle overloaded beyond permissible limit';
    case 'UNCOVERED_LOAD':
      return 'Vehicle carrying uncovered load';
    case 'ILLEGAL_PARKING':
      return 'Illegal parking in no-parking zone';
    default:
      return 'Traffic rule violation';
  }
};

// MV Act section references for legitimacy
const getMvActSection = (violationType: string): string => {
  switch (violationType) {
    case 'SPEED':
      return 'Sec. 112 / 183 MV Act';
    case 'HELMET':
      return 'Sec. 129 / 194D MV Act';
    case 'WRONG_SIDE':
      return 'Sec. 184 MV Act';
    case 'RED_LIGHT':
      return 'Sec. 184 MV Act';
    case 'NO_SEATBELT':
      return 'Sec. 194B MV Act';
    case 'OVERLOADING':
      return 'Sec. 194 MV Act';
    case 'UNCOVERED_LOAD':
      return 'Sec. 177 MV Act';
    case 'ILLEGAL_PARKING':
      return 'Sec. 122 / 177 MV Act';
    default:
      return 'Motor Vehicles Act, 1988';
  }
};

// Official palette — deep navy (police) + subtle neutrals. No loud colours.
const COLORS = {
  navy: '#0b2545',
  navyLight: '#13315c',
  rule: '#1a3a5f',
  text: '#111111',
  muted: '#444444',
  soft: '#f4f5f7',
  border: '#c9ced4',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingLeft: 36,
    paddingRight: 36,
    fontSize: 10,
    fontFamily: 'NotoSans',
    color: COLORS.text,
    lineHeight: 1.3,
  },
  // Header — seal stacked above centered title (classic government document layout)
  headerBar: {
    alignItems: 'center',
    paddingBottom: 6,
    borderBottom: `2 solid ${COLORS.navy}`,
  },
  logoLeft: {
    width: 48,
    height: 48,
    objectFit: 'contain',
    marginBottom: 4,
  },
  headerCenter: {
    alignItems: 'center',
  },
  govLine: {
    fontSize: 9,
    color: COLORS.muted,
    letterSpacing: 1,
  },
  departmentLine: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.navy,
    marginTop: 2,
    textAlign: 'center',
  },
  districtLine: {
    fontSize: 11,
    color: COLORS.navyLight,
    marginTop: 2,
  },
  documentTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 1,
    letterSpacing: 1,
    color: COLORS.navy,
  },
  documentSubtitle: {
    fontSize: 9,
    textAlign: 'center',
    color: COLORS.muted,
    marginBottom: 6,
  },
  // Meta strip under title — challan no, date, time
  metaStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.75 solid ${COLORS.border}`,
    borderBottom: `0.75 solid ${COLORS.border}`,
    paddingVertical: 5,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'column',
    flex: 1,
  },
  metaLabel: {
    fontSize: 7.5,
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  // Sections
  section: {
    marginBottom: 11,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: COLORS.navy,
    paddingVertical: 4,
    paddingHorizontal: 8,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  // Single-row k:v
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottom: `0.5 solid ${COLORS.border}`,
  },
  rowLast: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  label: {
    width: '38%',
    fontSize: 9,
    color: COLORS.muted,
    paddingLeft: 4,
  },
  value: {
    width: '62%',
    fontSize: 9.5,
    color: COLORS.text,
    paddingRight: 4,
  },
  // Two-column layout — two k:v pairs per row (used for vehicle details to save space)
  pairRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottom: `0.5 solid ${COLORS.border}`,
  },
  pairCell: {
    width: '50%',
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  pairLabel: {
    width: '48%',
    fontSize: 8.5,
    color: COLORS.muted,
  },
  pairValue: {
    width: '52%',
    fontSize: 9,
    color: COLORS.text,
  },
  fullRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottom: `0.5 solid ${COLORS.border}`,
    paddingHorizontal: 4,
  },
  fullLabel: {
    width: '22%',
    fontSize: 8.5,
    color: COLORS.muted,
  },
  fullValue: {
    width: '78%',
    fontSize: 9,
    color: COLORS.text,
  },
  // Violation callout
  violationCallout: {
    borderWidth: 1,
    borderColor: COLORS.navy,
    padding: 10,
    marginBottom: 10,
  },
  violationHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 6,
    borderBottom: `1 solid ${COLORS.navy}`,
    paddingBottom: 4,
  },
  // Fine panel
  finePanel: {
    marginVertical: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: COLORS.navy,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
  },
  fineLabel: {
    fontSize: 9,
    color: COLORS.muted,
    letterSpacing: 1,
    lineHeight: 1.2,
  },
  fineAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.navy,
    marginTop: 6,
    lineHeight: 1.2,
  },
  fineWords: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 6,
    lineHeight: 1.2,
  },
  // Evidence
  evidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  evidenceCell: {
    width: '49%',
    border: `0.75 solid ${COLORS.border}`,
    padding: 4,
  },
  evidenceCellFull: {
    width: '100%',
    border: `0.75 solid ${COLORS.border}`,
    padding: 4,
  },
  imageCaption: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginBottom: 3,
  },
  image: {
    width: '100%',
    height: 110,
    objectFit: 'contain',
  },
  imageLarge: {
    width: '100%',
    height: 150,
    objectFit: 'contain',
  },
  imageFull: {
    width: '100%',
    height: 200,
    objectFit: 'contain',
  },
  // Big scene snapshot that fills the remaining page-1 space (fits within page 1)
  imageSnapshotLarge: {
    width: '100%',
    height: 220,
    objectFit: 'contain',
  },
  // Centered container for the narrower plate image on page 2
  plateWrap: {
    alignItems: 'center',
  },
  // Number plate — narrower and shorter (not the full page width)
  imagePlate: {
    width: '55%',
    height: 110,
    objectFit: 'contain',
  },
  // Payment / notice — tight after title, readable gap between points
  listItem: {
    fontSize: 9.5,
    color: COLORS.text,
    lineHeight: 1.35,
    marginBottom: 5,
  },
  legalNote: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginTop: 8,
    marginBottom: 36,
    textAlign: 'justify',
    lineHeight: 1.55,
  },
  // Signature + footer
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 44,
  },
  signatureCell: {
    width: '45%',
    borderTop: `0.75 solid ${COLORS.navy}`,
    paddingTop: 4,
    alignItems: 'center',
  },
  signaturePrimary: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: COLORS.navy,
  },
  signatureSecondary: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginTop: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTop: `0.5 solid ${COLORS.border}`,
    paddingTop: 6,
    fontSize: 7.5,
    color: COLORS.muted,
    textAlign: 'center',
  },
});

// Helper that draws a row and optionally flags it as the last row (removes bottom border)
const Row = ({ label, value, last }: { label: string; value: string; last?: boolean }) => (
  <View style={last ? styles.rowLast : styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

export const ChallanPDF = ({ violation, rcDetails }: ChallanPDFProps) => {
  const fineAmount = getFineAmount(violation.violationType, violation.detectedSpeed);
  const violationDescription = getViolationDescription(violation.violationType, violation.detectedSpeed);
  const mvActSection = getMvActSection(violation.violationType);
  const violationIdStr = String(violation.id);
  const challanNumber = `KSP/BGM/${violationIdStr.slice(0, 8).toUpperCase()}/${Date.now().toString().slice(-6)}`;
  const issueDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const issueTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const violationDate = new Date(violation.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const violationTime = new Date(violation.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const fineStr = fineAmount.toLocaleString('en-IN');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header: Karnataka seal (left), dept text centered; empty spacer on right for balance */}
        <View style={styles.headerBar}>
          <Image src={`${assetOrigin}/logos/karnataka-seal.png`} style={styles.logoLeft} />
          <View style={styles.headerCenter}>
            <Text style={styles.govLine}>GOVERNMENT OF KARNATAKA</Text>
            <Text style={styles.departmentLine}>KARNATAKA STATE POLICE</Text>
            <Text style={styles.districtLine}>Belagavi District Traffic Police</Text>
          </View>
        </View>

        <Text style={styles.documentTitle}>E-CHALLAN — TRAFFIC VIOLATION NOTICE</Text>
        <Text style={styles.documentSubtitle}>Issued under the Motor Vehicles Act, 1988</Text>

        {/* Meta strip: challan no / issue / violation */}
        <View style={styles.metaStrip}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>CHALLAN NO.</Text>
            <Text style={styles.metaValue}>{challanNumber}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>ISSUED ON</Text>
            <Text style={styles.metaValue}>{issueDate} · {issueTime}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>VIOLATION ON</Text>
            <Text style={styles.metaValue}>{violationDate} · {violationTime}</Text>
          </View>
        </View>

        {/* Vehicle details — single-column rows */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>VEHICLE DETAILS</Text>
          <Row label="Registration No." value={violation.plateNumber || 'NOT DETECTED'} />
          {rcDetails?.owner_name ? <Row label="Owner Name" value={rcDetails.owner_name} /> : null}
          {rcDetails?.mobile_no ? <Row label="Mobile No." value={rcDetails.mobile_no} /> : null}
          {rcDetails?.address ? <Row label="Address" value={rcDetails.address} /> : null}
          {rcDetails?.chassis_no || rcDetails?.vehicle_chasi_number ? (
            <Row label="Chassis No." value={rcDetails.chassis_no || rcDetails.vehicle_chasi_number || ''} />
          ) : null}
          {rcDetails?.maker_model ? (
            <Row
              label="Make & Model"
              value={`${rcDetails.maker_model}${rcDetails.maker_description ? ` (${rcDetails.maker_description})` : ''}`}
            />
          ) : null}
          {rcDetails?.color ? <Row label="Colour" value={rcDetails.color} /> : null}
          {rcDetails?.body_type ? <Row label="Body Type" value={rcDetails.body_type} /> : null}
          {rcDetails?.vehicle_category_description ? (
            <Row label="Category" value={rcDetails.vehicle_category_description} />
          ) : null}
          {rcDetails?.fuel_type ? <Row label="Fuel" value={rcDetails.fuel_type} /> : null}
          {rcDetails?.registration_date ? <Row label="Registered On" value={rcDetails.registration_date} /> : null}
          {rcDetails?.rc_status ? <Row label="RC Status" value={rcDetails.rc_status} /> : null}
          {rcDetails?.fit_up_to ? <Row label="Fitness Valid Until" value={rcDetails.fit_up_to} /> : null}
          {rcDetails?.insurance_upto ? <Row label="Insurance Valid Until" value={rcDetails.insurance_upto} /> : null}
          {rcDetails?.norms_type ? <Row label="Emission Norms" value={rcDetails.norms_type} /> : null}
          {rcDetails?.financed ? <Row label="Financed" value="Yes" /> : null}
          {rcDetails?.blacklist_status ? <Row label="Blacklist Status" value={rcDetails.blacklist_status} /> : null}
          {violation.device?.name || violation.device?.id ? (
            <Row
              label="Location"
              value={cleanLocation(violation.device?.name) || cleanLocation(violation.device?.id)}
            />
          ) : null}
          {violation.device?.lat != null && violation.device?.lng != null && (violation.device.lat !== 0 || violation.device.lng !== 0) ? (
            <Row
              label="GPS Coordinates"
              value={`${violation.device.lat.toFixed(6)}, ${violation.device.lng.toFixed(6)}`}
              last
            />
          ) : null}
        </View>

        {/* Violation details */}
        <View style={styles.violationCallout}>
          <Text style={styles.violationHeader}>OFFENCE DETAILS</Text>
          <Row label="Violation Type" value={violation.violationType} />
          <Row label="Description" value={violationDescription} />
          <Row label="Legal Provision" value={mvActSection} />
          {violation.detectedSpeed != null && (
            <Row label="Detected Speed" value={`${violation.detectedSpeed.toFixed(1)} km/h`} />
          )}
          {violation.speedLimit2W != null && (
            <Row label="Speed Limit (2W)" value={`${violation.speedLimit2W.toFixed(0)} km/h`} />
          )}
          {violation.speedLimit4W != null && (
            <Row label="Speed Limit (4W)" value={`${violation.speedLimit4W.toFixed(0)} km/h`} />
          )}
          <Row label="Detection Method" value={violation.detectionMethod} />
          {violation.confidence != null && (
            <Row label="Detection Confidence" value={`${(violation.confidence * 100).toFixed(1)}%`} last />
          )}
        </View>

        {/* PAGE 1 tail — large Scene Snapshot fills remaining page-1 space */}
        {violation.fullSnapshotUrl ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionHeader}>SCENE SNAPSHOT — EVIDENCE</Text>
            <View style={styles.evidenceCellFull}>
              <Image src={violation.fullSnapshotUrl} style={styles.imageSnapshotLarge} cache={false} />
            </View>
          </View>
        ) : null}

        {/* PAGE 2 — starts with Number Plate image, then Fine panel */}
        {violation.plateImageUrl ? (
          <View style={styles.section} wrap={false} break>
            <Text style={styles.sectionHeader}>NUMBER PLATE — EVIDENCE</Text>
            <View style={styles.plateWrap}>
              <Image src={violation.plateImageUrl} style={styles.imagePlate} cache={false} />
            </View>
          </View>
        ) : null}

        {/* Fine — on page 2 (break only needed if there's no plate image above) */}
        <View style={styles.finePanel} wrap={false} break={!violation.plateImageUrl}>
          <Text style={styles.fineLabel}>FINE PAYABLE</Text>
          <Text style={styles.fineAmount}>{`\u20B9 ${fineStr}`}</Text>
          <Text style={styles.fineWords}>{`(Rupees ${fineStr} only)`}</Text>
        </View>

        {/* Payment instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PAYMENT INSTRUCTIONS</Text>
          <Text style={styles.listItem}>1. Pay online at: https://echallan.ksp.gov.in/</Text>
          <Text style={styles.listItem}>2. Quote Challan No.: {challanNumber}</Text>
          <Text style={styles.listItem}>3. Pay within 30 days from the issue date to avoid additional penalties.</Text>
          <Text style={styles.listItem}>4. Offline payment: Designated Traffic Police Station within Belagavi District.</Text>
          <Text style={styles.listItem}>5. For grievances / disputes, write to: traffic.belgam@ksp.gov.in</Text>
        </View>

        {/* Legal note + signatures kept together (flow naturally after payment) */}
        <View wrap={false}>
          <Text style={styles.legalNote}>
            This is a system-generated challan issued by the Belagavi District Traffic Police under
            the Motor Vehicles Act, 1988 and the Karnataka Motor Vehicles Rules, 1989. The offence
            has been recorded by the automated traffic enforcement system installed under the Smart
            City initiative. Failure to pay the fine within the stipulated period will attract
            additional penalties and may lead to further legal action including vehicle impounding
            and court proceedings.
          </Text>

          <View style={styles.signatureRow}>
            <View style={styles.signatureCell}>
              <Text style={styles.signaturePrimary}>Authorised Officer</Text>
              <Text style={styles.signatureSecondary}>Belagavi District Traffic Police</Text>
            </View>
            <View style={styles.signatureCell}>
              <Text style={styles.signaturePrimary}>System Reference</Text>
              <Text style={styles.signatureSecondary}>{`ITMS Ref. ${String(violation.id)}`}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          This is an electronically generated document. Signature not required.
          {'  ·  '}{challanNumber}{'  ·  '}Karnataka State Police
        </Text>
      </Page>
    </Document>
  );
};
