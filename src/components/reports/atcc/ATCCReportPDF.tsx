import { Document, Page, Text, View, StyleSheet, Svg, Path, Line, Circle, G, Rect } from '@react-pdf/renderer';
import { type TrafficViolation } from '@/lib/api';

interface ATCCReportPDFProps {
    violations: TrafficViolation[];
    reportTitle: string;
    generatedAt: string;
    filters?: {
        status?: string;
        violationType?: string;
        dateRange?: string;
    };
}

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
        paddingHorizontal: 30,
        backgroundColor: COLORS.WHITE,
        fontFamily: 'Helvetica',
        fontSize: 9,
    },
    coverPage: {
        backgroundColor: COLORS.NAV,
        padding: 0,
        margin: 0,
        width: '100%',
        height: '100%',
    },
    coverBgShapes: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
    },
    coverTopAccent: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: COLORS.AMBER,
        zIndex: 5,
    },
    coverBottomAccent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 5,
        backgroundColor: COLORS.BLUE,
        zIndex: 5,
    },
    coverMainFlex: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: 50,
        paddingBottom: 30,
        zIndex: 10,
    },
    coverContentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 20,
        width: '100%',
    },
    coverContent: {
        flex: 1,
    },
    coverTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    coverTitle: {
        color: COLORS.WHITE,
        fontSize: 34,
        fontWeight: 'bold',
    },
    coverDivider: {
        height: 1,
        width: 290,
        backgroundColor: COLORS.BLUE_LT, // #b45309 ish
        marginBottom: 12,
    },
    coverSubtitle: {
        color: '#fcd34d',
        fontSize: 14,
        marginBottom: 14,
    },
    coverTags: {
        color: '#94A3B8',
        fontSize: 11,
        marginBottom: 4,
    },
    coverCard: {
        backgroundColor: '#111827',
        padding: 24,
        borderRadius: 8,
        flexDirection: 'column',
        width: 320,
        borderWidth: 1,
        borderColor: '#1F2937',
        borderLeftWidth: 4,
        borderLeftColor: COLORS.AMBER,
    },
    coverCardTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    coverCardText: {
        color: COLORS.SILVER,
        fontSize: 10,
        marginBottom: 4,
    },
    coverFooterRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        width: '100%',
    },
    coverCompany: {
        color: '#94A3B8',
        fontSize: 11,
        fontWeight: 'bold',
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
        backgroundColor: COLORS.BLUE,
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
        backgroundColor: COLORS.BLUE,
    },
    pageFooterText: {
        color: COLORS.SILVER,
        fontSize: 7,
    },

    // Main Report Content Header
    header: {
        marginBottom: 20,
        marginTop: 10,
        paddingBottom: 10,
    },
    title: {
        fontSize: 24,
        marginBottom: 8,
        color: COLORS.NAV,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: 10,
        color: COLORS.MED_TXT,
        marginTop: 4,
        textAlign: 'center',
    },
    filterInfo: {
        fontSize: 8,
        marginTop: 5,
        color: COLORS.SILVER,
        textAlign: 'center',
    },

    // Section Headers
    section: {
        marginBottom: 15,
    },
    sectionTitleContainer: {
        backgroundColor: COLORS.NAV,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        height: 30,
        overflow: 'hidden',
    },
    sectionTitleAccent: {
        width: 10,
        height: '100%',
        backgroundColor: COLORS.BLUE,
    },
    sectionNumberCircle: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: COLORS.BLUE,
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
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.WHITE,
        marginLeft: 8,
        textTransform: 'uppercase',
    },

    // Stat Boxes / Summary
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    statBoxFixed: {
        padding: 12,
        backgroundColor: COLORS.VLIGHT,
        borderRadius: 6,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.BLUE,
    },
    summaryLabel: {
        fontWeight: 'bold',
        fontSize: 8,
        color: COLORS.MED_TXT,
        marginBottom: 2,
    },
    summaryValue: {
        fontSize: 9,
        color: COLORS.BLUE,
        fontWeight: 'bold',
    },

    // Tables
    table: {
        display: 'flex',
        width: '100%',
        borderWidth: 1,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderColor: COLORS.LGREY,
        marginTop: 10,
    },
    tableRow: {
        flexDirection: 'row',
        backgroundColor: COLORS.WHITE,
    },
    tableRowAlt: {
        flexDirection: 'row',
        backgroundColor: COLORS.VLIGHT,
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: COLORS.NAV,
    },
    tableCol: {
        borderWidth: 1,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderColor: COLORS.LGREY,
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    tableCell: {
        fontSize: 7,
        color: COLORS.DARK_TXT,
        textAlign: 'center',
    },
    tableCellHeader: {
        fontSize: 7,
        fontWeight: 'bold',
        color: COLORS.WHITE,
        textAlign: 'center',
    },
    col1: { width: '8%' },
    col2: { width: '15%' },
    col3: { width: '12%' },
    col4: { width: '15%' },
    col5: { width: '15%' },
    col6: { width: '12%' },
    col7: { width: '13%' },
    col8: { width: '10%' },
});

