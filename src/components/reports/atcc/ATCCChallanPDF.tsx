import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { type TrafficViolation } from '@/lib/api';

interface ATCCChallanPDFProps {
  violation: TrafficViolation;
}

// Fine amounts as per Karnataka Traffic Rules
const getFineAmount = (violationType: string, detectedSpeed?: number | null): number => {
  switch (violationType) {
    case 'SPEED':
      if (detectedSpeed) {
        const overLimit = detectedSpeed - 60; // Assuming 60 km/h is the base limit
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
    case 'ILLEGAL_PARKING':
      return 500;
    default:
      return 1000;
  }
};

const getViolationDescription = (violationType: string, detectedSpeed?: number | null): string => {
  switch (violationType) {
    case 'SPEED':
      return `Overspeeding - Detected Speed: ${detectedSpeed?.toFixed(1) || 'N/A'} km/h`;
    case 'HELMET':
      return 'Not wearing helmet while driving two-wheeler';
    case 'WRONG_SIDE':
      return 'Driving on wrong side of the road';
    case 'RED_LIGHT':
      return 'Jumping red light signal';
    case 'NO_SEATBELT':
      return 'Not wearing seatbelt while driving';
    case 'OVERLOADING':
      return 'Vehicle overloaded beyond permissible limit';
    case 'ILLEGAL_PARKING':
      return 'Illegal parking in no-parking zone';
    default:
      return 'Traffic rule violation';
  }
};

const COLORS = {
  NAV: '#0B1726',
  NAV_MID: '#0F2133',
  BLUE: '#d97706',
  BLUE_LT: '#f59e0b',
  AMBER: '#F59E0B',
  SILVER: '#94A3B8',
  LGREY: '#CBD5E1',
  VLIGHT: '#F1F5F9',
  WHITE: '#FFFFFF',
  DARK_TXT: '#1E293B',
  MED_TXT: '#334155',
  GREEN: '#10B981',
};

// Create styles
const styles = StyleSheet.create({
  page: {
    paddingTop: 55, // space for header
    paddingBottom: 55, // space for footer
    paddingHorizontal: 40,
    backgroundColor: COLORS.WHITE,
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  // Top Bar Header
  pageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 35,
    backgroundColor: COLORS.NAV,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 8,
  },
  pageHeaderAccent: {
    position: 'absolute',
    top: 35,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.AMBER, // use amber for challan accent
  },
  pageHeaderTitle: {
    color: COLORS.WHITE,
    fontSize: 10,
    fontWeight: 'bold',
  },
  pageHeaderSubtitle: {
    color: COLORS.SILVER,
    fontSize: 8,
  },
  // Bottom Bar Footer
  pageFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: COLORS.NAV,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 8,
  },
  pageFooterAccent: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.AMBER,
  },
  pageFooterText: {
    color: COLORS.SILVER,
    fontSize: 7,
  },

  header: {
    marginBottom: 20,
    marginTop: 10,
    paddingBottom: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
    color: COLORS.NAV,
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 3,
    color: COLORS.MED_TXT,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitleContainer: {
    backgroundColor: COLORS.NAV,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    height: 30,
    overflow: 'hidden',
  },
  sectionTitleAccent: {
    width: 10,
    height: '100%',
    backgroundColor: COLORS.AMBER,
  },
  sectionNumberCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.AMBER,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sectionNumberText: {
    color: COLORS.WHITE,
    fontSize: 10,
    fontWeight: 'bold',
  },
  sectionTitleText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.WHITE,
    marginLeft: 8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
    paddingVertical: 3,
  },
  label: {
    width: '40%',
    fontWeight: 'bold',
    color: COLORS.MED_TXT,
  },
  value: {
    width: '60%',
    color: COLORS.DARK_TXT,
  },
  violationBox: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.AMBER,
    backgroundColor: COLORS.VLIGHT,
    borderRadius: 6,
    padding: 12,
    marginTop: 5,
    marginBottom: 10,
  },
  fineBox: {
    borderLeftWidth: 6,
    borderLeftColor: COLORS.AMBER,
    borderRadius: 8,
    padding: 15,
    marginTop: 15,
    marginBottom: 15,
    backgroundColor: COLORS.NAV,
  },
  fineAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.AMBER,
    marginTop: 5,
  },
  imageContainer: {
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.LGREY,
    borderRadius: 6,
    padding: 5,
    backgroundColor: COLORS.VLIGHT,
  },
  image: {
    width: '100%',
    maxHeight: 180,
    objectFit: 'contain',
    borderRadius: 4,
  },
  note: {
    fontSize: 8,
    fontStyle: 'italic',
    marginTop: 10,
    color: COLORS.SILVER,
    textAlign: 'justify',
  },
  footer: {
    marginTop: 30,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.LGREY,
    fontSize: 8,
  },
  signature: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBox: {
    width: '45%',
    borderTopWidth: 1,
    borderTopColor: COLORS.LGREY,
    paddingTop: 5,
    textAlign: 'center',
    color: COLORS.MED_TXT,
  },
});

