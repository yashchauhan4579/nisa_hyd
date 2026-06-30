import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileDown, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { MultiCameraSelector, type CameraOption } from '@/components/nvcc/MultiCameraSelector';
import { VCCReportPDF } from '@/components/nvcc/VCCReportPDF';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { apiClient, type VCCStats, type VCCDeviceStats } from '@/lib/api';
import { format } from 'date-fns';
import { DateTimeRangeContent, type DateTimeRange } from '@/components/nvcc/DateTimeRangePicker';
import * as XLSX from 'xlsx';
import { LocationSelector } from '@/components/nvcc/LocationSelector';

interface VCCReportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cameras: CameraOption[];
    initialDateRange: { startDate: Date; endDate: Date };
    selectedCameraIds?: string[];
}

export function VCCReportModal({ open, onOpenChange, cameras, initialDateRange, selectedCameraIds: propSelectedCameraIds = [] }: VCCReportModalProps) {
    const [dateRange, setDateRange] = useState(initialDateRange);
    const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);

    // PDF-specific state
    const [stats, setStats] = useState<VCCStats | VCCDeviceStats | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfReady, setPdfReady] = useState(false);

    // Excel-specific state
    const [events, setEvents] = useState<any[]>([]);
    const [excelLoading, setExcelLoading] = useState(false);
    const [excelReady, setExcelReady] = useState(false);
    const [rowLimit, setRowLimit] = useState(30000); // Default 30k rows

    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            // Reset all states
            setPdfReady(false);
            setExcelReady(false);
            setStats(null);
            setEvents([]);
            setDateRange(initialDateRange);
            setSelectedCameraIds(propSelectedCameraIds);
            setSelectedLocations([]);
        }
    }, [open, initialDateRange, propSelectedCameraIds]);

    const locations = useMemo(() => {
        const locs = new Set<string>();
        cameras.forEach(c => {
            if (c.metadata?.location) locs.add(c.metadata.location);
        });
        return Array.from(locs).sort();
    }, [cameras]);

    const locationMatchedCameraIds = useMemo(() => {
        if (selectedLocations.length === 0) return [];
        return cameras
            .filter(c => selectedLocations.includes(c.metadata?.location || ""))
            .map(c => c.id);
    }, [cameras, selectedLocations]);

    const handleLocationChange = (locs: string[]) => {
        setSelectedLocations(locs);
        setSelectedCameraIds([]);
    };

    // Helper to aggregate stats (Duplicated from VCCDashboard mostly)
    const aggregateStats = (deviceStatsList: VCCDeviceStats[]): VCCStats => {
        if (deviceStatsList.length === 0) return {
            totalDetections: 0, uniqueVehicles: 0, byVehicleType: {}, byTime: [], byDevice: [], byHour: {}, byDayOfWeek: {},
            peakHour: 0, peakDay: 'N/A', averagePerHour: 0, classification: { withPlates: 0, withoutPlates: 0, withMakeModel: 0, plateOnly: 0, fullClassification: 0 }
        };

        const result: VCCStats = {
            totalDetections: 0, uniqueVehicles: 0, byVehicleType: {}, byTime: [], byDevice: [], byHour: {}, byDayOfWeek: {},
            peakHour: 0, peakDay: 'N/A', averagePerHour: 0, classification: { withPlates: 0, withoutPlates: 0, withMakeModel: 0, plateOnly: 0, fullClassification: 0 }
        };

        deviceStatsList.forEach(ds => {
            result.totalDetections += ds.totalDetections;
            result.uniqueVehicles += ds.uniqueVehicles;
            result.averagePerHour += ds.averagePerHour;

            Object.entries(ds.byVehicleType).forEach(([type, count]) => {
                result.byVehicleType[type] = (result.byVehicleType[type] || 0) + count;
            });
            Object.entries(ds.byHour).forEach(([h, count]) => {
                result.byHour[h] = (result.byHour[h] || 0) + count;
            });
            Object.entries(ds.byDayOfWeek || {}).forEach(([day, count]) => {
                result.byDayOfWeek[day] = (result.byDayOfWeek[day] || 0) + Number(count || 0);
            });

            result.classification.withPlates += ds.classification.withPlates;
            result.classification.withoutPlates += ds.classification.withoutPlates;
            result.classification.withMakeModel += ds.classification.withMakeModel;
            result.classification.plateOnly += ds.classification.plateOnly;
            result.classification.fullClassification += ds.classification.fullClassification;

            // Add to byDevice list
            result.byDevice.push({
                deviceId: ds.deviceId,
                deviceName: ds.deviceName,
                totalDetections: ds.totalDetections,
                byType: ds.byVehicleType
            });
        });

        // Time logic (simplified for modal: we don't display charts here yet, but PDF might use it)
        const timeMap: Record<string, any> = {};
        deviceStatsList.forEach(ds => {
            ds.byTime.forEach(entry => {
                const key = entry.hour || entry.day || entry.week || entry.month || 'unknown';
                if (!timeMap[key]) {
                    timeMap[key] = { ...entry, count: 0, "2W": 0, "4W": 0, "AUTO": 0, "BUS": 0, "HMV": 0 };
                }
                timeMap[key].count += entry.count;
                timeMap[key]["2W"] = (timeMap[key]["2W"] || 0) + (entry["2W"] || 0);
                timeMap[key]["4W"] = (timeMap[key]["4W"] || 0) + (entry["4W"] || 0);
                timeMap[key]["AUTO"] = (timeMap[key]["AUTO"] || 0) + (entry["AUTO"] || 0);
                timeMap[key]["BUS"] = (timeMap[key]["BUS"] || 0) + (entry["BUS"] || 0);
                timeMap[key]["HMV"] = (timeMap[key]["HMV"] || 0) + (entry["HMV"] || 0);
            });
        });
        result.byTime = Object.values(timeMap).sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));

        let peakHour = 0;
        let peakHourCount = 0;
        Object.entries(result.byHour).forEach(([hour, count]) => {
            if (Number(count) > peakHourCount) {
                peakHour = Number(hour);
                peakHourCount = Number(count);
            }
        });
        result.peakHour = peakHour;

        let peakDay = 'N/A';
        let peakDayCount = 0;
        Object.entries(result.byDayOfWeek).forEach(([day, count]) => {
            if (Number(count) > peakDayCount) {
                peakDay = day;
                peakDayCount = Number(count);
            }
        });
        result.peakDay = peakDay;

        return result;
    };

    // Generate data for PDF report (aggregated stats)
    const handleGeneratePDF = async () => {
        try {
            setPdfLoading(true);
            setPdfReady(false);

            let finalStart = dateRange.startDate;
            let finalEnd = dateRange.endDate;
            if (finalStart > finalEnd) [finalStart, finalEnd] = [finalEnd, finalStart];

            if (selectedCameraIds.length === 1) {
                const deviceStats = await apiClient.getVCCByDevice(selectedCameraIds[0], {
                    startTime: finalStart.toISOString(),
                    endTime: finalEnd.toISOString(),
                    groupBy: 'hour',
                });
                setStats(deviceStats);
            } else {
                const params: any = {
                    startTime: finalStart.toISOString(),
                    endTime: finalEnd.toISOString(),
                    groupBy: 'hour',
                    devicePrefix: 'NORMAL_VCC',
                };

                if (selectedCameraIds.length > 1) {
                    const results = await Promise.all(
                        selectedCameraIds.map((id) =>
                            apiClient.getVCCByDevice(id, {
                                startTime: finalStart.toISOString(),
                                endTime: finalEnd.toISOString(),
                                groupBy: 'hour',
                            })
                        )
                    );
                    setStats(aggregateStats(results));
                } else if (selectedLocations.length === 1) {
                    const statsData = await apiClient.getVCCStats({
                        startTime: finalStart.toISOString(),
                        endTime: finalEnd.toISOString(),
                        groupBy: 'hour',
                        location: selectedLocations[0],
                        devicePrefix: 'NORMAL_VCC',
                    });
                    setStats(statsData);
                } else if (selectedLocations.length > 1 && locationMatchedCameraIds.length > 0) {
                    const results = await Promise.all(
                        locationMatchedCameraIds.map((id) =>
                            apiClient.getVCCByDevice(id, {
                                startTime: finalStart.toISOString(),
                                endTime: finalEnd.toISOString(),
                                groupBy: 'hour',
                            })
                        )
                    );
                    setStats(aggregateStats(results));
                } else {
                    const locationFilter = selectedLocations.length === 1 ? selectedLocations[0] : undefined;
                    if (locationFilter) {
                        params.location = locationFilter;
                    }

                    const statsData = await apiClient.getVCCStats(params);
                    setStats(statsData);
                }
            }
            setPdfReady(true);
        } catch (error) {
            console.error("Failed to generate PDF data:", error);
            alert("Failed to load PDF data.");
        } finally {
            setPdfLoading(false);
        }
    };

    // Generate data for Excel report (individual events)
    const handleGenerateExcel = async () => {
        try {
            setExcelLoading(true);
            setExcelReady(false);
            setEvents([]);

            let finalStart = dateRange.startDate;
            let finalEnd = dateRange.endDate;
            if (finalStart > finalEnd) [finalStart, finalEnd] = [finalEnd, finalStart];

            const baseParams: any = {
                startTime: finalStart.toISOString(),
                endTime: finalEnd.toISOString(),
                devicePrefix: 'NORMAL_VCC',
            };

            // Apply filters
            if (selectedCameraIds.length > 0) {
                baseParams.deviceIds = selectedCameraIds.join(',');
                delete baseParams.devicePrefix; // specific cameras override prefix
            } else if (locationMatchedCameraIds.length > 0) {
                baseParams.deviceIds = locationMatchedCameraIds.join(',');
                delete baseParams.devicePrefix;
            }

            // Paginated fetch: keep fetching until we have all events (up to rowLimit)
            const BATCH = 10000;
            const firstPage = await apiClient.getVCCEvents({ ...baseParams, limit: BATCH, offset: 0 });
            let allEvents = firstPage.events || [];
            const total = Math.min(firstPage.total || 0, rowLimit);

            while (allEvents.length < total) {
                const nextPage = await apiClient.getVCCEvents({
                    ...baseParams,
                    limit: Math.min(BATCH, total - allEvents.length),
                    offset: allEvents.length,
                });
                const nextEvents = nextPage.events || [];
                if (nextEvents.length === 0) break;
                allEvents = [...allEvents, ...nextEvents];
            }

            // Sort events by timestamp
            allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            setEvents(allEvents);
            setExcelReady(true);
        } catch (error) {
            console.error("Failed to generate Excel data:", error);
            alert("Failed to load Excel data.");
        } finally {
            setExcelLoading(false);
        }
    };

    const handleDownloadExcel = () => {
        try {
            if (!events || events.length === 0) {
                alert("No events found. Please prepare Excel data first.");
                return;
            }

            console.log('=== Excel Generation Debug ===');
            console.log('Generating Excel with', events.length, 'events');
            console.log('Sample event:', JSON.stringify(events[0], null, 2));
            console.log('Selected cameras:', selectedCameraIds.length);
            console.log('Available cameras:', cameras.length);

            // Check for data quality issues
            const problemEvents = events.filter(e => !e || !e.deviceId || !e.timestamp);
            if (problemEvents.length > 0) {
                console.warn('Found', problemEvents.length, 'events with missing required fields');
                console.warn('Sample problem event:', problemEvents[0]);
            }

            // Prepare camera list
            let camerasList = 'All cameras';
            try {
                if (selectedCameraIds.length > 0 && selectedCameraIds.length < cameras.length) {
                    const selectedCameraNames = cameras
                        .filter(c => selectedCameraIds.includes(c.id))
                        .map(c => c.name.replace(/^Camera\s+/i, ""))
                        .join(', ');
                    camerasList = selectedCameraNames;
                }
                console.log('Camera list prepared:', camerasList);
            } catch (err) {
                console.error('Error preparing camera list:', err);
                camerasList = 'Error loading camera names';
            }

            // Prepare summary for the first sheet
            const summaryData = [
                { 'A': 'IRIS VCC Report - Event Details', 'B': '', 'C': '', 'D': '', 'E': '' },
                { 'A': 'Generated', 'B': format(new Date(), 'yyyy-MM-dd HH:mm:ss'), 'C': '', 'D': '', 'E': '' },
                { 'A': 'Report Period', 'B': `${format(dateRange.startDate, 'yyyy-MM-dd HH:mm')} to ${format(dateRange.endDate, 'yyyy-MM-dd HH:mm')}`, 'C': '', 'D': '', 'E': '' },
                { 'A': 'Cameras', 'B': camerasList, 'C': '', 'D': '', 'E': '' },
                { 'A': 'Total Events', 'B': events.length, 'C': '', 'D': '', 'E': '' },
                { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '' },
            ];

            // Prepare event data for Excel with error handling
            const worksheetData = events
                .filter(event => event && event.deviceId && event.timestamp) // Skip malformed events
                .map(event => {
                    try {
                        const cam = cameras.find(c => c.id === event.deviceId);
                        const location = cam?.metadata?.location || 'N/A';
                        const cameraName = (event.device?.name || event.deviceId || 'Unknown').toString().replace(/^Camera\s+/i, "");

                        return {
                            'Timestamp': format(new Date(event.timestamp), 'yyyy-MM-dd HH:mm:ss'),
                            'Camera Name': cameraName,
                            'Location': location,
                            'Vehicle Type': event.vehicleType || 'Unknown',
                            'Direction': event.direction || 'N/A',
                        };
                    } catch (err) {
                        console.error('Error processing event for Excel:', event, err);
                        return {
                            'Timestamp': 'Invalid',
                            'Camera Name': 'Error',
                            'Location': 'N/A',
                            'Vehicle Type': 'Unknown',
                            'Direction': 'N/A',
                        };
                    }
                });

            // Create workbook
            const workbook = XLSX.utils.book_new();

            console.log('Processed', worksheetData.length, 'rows for Excel');

            // Add summary + events sheet
            const combinedData = [
                ...summaryData,
                { 'A': 'Timestamp', 'B': 'Camera Name', 'C': 'Location', 'D': 'Vehicle Type', 'E': 'Direction' },
            ];

            // Add worksheet data rows one by one to avoid memory issues with large datasets
            for (const row of worksheetData) {
                if (!row) continue; // Skip null/undefined rows
                combinedData.push({
                    'A': row.Timestamp || '',
                    'B': row['Camera Name'] || '',
                    'C': row.Location || '',
                    'D': row['Vehicle Type'] || '',
                    'E': row.Direction || ''
                });
            }

            console.log('Combined data has', combinedData.length, 'total rows');

            console.log('Creating XLSX worksheet...');
            const worksheet = XLSX.utils.json_to_sheet(combinedData, { skipHeader: true });
            console.log('Worksheet created successfully');

            // Set column widths
            worksheet['!cols'] = [
                { wch: 20 },  // Timestamp
                { wch: 30 },  // Camera Name
                { wch: 20 },  // Location
                { wch: 15 },  // Vehicle Type
                { wch: 12 },  // Direction
            ];

            console.log('Appending worksheet to workbook...');
            XLSX.utils.book_append_sheet(workbook, worksheet, "VCC Events");
            console.log('Worksheet appended successfully');

            // Generate filename based on selection
            let fileName = `iris_nvcc_events_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
            console.log('Generating filename...');
            if (selectedCameraIds.length === 1) {
                const camName = cameras.find(c => c.id === selectedCameraIds[0])?.name || selectedCameraIds[0] || 'camera';
                const safeName = String(camName).replace(/^Camera\s+/i, "").replace(/\s+/g, '_');
                fileName = `iris_nvcc_events_${safeName}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
            } else if (selectedCameraIds.length > 1) {
                fileName = `iris_nvcc_events_${selectedCameraIds.length}_cameras_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
            } else if (selectedLocations.length === 1) {
                const safeName = String(selectedLocations[0] || 'location').replace(/\s+/g, '_');
                fileName = `iris_nvcc_events_${safeName}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
            }

            console.log('Final filename:', fileName);
            console.log('Writing Excel file...');
            XLSX.writeFile(workbook, fileName);
            console.log('Excel file written successfully!');
            console.log('=== Excel Generation Complete ===');

        } catch (error) {
            console.error("=== Excel Generation FAILED ===");
            console.error("Error details:", error);
            console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`Failed to generate Excel file: ${errorMessage}\n\nCheck browser console for details.`);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Generate Traffic Report</DialogTitle>
                    <DialogDescription>
                        Configure the date range and filters for your detailed report.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6 py-4">
                    <div className="space-y-5">
                        <div className="space-y-2 px-1">
                            <label className="text-sm font-medium">Location Filter</label>
                            <LocationSelector
                                locations={locations}
                                selectedLocations={selectedLocations}
                                onSelectionChange={handleLocationChange}
                                className="w-full"
                            />
                        </div>

                        <div className="space-y-2 px-1">
                            <label className="text-sm font-medium">Camera Filter</label>
                            <MultiCameraSelector
                                cameras={cameras}
                                selectedCameraIds={selectedCameraIds}
                                onSelectionChange={(ids) => {
                                    setSelectedCameraIds(ids);
                                    if (ids.length > 0) setSelectedLocations([]);
                                    setExcelReady(false);
                                    setPdfReady(false);
                                }}
                                loading={false}
                                className="w-full"
                            />
                        </div>

                        <div className="space-y-2 px-1">
                            <label className="text-sm font-medium">Maximum Rows in Report</label>
                            <select
                                value={rowLimit}
                                onChange={(e) => {
                                    setRowLimit(Number(e.target.value));
                                    setExcelReady(false);
                                    setPdfReady(false);
                                }}
                                className="w-full px-3 py-2 rounded-md border bg-background text-foreground"
                            >
                                <option value={1000}>1,000 rows</option>
                                <option value={5000}>5,000 rows</option>
                                <option value={10000}>10,000 rows</option>
                                <option value={30000}>30,000 rows</option>
                                <option value={50000}>50,000 rows</option>
                                <option value={100000}>100,000 rows (may be slow)</option>
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Select the number of event rows to include in Excel. The system will fetch and generate the exact number of rows you select, even if it takes time. Large datasets (50k-100k rows) may take 30-60 seconds to generate.
                            </p>
                        </div>
                    </div>

                    <div className="border rounded-md bg-muted/10 overflow-hidden">
                        <DateTimeRangeContent
                            value={dateRange}
                            onChange={(r) => {
                                setDateRange(r);
                                setExcelReady(false);
                                setPdfReady(false);
                            }}
                            showFooter={false}
                        />
                    </div>
                </div>

                <DialogFooter className="flex-col gap-4">
                    {/* Excel Report Section */}
                    <div className="flex flex-col gap-2 p-3 border rounded-md bg-muted/5">
                        <div className="text-sm font-medium text-muted-foreground">Excel Report (Detailed Events)</div>
                        <div className="flex gap-2">
                            {!excelReady ? (
                                <Button onClick={handleGenerateExcel} disabled={excelLoading} className="flex-1">
                                    {excelLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                    {excelLoading ? 'Loading Events...' : 'Prepare Excel Data'}
                                </Button>
                            ) : (
                                <>
                                    <Button variant="outline" onClick={() => setExcelReady(false)} className="flex-1">
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                        Refresh
                                    </Button>
                                    <Button onClick={handleDownloadExcel} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                                        Download Excel ({events.length.toLocaleString()} rows)
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* PDF Report Section */}
                    <div className="flex flex-col gap-2 p-3 border rounded-md bg-muted/5">
                        <div className="text-sm font-medium text-muted-foreground">PDF Report (Summary & Stats)</div>
                        <div className="flex gap-2">
                            {!pdfReady ? (
                                <Button onClick={handleGeneratePDF} disabled={pdfLoading} className="flex-1">
                                    {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                    {pdfLoading ? 'Loading Stats...' : 'Prepare PDF Data'}
                                </Button>
                            ) : (
                                <>
                                    <Button variant="outline" onClick={() => setPdfReady(false)} className="flex-1">
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                        Refresh
                                    </Button>
                                    <PDFDownloadButton
                                        stats={stats!}
                                        dateRange={dateRange}
                                        cameras={cameras}
                                        selectedCameraIds={selectedCameraIds}
                                        selectedLocation={selectedLocations.length === 1 ? selectedLocations[0] : undefined}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function PDFDownloadButton({ stats, dateRange, cameras, selectedCameraIds, selectedLocation }: {
    stats: VCCStats | VCCDeviceStats,
    dateRange: { startDate: Date, endDate: Date },
    cameras: CameraOption[],
    selectedCameraIds: string[],
    selectedLocation?: string
}) {
    const doc = useMemo(() => {
        let nameDetail = undefined;
        if (selectedCameraIds.length === 1) {
            nameDetail = cameras.find(c => c.id === selectedCameraIds[0])?.name.replace(/^Camera\s+/i, "");
        } else if (selectedCameraIds.length > 1 && selectedCameraIds.length < cameras.length) {
            const selectedNames = cameras
                .filter(c => selectedCameraIds.includes(c.id))
                .map(c => c.name.replace(/^Camera\s+/i, ""));

            if (selectedNames.length <= 4) {
                nameDetail = selectedNames.join(", ");
            } else {
                nameDetail = `${selectedNames.slice(0, 3).join(", ")} and ${selectedNames.length - 3} more`;
            }
        }

        return (
            <VCCReportPDF
                stats={stats}
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                selectedCameraName={nameDetail}
                cameras={cameras}
                selectedLocation={selectedLocation}
                hasExplicitCameraSelection={selectedCameraIds.length > 0}
                selectedCameraIds={selectedCameraIds}
            />
        );
    }, [stats, dateRange, selectedCameraIds, cameras, selectedLocation]);

    const fileName = useMemo(() => {
        const baseName = 'iris_nvcc';
        const dateStr = format(new Date(), 'yyyy-MM-dd');

        if (selectedCameraIds.length === 1) {
            const camName = cameras.find(c => c.id === selectedCameraIds[0])?.name || selectedCameraIds[0];
            const safeName = camName.replace(/^Camera\s+/i, "").replace(/\s+/g, '_');
            return `${baseName}_${safeName}_${dateStr}.pdf`;
        } else if (selectedCameraIds.length > 1) {
            return `${baseName}_mixed_${dateStr}.pdf`;
        }
        return `${baseName}_${dateStr}.pdf`;
    }, [selectedCameraIds, cameras]);

    return (
        <PDFDownloadLink
            document={doc}
            fileName={fileName}
            className="flex-1"
        >
            {({ loading: pdfGenerating }) => (
                <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" disabled={pdfGenerating}>
                    {pdfGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
                    {pdfGenerating ? 'Building PDF...' : 'Download PDF Report'}
                </Button>
            )}
        </PDFDownloadLink>
    );
}
