import { Document, Page, Text, View, StyleSheet, Svg, Path, Line, Circle, G, Rect } from '@react-pdf/renderer';
import { type VCCStats, type VCCDeviceStats } from '@/lib/api';
import { format } from 'date-fns';
import { toIST, formatUTCHourToIST } from '@/lib/dateUtils';

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
    },
    // Cover Page
    coverPage: {
        backgroundColor: COLORS.NAV,
        padding: 0,
        margin: 0,
        height: '100%',
        width: '100%',
    },
    coverPageInner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    coverOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        padding: 50,
    },
    coverHeaderBlock: {
        position: 'absolute',
        left: 50,
        right: 50,
        top: 220,
    },
    coverReportBlock: {
        position: 'absolute',
        left: 50,
        right: 120,
        top: 335,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.AMBER,
        paddingLeft: 12,
    },
    coverFooterFixed: {
        position: 'absolute',
        right: 50,
        bottom: 30,
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
    coverContent: {
        marginBottom: 40,
    },
    coverTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    coverTitle: {
        color: COLORS.WHITE,
        fontSize: 26,
        lineHeight: 1.2,
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
        marginBottom: 14,
    },
    coverMetaBlock: {
        flexDirection: 'column',
        borderLeftWidth: 4,
        borderLeftColor: COLORS.AMBER,
        paddingLeft: 12,
        marginTop: 6,
    },
    coverReportTitle: {
        color: COLORS.WHITE,
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    coverMetaText: {
        color: COLORS.SILVER,
        fontSize: 11,
        marginBottom: 6,
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
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    statBox: {
        width: '31%',
        padding: 12,
        backgroundColor: COLORS.VLIGHT,
        borderRadius: 6,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.BLUE,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 9,
        color: COLORS.MED_TXT,
        marginBottom: 4,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    statValue: {
        fontSize: 18,
        color: COLORS.BLUE,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    table: {
        display: 'flex',
        width: '100%',
        borderWidth: 1,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderColor: COLORS.LGREY,
    },
    tableRow: {
        flexDirection: 'row',
    },
    tableRowAlt: {
        backgroundColor: COLORS.VLIGHT,
    },
    tableHeader: {
        backgroundColor: COLORS.NAV,
    },
    tableCol: {
        borderWidth: 1,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderColor: COLORS.LGREY,
        justifyContent: 'center',
        paddingVertical: 6,
    },
    tableCell: {
        fontSize: 9,
        color: COLORS.DARK_TXT,
        textAlign: 'center',
        paddingHorizontal: 4,
    },
    deviceNameCell: {
        fontSize: 8,
        color: COLORS.DARK_TXT,
        textAlign: 'left',
        paddingHorizontal: 6,
    },
    tableCellHeader: {
        fontSize: 9,
        fontWeight: 'bold',
        color: COLORS.WHITE,
        textAlign: 'center',
        paddingHorizontal: 4,
    },
    chartBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    chartBarTextLeft: {
        fontSize: 8,
        color: COLORS.DARK_TXT,
        width: '25%',
    },
    chartBarTrack: {
        width: '65%',
        backgroundColor: COLORS.LGREY,
        height: 16,
        borderRadius: 2,
    },
    chartBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    chartBarTextRight: {
        fontSize: 8,
        color: COLORS.MED_TXT,
        width: '10%',
        textAlign: 'right',
    },
});

import { type CameraOption } from '@/components/tvcc/CameraSelector';

// ... (keep existing imports)

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

export function VCCReportPDF({ stats, startDate, endDate, selectedCameraName, cameras, selectedLocation, hasExplicitCameraSelection = false, selectedCameraIds = [] }: VCCReportPDFProps) {
    if (!stats) return <Document><Page><Text>No data available</Text></Page></Document>;

    const safeStats = stats as any;
    const isPerDevice = 'deviceId' in stats;
    const computedPeakDay = safeStats.peakDay || (() => {
        const byDayOfWeek = safeStats.byDayOfWeek || {};
        let peakDay = 'N/A';
        let peakCount = 0;
        Object.entries(byDayOfWeek).forEach(([day, count]) => {
            if (Number(count) > peakCount) {
                peakDay = day;
                peakCount = Number(count);
            }
        });
        return peakDay;
    })();

    const reportTitle = isPerDevice
        ? 'Traffic Analysis Report'
        : selectedLocation
            ? `Traffic Analysis Report: ${selectedLocation}`
            : 'Traffic Analysis Report';

    const [mainTitle, ...rest] = reportTitle.split(':');
    const subTitle = rest.join(':').trim() || "Violation Analysis";

    const dateRangeStr = `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
    const generatedAt = format(new Date(), 'MMM d, yyyy HH:mm');
    const reportDurationMs = Math.abs(endDate.getTime() - startDate.getTime());
    const shouldShowPeakDay = reportDurationMs >= 24 * 60 * 60 * 1000;

    const formatISTDateTime = (date: Date, includeDate = false) => {
        const istDate = toIST(date);
        const hours = String(istDate.getUTCHours()).padStart(2, '0');
        const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
        if (!includeDate) return `${hours}:${minutes}`;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[istDate.getUTCMonth()]} ${istDate.getUTCDate()} ${hours}:${minutes}`;
    };

    const formatISTBucketLabel = (utcDate: Date, includeDate = false) => {
        const endUtcDate = new Date(utcDate.getTime() + 60 * 60 * 1000);
        return `${formatISTDateTime(utcDate, includeDate)} - ${formatISTDateTime(endUtcDate, false)}`;
    };

    const formatUTCHourToISTPoint = (utcHour: number) => {
        const utcDate = new Date(Date.UTC(2026, 0, 1, utcHour, 0, 0));
        const istDate = toIST(utcDate);
        return istDate.toLocaleTimeString('en-IN', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'UTC',
        });
    };

    // Prepare table data
    // Standard types matching Dashboard (excluding TRUCK as requested)
    const displayTypes = ['2W', '4W', 'AUTO', 'BUS', 'HMV'];
    const displayTypeLabels: Record<string, string> = {
        '2W': '2W',
        '4W': '4W',
        'AUTO': 'AUTO',
        'BUS': 'BUS',
        'HMV': 'Heavy Vehicles',
    };
    const dominantVehicle = displayTypes.reduce(
        (best, type) => {
            const count = Number(safeStats.byVehicleType?.[type]) || 0;
            return count > best.count ? { type, count } : best;
        },
        { type: 'N/A', count: 0 }
    );

    const rawDevices = !isPerDevice && safeStats.byDevice ? safeStats.byDevice : [];
    const rawDeviceMap = new Map(rawDevices.map((device: any) => [device.deviceId, device]));
    const summaryDevices = hasExplicitCameraSelection
        ? selectedCameraIds.map((deviceId) => {
            const matchingCamera = cameras?.find((camera) => camera.id === deviceId);
            const existing = rawDeviceMap.get(deviceId);
            return existing || {
                deviceId,
                deviceName: matchingCamera?.name || deviceId,
                totalDetections: 0,
                byType: {},
            };
        })
        : rawDevices
            .filter((device: any) => Number(device?.totalDetections || 0) > 0)
            .sort((a: any, b: any) => Number(b?.totalDetections || 0) - Number(a?.totalDetections || 0));
    const showTopCameraChart = !hasExplicitCameraSelection && summaryDevices.length > 0;

    // Helper to get location
    const getLocation = (id: string) => {
        if (!cameras) return '';
        const cam = cameras.find(c => c.id === id);
        return cam?.metadata?.location || '';
    };

    let sectionCounter = 1;

    return (
        <Document>
            {/* Cover Page */}
            <Page size="A4" style={styles.coverPage}>
                <View style={styles.coverPageInner}>
                    <View style={styles.coverBgShapes}>
                        <Svg width="595" height="842" viewBox="0 0 595 842">
                            <Rect x="0" y="0" width="595" height="842" fill={COLORS.NAV} />
                            <Path d="M 0 463 L 595 295 L 595 505 L 0 673 Z" fill="#0D2040" />
                            <G stroke="#0D1F30" strokeWidth="0.4">
                                {Array.from({ length: 15 }).map((_, i) => (
                                    <Line key={`v - ${i} `} x1={i * 40} y1="0" x2={i * 40} y2="842" />
                                ))}
                                {Array.from({ length: 22 }).map((_, i) => (
                                    <Line key={`h - ${i} `} x1="0" y1={i * 40} x2="595" y2={i * 40} />
                                ))}
                            </G>
                            <Circle cx="505" cy="606" r="110" stroke="#b45309" strokeWidth="30" fill="transparent" />
                            <Circle cx="505" cy="606" r="70" stroke="#b45309" strokeWidth="15" fill="transparent" />
                        </Svg>
                        <View style={styles.coverTopAccent} />
                        <View style={styles.coverBottomAccent} />
                    </View>
                    <View style={styles.coverOverlay}>
                        <View style={styles.coverHeaderBlock}>
                            <View style={styles.coverTitleRow}>
                                <Text style={styles.coverTitle}>Bhubaneshwar Smartcity Limited</Text>
                            </View>
                            <View style={styles.coverDivider} />
                            <Text style={styles.coverSubtitle}>Command Center</Text>
                        </View>

                        <View style={styles.coverReportBlock}>
                            <Text style={styles.coverReportTitle}>{reportTitle}</Text>
                            {selectedCameraName && (
                                <Text style={{ color: COLORS.WHITE, fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>{selectedCameraName}</Text>
                            )}
                            <Text style={styles.coverMetaText}>Report Period: {dateRangeStr}</Text>
                            <Text style={styles.coverMetaText}>Generated on: {generatedAt}</Text>
                        </View>

                        <View style={styles.coverFooterFixed} />
                    </View>
                </View>
            </Page>

            {/* Main Report Page(s) */}
            <Page size="A4" style={styles.page}>
                {/* Fixed Header */}
                <View style={styles.pageHeader} fixed>
                    <Text style={styles.pageHeaderTitle}>ICCC</Text>
                    <Text style={styles.pageHeaderSubtitle}>Real-time Surveillance & Analytics</Text>
                </View>
                <View style={styles.pageHeaderAccent} fixed />

                {/* Fixed Footer */}
                <View style={styles.pageFooter} fixed>
                    <Text style={styles.pageFooterText}>© 2026 WiredLeap AI  ·  IRIS Command Center</Text>
                    <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>
                <View style={styles.pageFooterAccent} fixed />

                {/* Summary Stats */}
                <View style={styles.row}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Total Detections</Text>
                        <Text style={styles.statValue}>{safeStats.totalDetections.toLocaleString()}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Avg Per Minute</Text>
                        <Text style={styles.statValue}>{(safeStats.averagePerHour / 60).toFixed(1)}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Avg Per Hour</Text>
                        <Text style={styles.statValue}>{safeStats.averagePerHour.toFixed(1)}</Text>
                    </View>
                </View>

                <View style={[styles.row, { marginTop: 10, marginBottom: 20 }]}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Peak Hour</Text>
                        <Text style={styles.statValue}>{formatUTCHourToISTPoint(Number(safeStats.peakHour || 0))}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>{shouldShowPeakDay ? 'Peak Day' : 'Dominant Vehicle'}</Text>
                        <Text style={styles.statValue}>
                            {shouldShowPeakDay
                                ? computedPeakDay
                                : displayTypeLabels[dominantVehicle.type] || dominantVehicle.type}
                        </Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Total Classes</Text>
                        <Text style={styles.statValue}>{displayTypes.length}</Text>
                    </View>
                </View>

                {/* Vehicle Classification Table */}
                <View style={styles.section}>
                    <View style={styles.sectionTitleContainer}>
                        <View style={styles.sectionTitleAccent} />
                        <View style={styles.sectionNumberCircle}>
                            <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
                        </View>
                        <Text style={styles.sectionTitleText}>Vehicle Classification Breakdown</Text>
                    </View>
                    <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                            <View style={[styles.tableCol, { width: '40%' }]}><Text style={styles.tableCellHeader}>Vehicle Type</Text></View>
                            <View style={[styles.tableCol, { width: '30%' }]}><Text style={styles.tableCellHeader}>Count</Text></View>
                            <View style={[styles.tableCol, { width: '30%' }]}><Text style={styles.tableCellHeader}>Percentage</Text></View>
                        </View>
                        {displayTypes.map((type, index) => {
                            const count = Number(safeStats.byVehicleType?.[type]) || 0;
                            const percentage = safeStats.totalDetections > 0
                                ? ((count / safeStats.totalDetections) * 100).toFixed(1) + '%'
                                : '0%';

                            const displayLabel = type === 'HMV' ? 'Heavy Vehicles' : type;

                            return (
                                <View key={type} style={[styles.tableRow, index % 2 === 0 ? styles.tableRowAlt : {}]}>
                                    <View style={[styles.tableCol, { width: '40%' }]}><Text style={styles.tableCell}>{displayLabel}</Text></View>
                                    <View style={[styles.tableCol, { width: '30%' }]}><Text style={styles.tableCell}>{count.toLocaleString()}</Text></View>
                                    <View style={[styles.tableCol, { width: '30%' }]}><Text style={styles.tableCell}>{percentage}</Text></View>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* Active Devices Table (Only for All Cameras view) - Paginated */}
                {!isPerDevice && summaryDevices.length > 0 && (
                    <>
                        {/* Visual Chart - Top 10 Devices */}
                        {showTopCameraChart && (
                            <View style={styles.section} break>
                                <View style={[styles.sectionTitleContainer, { marginTop: 10 }]}>
                                    <View style={styles.sectionTitleAccent} />
                                    <View style={styles.sectionNumberCircle}>
                                        <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
                                    </View>
                                    <Text style={styles.sectionTitleText}>Active Devices Summary</Text>
                                </View>
                                <Text style={{ fontSize: 10, marginBottom: 10, textAlign: 'center', color: COLORS.MED_TXT }}>
                                    Top 10 Cameras by Traffic Volume
                                </Text>
                                {summaryDevices.slice(0, 10).map((device: any, index: number) => {
                                    const maxDetections = Math.max(...summaryDevices.slice(0, 10).map((d: any) => d.totalDetections || 0));
                                    const barWidth = maxDetections > 0 ? ((device.totalDetections || 0) / maxDetections) * 100 : 0;
                                    return (
                                        <View key={device.deviceId} style={styles.chartBarContainer}>
                                            <Text style={styles.chartBarTextLeft}>
                                                {(device.deviceName || device.deviceId).replace(/^Camera\s+/i, "").slice(0, 20)}
                                            </Text>
                                            <View style={styles.chartBarTrack}>
                                                <View style={[styles.chartBarFill, {
                                                    width: `${barWidth}% `,
                                                    backgroundColor: index < 3 ? COLORS.BLUE : COLORS.BLUE_LT
                                                }]} />
                                            </View>
                                            <Text style={styles.chartBarTextRight}>
                                                {(device.totalDetections || 0).toLocaleString()}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* Detailed Table - All Devices (will span multiple pages) */}
                        <View style={styles.section} break={showTopCameraChart}>
                            <View style={[styles.sectionTitleContainer, { marginBottom: 10 }]}>
                                <View style={styles.sectionTitleAccent} />
                                <View style={styles.sectionNumberCircle}>
                                    <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
                                </View>
                                <Text style={styles.sectionTitleText}>
                                    {hasExplicitCameraSelection ? `Selected Cameras (${summaryDevices.length})` : `All Active Devices (${summaryDevices.length})`}
                                </Text>
                            </View>
                            <View style={styles.table}>
                                {/* Header Row - Fixed for all pages */}
                                <View style={[styles.tableRow, styles.tableHeader]} fixed>
                                    <View style={[styles.tableCol, { width: '35%' }]}><Text style={styles.tableCellHeader}>Device Name</Text></View>
                                    <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCellHeader}>Location</Text></View>
                                    <View style={[styles.tableCol, { width: '10%' }]}><Text style={styles.tableCellHeader}>Total</Text></View>
                                    {displayTypes.map(type => (
                                        <View key={type} style={[styles.tableCol, { width: '7%' }]}>
                                            <Text style={styles.tableCellHeader}>{type}</Text>
                                        </View>
                                    ))}
                                </View>
                                {/* Data Rows - Allow wrapping to new pages */}
                                {summaryDevices.map((device: any, index: number) => (
                                    <View key={device.deviceId} style={[styles.tableRow, index % 2 === 0 ? styles.tableRowAlt : {}]} wrap={false}>
                                        <View style={[styles.tableCol, { width: '35%' }]}>
                                            <Text style={styles.deviceNameCell} wrap={false}>{(device.deviceName || device.deviceId).replace(/^Camera\s+/i, "")}</Text>
                                        </View>
                                        <View style={[styles.tableCol, { width: '20%' }]}>
                                            <Text style={styles.tableCell}>{getLocation(device.deviceId)}</Text>
                                        </View>
                                        <View style={[styles.tableCol, { width: '10%' }]}>
                                            <Text style={styles.tableCell}>
                                                {(device.totalDetections || 0).toLocaleString()}
                                            </Text>
                                        </View>
                                        {displayTypes.map(type => {
                                            const typeCount = device.byType ? (device.byType[type] || 0) : 0;
                                            return (
                                                <View key={type} style={[styles.tableCol, { width: '7%' }]}>
                                                    <Text style={styles.tableCell}>{Number(typeCount).toLocaleString()}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>
                        </View>
                    </>
                )}

                {/* Time Analysis Table (For both Single and Global views now) */}
                {safeStats.byTime && safeStats.byTime.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionTitleContainer} break>
                            <View style={styles.sectionTitleAccent} />
                            <View style={styles.sectionNumberCircle}>
                                <Text style={styles.sectionNumberText}>0{sectionCounter++}</Text>
                            </View>
                            <Text style={styles.sectionTitleText}>Traffic Analysis by Time</Text>
                        </View>
                        <View style={styles.table}>
                            {/* Table Header */}
                            <View style={[styles.tableRow, styles.tableHeader]} fixed>
                                <View style={[styles.tableCol, { width: '25%' }]}>
                                    <Text style={styles.tableCellHeader}>Time Interval</Text>
                                </View>
                                <View style={[styles.tableCol, { width: '15%' }]}>
                                    <Text style={styles.tableCellHeader}>Total</Text>
                                </View>
                                {displayTypes.map(type => (
                                    <View key={type} style={[styles.tableCol, { width: '12%' }]}>
                                        <Text style={styles.tableCellHeader}>{type === 'HMV' ? 'HMV/Truck' : type}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Data Rows */}
                            {safeStats.byTime.map((item: any, index: number) => {
                                // Format time label based on the data structure
                                let label = '';

                                if (item.hour) {
                                    // Hourly data - format as readable time
                                    const hourVal = item.hour;
                                    if (typeof hourVal === 'string') {
                                        const normalized = hourVal.trim().replace(' ', 'T');
                                        const utcDate = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
                                        if (!isNaN(utcDate.getTime())) {
                                            label = formatISTBucketLabel(utcDate, reportDurationMs >= 24 * 60 * 60 * 1000);
                                        } else {
                                            label = hourVal;
                                        }
                                    } else if (hourVal instanceof Date && !isNaN(hourVal.getTime())) {
                                        label = formatISTBucketLabel(hourVal, reportDurationMs >= 24 * 60 * 60 * 1000);
                                    } else {
                                        label = String(hourVal);
                                    }
                                } else if (item.day) {
                                    // Daily data
                                    label = format(new Date(item.day), 'MMM d, yyyy');
                                } else if (item.week) {
                                    label = item.week;
                                } else if (item.month) {
                                    label = format(new Date(item.month + '-01'), 'MMM yyyy');
                                } else if (item.time_period) {
                                    label = item.time_period;
                                } else {
                                    label = 'N/A';
                                }

                                return (
                                    <View key={index} style={[styles.tableRow, index % 2 === 0 ? styles.tableRowAlt : {}]} wrap={false}>
                                        <View style={[styles.tableCol, { width: '25%' }]}>
                                            <Text style={styles.tableCell}>{label}</Text>
                                        </View>
                                        <View style={[styles.tableCol, { width: '15%' }]}>
                                            <Text style={styles.tableCell}>{Number(item.count).toLocaleString()}</Text>
                                        </View>
                                        {displayTypes.map(type => {
                                            // Handle mapping: 'HMV' in display covers 'TRUCK' + 'HMV' from backend potentially?
                                            // Backend returns separate fields: 2W, 4W, AUTO, BUS, TRUCK, HMV.
                                            // Display types: 2W, 4W, AUTO, BUS, HMV.
                                            // We should combine TRUCK + HMV into HMV column for display if that's the standard.
                                            // Let's check backend response. Backend gives direct keys "2W", "4W", etc.
                                            let val = 0;
                                            if (type === 'HMV') {
                                                val = (Number(item['TRUCK']) || 0) + (Number(item['HMV']) || 0);
                                            } else {
                                                val = Number(item[type]) || 0;
                                            }

                                            return (
                                                <View key={type} style={[styles.tableCol, { width: '12%' }]}>
                                                    <Text style={styles.tableCell}>{val.toLocaleString()}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}
            </Page>
        </Document>
    );
}