const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getViolationTypeSummary = (violations: TrafficViolation[]) => {
    const summary: Record<string, number> = {};
    violations.forEach((v) => {
        summary[v.violationType] = (summary[v.violationType] || 0) + 1;
    });
    return summary;
};

const getStatusSummary = (violations: TrafficViolation[]) => {
    const summary: Record<string, number> = {};
    violations.forEach((v) => {
        summary[v.status] = (summary[v.status] || 0) + 1;
    });
    return summary;
};

export const ATCCReportPDF = ({ violations, reportTitle, generatedAt, filters }: ATCCReportPDFProps) => {
    const typeSummary = getViolationTypeSummary(violations);
    const statusSummary = getStatusSummary(violations);

    const [mainTitle, ...rest] = (reportTitle || "ATCC Report").split(':');
    const subTitle = rest.join(':').trim() || "Violation Analysis";

    let sectionCounter = 1;

    return (
        <Document>
            {/* Cover Page */}
            <Page size="A4" style={styles.coverPage} orientation="landscape">
                <View style={styles.coverBgShapes}>
                    <Svg width="842" height="595" viewBox="0 0 842 595">
                        <Rect x="0" y="0" width="842" height="595" fill={COLORS.NAV} />
                        <Path d="M 0 327 L 842 208 L 842 357 L 0 476 Z" fill="#0D2040" />
                        <G stroke="#0D1F30" strokeWidth="0.4">
                            {Array.from({ length: 22 }).map((_, i) => (
                                <Line key={`v-${i}`} x1={i * 40} y1="0" x2={i * 40} y2="595" />
                            ))}
                            {Array.from({ length: 15 }).map((_, i) => (
                                <Line key={`h-${i}`} x1="0" y1={i * 40} x2="842" y2={i * 40} />
                            ))}
                        </G>
                        <Circle cx="715" cy="428" r="110" stroke="#b45309" strokeWidth="30" fill="transparent" />
                        <Circle cx="715" cy="428" r="70" stroke="#b45309" strokeWidth="15" fill="transparent" />
                    </Svg>
                    <View style={styles.coverTopAccent} />
                    <View style={styles.coverBottomAccent} />
                </View>
                <View style={styles.coverMainFlex}>
                    <View style={styles.coverContentRow}>
                        <View style={styles.coverContent}>
                            <View style={styles.coverTitleRow}>
                                <Text style={styles.coverTitle}>IRIS</Text>
                            </View>
                            <View style={styles.coverDivider} />
                            <Text style={styles.coverSubtitle}>Command Center</Text>
                            <Text style={styles.coverTags}>Real-time Surveillance  ·  Traffic Analytics  ·  ATCC  ·  Alert Management</Text>
                        </View>
                        <View style={styles.coverCard}>
                            <Text style={styles.coverCardTitle}>{reportTitle || "ATCC Report"}</Text>
                            <Text style={styles.coverCardText}>Report Period: {filters?.dateRange || 'All Time'}</Text>
                            <Text style={styles.coverCardText}>Generated on: {generatedAt}</Text>
                        </View>
                    </View>
                    <View style={styles.coverFooterRow}>
                        <Text style={styles.coverCompany}>Wiredleap Technologies Pvt Ltd</Text>
                    </View>
                </View>
            </Page>

            {/* Main Report Page(s) */}
            <Page size="A4" style={styles.page} orientation="landscape">
                <View style={styles.pageHeader} fixed>
                    <Text style={styles.pageHeaderTitle}>IRIS COMMAND CENTER</Text>
                    <Text style={styles.pageHeaderSubtitle}>Real-time Surveillance & Analytics</Text>
                </View>
                <View style={styles.pageHeaderAccent} fixed />

                {/* Fixed Footer */}
                <View style={styles.pageFooter} fixed>
                    <Text style={styles.pageFooterText}>© 2026 WiredLeap AI  ·  IRIS Command Center</Text>
                    <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) => `Confidential  ·  Page ${pageNumber} of ${totalPages}`} />
                </View>
                <View style={styles.pageFooterAccent} fixed />

                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>KARNATAKA STATE POLICE</Text>
                    <Text style={styles.subtitle}>Belgam District Traffic Police - ITMS</Text>
                    <Text style={styles.subtitle}>{reportTitle}</Text>
                    <Text style={styles.filterInfo}>Generated on: {generatedAt}</Text>
                    {filters && (
                        <Text style={styles.filterInfo}>
                            Filters: {filters.status ? `Status: ${filters.status}` : ''}
                            {filters.violationType ? ` | Type: ${filters.violationType}` : ''}
                            {filters.dateRange ? ` | Date: ${filters.dateRange}` : ''}
                        </Text>
                    )}
                </View>

                {/* Summary */}
                <View style={styles.section}>
                    <View style={styles.sectionTitleContainer}>
                        <View style={styles.sectionTitleAccent} />
                        <View style={styles.sectionNumberCircle}>
                            <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
                        </View>
                        <Text style={styles.sectionTitleText}>SUMMARY</Text>
                    </View>

                    <View style={styles.row}>
                        <View style={[styles.statBoxFixed, { width: '18%' }]}>
                            <Text style={styles.summaryLabel}>Total Violations:</Text>
                            <Text style={styles.summaryValue}>{violations.length}</Text>
                        </View>
                        <View style={[styles.statBoxFixed, { width: '38%' }]}>
                            <Text style={styles.summaryLabel}>By Status:</Text>
                            <Text style={styles.summaryValue}>
                                {Object.entries(statusSummary).map(([status, count]) => `${status}: ${count}`).join(' | ')}
                            </Text>
                        </View>
                        <View style={[styles.statBoxFixed, { width: '38%' }]}>
                            <Text style={styles.summaryLabel}>By Type:</Text>
                            <Text style={styles.summaryValue}>
                                {Object.entries(typeSummary).map(([type, count]) => `${type}: ${count}`).join(' | ')}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Table */}
                <View style={styles.table}>
                    {/* Table Header */}
                    <View style={styles.tableHeaderRow} fixed>
                        <View style={[styles.tableCol, styles.col1]}><Text style={styles.tableCellHeader}>S.No</Text></View>
                        <View style={[styles.tableCol, styles.col2]}><Text style={styles.tableCellHeader}>Plate Number</Text></View>
                        <View style={[styles.tableCol, styles.col3]}><Text style={styles.tableCellHeader}>Type</Text></View>
                        <View style={[styles.tableCol, styles.col4]}><Text style={styles.tableCellHeader}>Date/Time</Text></View>
                        <View style={[styles.tableCol, styles.col5]}><Text style={styles.tableCellHeader}>Location</Text></View>
                        <View style={[styles.tableCol, styles.col6]}><Text style={styles.tableCellHeader}>Speed</Text></View>
                        <View style={[styles.tableCol, styles.col7]}><Text style={styles.tableCellHeader}>Detection</Text></View>
                        <View style={[styles.tableCol, styles.col8]}><Text style={styles.tableCellHeader}>Status</Text></View>
                    </View>

                    {/* Table Rows */}
                    {violations.slice(0, 50).map((violation, index) => (
                        <View
                            key={violation.id}
                            style={[styles.tableRow, index % 2 === 0 ? styles.tableRowAlt : {}]}
                            wrap={false}
                        >
                            <View style={[styles.tableCol, styles.col1]}><Text style={styles.tableCell}>{index + 1}</Text></View>
                            <View style={[styles.tableCol, styles.col2]}><Text style={styles.tableCell}>{violation.plateNumber || 'N/A'}</Text></View>
                            <View style={[styles.tableCol, styles.col3]}><Text style={styles.tableCell}>{violation.violationType}</Text></View>
                            <View style={[styles.tableCol, styles.col4]}><Text style={styles.tableCell}>{formatDateTime(violation.timestamp)}</Text></View>
                            <View style={[styles.tableCol, styles.col5]}><Text style={styles.tableCell}>{violation.device?.name || violation.device?.id || 'N/A'}</Text></View>
                            <View style={[styles.tableCol, styles.col6]}><Text style={styles.tableCell}>
                                {violation.detectedSpeed ? `${violation.detectedSpeed.toFixed(1)} km/h` : '-'}
                            </Text></View>
                            <View style={[styles.tableCol, styles.col7]}><Text style={styles.tableCell}>{violation.detectionMethod}</Text></View>
                            <View style={[styles.tableCol, styles.col8]}><Text style={styles.tableCell}>{violation.status}</Text></View>
                        </View>
                    ))}
                </View>

                {violations.length > 50 && (
                    <Text style={{ marginTop: 10, fontSize: 8, color: COLORS.SILVER, fontStyle: 'italic', textAlign: 'center' }}>
                        Showing first 50 violations of {violations.length} total.
                    </Text>
                )}
            </Page>
        </Document>
    );
};