export const ATCCChallanPDF = ({ violation }: ATCCChallanPDFProps) => {
  const fineAmount = getFineAmount(violation.violationType, violation.detectedSpeed);
  const violationDescription = getViolationDescription(violation.violationType, violation.detectedSpeed);
  const violationIdStr = String(violation.id);
  const challanNumber = `KSP-BGM-${violationIdStr.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  const issueDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const issueTime = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const violationDate = new Date(violation.timestamp).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const violationTime = new Date(violation.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  let sectionCounter = 1;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Fixed Header */}
        <View style={styles.pageHeader} fixed>
          <Text style={styles.pageHeaderTitle}>KARNATAKA STATE POLICE</Text>
          <Text style={styles.pageHeaderSubtitle}>E-Challan System</Text>
        </View>
        <View style={styles.pageHeaderAccent} fixed />

        {/* Fixed Footer */}
        <View style={styles.pageFooter} fixed>
          <Text style={styles.pageFooterText}>System Generated Document</Text>
          <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
        <View style={styles.pageFooterAccent} fixed />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>KARNATAKA STATE POLICE</Text>
          <Text style={styles.subtitle}>Belgam District Traffic Police - ITMS</Text>
          <Text style={[styles.title, { color: COLORS.AMBER, marginTop: 5, fontSize: 16 }]}>E-CHALLAN NOTICE</Text>
        </View>

        {/* Challan Details */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Challan Number:</Text>
            <Text style={styles.value}>{challanNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Issue Date & Time:</Text>
            <Text style={styles.value}>{issueDate} at {issueTime}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Violation Date & Time:</Text>
            <Text style={styles.value}>{violationDate} at {violationTime}</Text>
          </View>
        </View>

        {/* Vehicle Details */}
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.sectionTitleAccent} />
            <View style={styles.sectionNumberCircle}>
              <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
            </View>
            <Text style={styles.sectionTitleText}>VEHICLE DETAILS</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Vehicle Registration Number:</Text>
            <Text style={styles.value}>{violation.plateNumber || 'NOT DETECTED'}</Text>
          </View>
          {violation.device && (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Location:</Text>
                <Text style={styles.value}>{violation.device.name || violation.device.id}</Text>
              </View>
              {violation.device.lat && violation.device.lng && (
                <View style={styles.row}>
                  <Text style={styles.label}>GPS Coordinates:</Text>
                  <Text style={styles.value}>
                    {violation.device.lat.toFixed(6)}, {violation.device.lng.toFixed(6)}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Violation Details */}
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.sectionTitleAccent} />
            <View style={styles.sectionNumberCircle}>
              <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
            </View>
            <Text style={styles.sectionTitleText}>VIOLATION DETAILS</Text>
          </View>
          <View style={styles.violationBox}>
            <View style={styles.row}>
              <Text style={styles.label}>Violation Type:</Text>
              <Text style={styles.value}>{violation.violationType}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Description:</Text>
              <Text style={styles.value}>{violationDescription}</Text>
            </View>
            {violation.detectedSpeed && (
              <View style={styles.row}>
                <Text style={styles.label}>Detected Speed:</Text>
                <Text style={styles.value}>{violation.detectedSpeed.toFixed(1)} km/h</Text>
              </View>
            )}
            {violation.speedLimit2W && (
              <View style={styles.row}>
                <Text style={styles.label}>Speed Limit (2W):</Text>
                <Text style={styles.value}>{violation.speedLimit2W.toFixed(0)} km/h</Text>
              </View>
            )}
            {violation.speedLimit4W && (
              <View style={styles.row}>
                <Text style={styles.label}>Speed Limit (4W):</Text>
                <Text style={styles.value}>{violation.speedLimit4W.toFixed(0)} km/h</Text>
              </View>
            )}
            <View style={styles.row}>
              <Text style={styles.label}>Detection Method:</Text>
              <Text style={styles.value}>{violation.detectionMethod}</Text>
            </View>
            {violation.confidence && (
              <View style={styles.row}>
                <Text style={styles.label}>Detection Confidence:</Text>
                <Text style={styles.value}>{(violation.confidence * 100).toFixed(1)}%</Text>
              </View>
            )}
          </View>
        </View>

        {/* Evidence Images */}
        {(violation.fullSnapshotUrl || violation.plateImageUrl) && (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionTitleAccent} />
              <View style={styles.sectionNumberCircle}>
                <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
              </View>
              <Text style={styles.sectionTitleText}>EVIDENCE</Text>
            </View>
            {violation.fullSnapshotUrl && (
              <View style={styles.imageContainer}>
                <Text style={{ marginBottom: 5, fontSize: 9 }}>Full Snapshot:</Text>
                <Image
                  src={violation.fullSnapshotUrl}
                  style={styles.image}
                  cache={false}
                />
              </View>
            )}
            {violation.plateImageUrl && (
              <View style={styles.imageContainer}>
                <Text style={{ marginBottom: 5, fontSize: 9 }}>License Plate:</Text>
                <Image
                  src={violation.plateImageUrl}
                  style={styles.image}
                  cache={false}
                />
              </View>
            )}
          </View>
        )}

        {/* Fine Amount */}
        <View style={styles.fineBox}>
          <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: 'bold', marginBottom: 5, color: COLORS.WHITE }}>
            FINE AMOUNT
          </Text>
          <Text style={styles.fineAmount}>₹ {fineAmount.toLocaleString('en-IN')}</Text>
          <Text style={{ textAlign: 'center', fontSize: 9, marginTop: 5, color: COLORS.SILVER }}>
            (Rupees {fineAmount.toLocaleString('en-IN')} Only)
          </Text>
        </View>

        {/* Payment Instructions */}
        <View style={styles.section} break>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.sectionTitleAccent} />
            <View style={styles.sectionNumberCircle}>
              <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
            </View>
            <Text style={styles.sectionTitleText}>PAYMENT INSTRUCTIONS</Text>
          </View>
          <Text style={{ marginBottom: 5 }}>
            1. Pay online at: https://ksp.gov.in/epayment
          </Text>
          <Text style={{ marginBottom: 5 }}>
            2. Use Challan Number: {challanNumber}
          </Text>
          <Text style={{ marginBottom: 5 }}>
            3. Pay within 30 days to avoid additional penalties
          </Text>
          <Text style={{ marginBottom: 5 }}>
            4. For disputes, contact: traffic.belgam@ksp.gov.in
          </Text>
        </View>

        {/* Legal Notice */}
        <View style={styles.section}>
          <Text style={styles.note}>
            This is an electronically generated challan under the Motor Vehicles Act, 1988 and
            Karnataka Motor Vehicles Rules. The violation has been recorded through automated
            traffic enforcement system. Failure to pay the fine within the specified period
            may result in additional penalties and legal action.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={{ textAlign: 'center', marginBottom: 5 }}>
            This is a system generated document. No signature required.
          </Text>
          <View style={styles.signature}>
            <View style={styles.signatureBox}>
              <Text>Issued By</Text>
              <Text>KSP Traffic Police</Text>
              <Text>Belgam District</Text>
            </View>
            <View style={styles.signatureBox}>
              <Text>System Reference</Text>
              <Text>ITMS - {violation.id}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

