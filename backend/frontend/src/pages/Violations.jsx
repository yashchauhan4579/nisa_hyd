import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { API_URL } from '../config';
import {
    CheckCircle, XCircle, Edit2, ChevronRight,
    ShieldAlert, Save, X, Car, Filter, Calendar, Clock, IndianRupee, Download, FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Violations = () => {
    const [violations, setViolations] = useState([]);
    const [allViolations, setAllViolations] = useState([]); // For count stats
    const [fines, setFines] = useState([]); // Aggregated fines by license plate
    const [cameras, setCameras] = useState([]); // RTSP camera sources from DB
    const [selectedId, setSelectedId] = useState(null);
    const [selectedFine, setSelectedFine] = useState(null); // Selected fine entry
    const [editMode, setEditMode] = useState(false);
    const [editedPlate, setEditedPlate] = useState('');
    const [timeFilter, setTimeFilter] = useState('all');
    const [selectedCamera, setSelectedCamera] = useState('all');
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedViolationType, setSelectedViolationType] = useState('all');
    const [statusTab, setStatusTab] = useState('pending'); // 'pending', 'approved', 'fines', 'all'
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [pagination, setPagination] = useState({
        page: 1,
        page_size: 50,
        total_count: 0,
        total_pages: 1,
        has_next: false,
        has_previous: false
    });
    
    const [finesPagination, setFinesPagination] = useState({
        page: 1,
        page_size: 50,
        total_count: 0,
        total_pages: 1,
        has_next: false,
        has_previous: false
    });

    const selectedViolation = violations.find(v => v.id === selectedId);

    useEffect(() => {
        // Reset to page 1 when filters change
        setCurrentPage(1);
    }, [statusTab, timeFilter, selectedCamera, selectedDate, selectedViolationType]);

    useEffect(() => {
        if (statusTab === 'fines') {
            fetchFines();
            const interval = setInterval(fetchFines, 5000);
            return () => clearInterval(interval);
        } else {
            fetchViolations();
            fetchAllViolations(); // Fetch all for counts
            const interval = setInterval(() => {
                fetchViolations();
                fetchAllViolations();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [statusTab, timeFilter, selectedCamera, selectedDate, selectedViolationType, currentPage, pageSize]);

    useEffect(() => {
        // Auto-select first violation in current list
        if (violations.length > 0 && !violations.find(v => v.id === selectedId)) {
            setSelectedId(violations[0].id);
        }
    }, [violations]);

    useEffect(() => {
        // Fetch cameras on mount
        fetchCameras();
    }, []);

    useEffect(() => {
        if (selectedViolation) {
            setEditedPlate(selectedViolation.licensePlate);
            setEditMode(false);
        }
    }, [selectedViolation]);

    const fetchViolations = async () => {
        try {
            const params = new URLSearchParams();

            // Map status tab to API status parameter
            if (statusTab === 'pending') {
                params.append('status', 'pending');
            } else if (statusTab === 'approved') {
                params.append('status', 'verified');
            } else if (statusTab === 'rejected') {
                params.append('status', 'rejected');
            }
            // 'all' means no status filter

            // Add time filter
            if (timeFilter && timeFilter !== 'all') {
                params.append('time_filter', timeFilter);
            }

            // Add camera filter
            if (selectedCamera && selectedCamera !== 'all') {
                params.append('camera_id', selectedCamera);
            }

            // Add date filter
            if (selectedDate) {
                params.append('date', selectedDate);
            }

            // Add violation type filter
            if (selectedViolationType && selectedViolationType !== 'all') {
                params.append('violation_type', selectedViolationType);
            }

            // Add pagination parameters
            params.append('page', currentPage.toString());
            params.append('page_size', pageSize.toString());

            const response = await api.get(`/violations?${params.toString()}`);
            
            // Handle paginated response
            let violationsData = [];
            let paginationData = null;
            
            if (response.data && response.data.violations) {
                // New paginated format
                violationsData = response.data.violations;
                paginationData = response.data.pagination;
            } else if (Array.isArray(response.data)) {
                // Legacy format (fallback)
                violationsData = response.data;
                paginationData = {
                    page: 1,
                    page_size: violationsData.length,
                    total_count: violationsData.length,
                    total_pages: 1,
                    has_next: false,
                    has_previous: false
                };
            }
            
            const data = violationsData.map(v => ({
                ...v,
                snapshotUrl: `${API_URL}${v.snapshotUrl}`,
                plateImageUrl: v.plateImageUrl ? `${API_URL}${v.plateImageUrl}` : null
            }));
            setViolations(data);
            if (paginationData) {
                setPagination(paginationData);
            }
        } catch (error) {
            console.error('Error fetching violations:', error);
        }
    };

    const fetchAllViolations = async () => {
        try {
            // Fetch first page to get total count for stats
            const response = await api.get('/violations?page=1&page_size=1');
            if (response.data && response.data.pagination) {
                // Use pagination info for total count
                setAllViolations([]); // We don't need the actual data, just the count
            } else if (Array.isArray(response.data)) {
                setAllViolations(response.data);
            }
        } catch (error) {
            console.error('Error fetching all violations:', error);
        }
    };

    const fetchFines = async () => {
        try {
            const response = await api.get(`/fines?page=${currentPage}&page_size=${pageSize}`);
            
            // Handle paginated response
            let finesData = [];
            let paginationData = null;
            
            if (response.data && response.data.fines) {
                // New paginated format
                finesData = response.data.fines;
                paginationData = response.data.pagination;
            } else if (Array.isArray(response.data)) {
                // Legacy format (fallback)
                finesData = response.data;
                paginationData = {
                    page: 1,
                    page_size: finesData.length,
                    total_count: finesData.length,
                    total_pages: 1,
                    has_next: false,
                    has_previous: false
                };
            }
            
            // Add snapshot URLs to violations within fines
            const data = finesData.map(f => ({
                ...f,
                violations: f.violations.map(v => ({
                    ...v,
                    snapshotUrl: `${API_URL}${v.snapshotUrl}`,
                    plateImageUrl: v.plateImageUrl ? `${API_URL}${v.plateImageUrl}` : null
                }))
            }));
            setFines(data);
            if (paginationData) {
                setFinesPagination(paginationData);
            }
        } catch (error) {
            console.error('Error fetching fines:', error);
        }
    };

    const fetchCameras = async () => {
        try {
            const response = await api.get('/cameras');
            setCameras(response.data);
        } catch (error) {
            console.error('Error fetching cameras:', error);
        }
    };

    const handleValidate = async (type) => {
        if (!selectedViolation) return;

        const newStatus = type === 'reject_violation' || type === 'reject_all' ? 'rejected' : 'verified';
        const newPlate = type === 'fix_plate' ? editedPlate : selectedViolation.licensePlate;

        // Try to update via API
        try {
            await api.patch(`/violations/${selectedId}`, {
                status: newStatus,
                licensePlate: newPlate
            });
        } catch (error) {
            console.log('API update not available, updating locally');
        }

        // Update locally
        const updatedViolations = violations.map(v => {
            if (v.id === selectedId) {
                return {
                    ...v,
                    status: newStatus,
                    licensePlate: newPlate
                };
            }
            return v;
        });
        setViolations(updatedViolations);
    };

    // Violations are now filtered on the backend, so we use them directly
    const filteredViolations = violations;
    const availableCameraIds = [...new Set((allViolations.length > 0 ? allViolations : violations).map(v => v.cameraId))];

    // Count stats - we'll fetch these separately or use cached values
    // For now, use the current filtered violations for available cameras
    // Note: For accurate counts, you may want to add a /violations/stats endpoint
    const pendingCount = allViolations.filter(v => v.status === 'pending').length;
    const approvedCount = allViolations.filter(v => v.status === 'verified').length;
    const rejectedCount = allViolations.filter(v => v.status === 'rejected').length;

    const getViolationTypeColor = (type) => {
        switch (type) {
            case 'helmet': return 'text-red-400 border-red-400/30 bg-red-400/10';
            case 'triple_riding': return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
            case 'speed': return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
            case 'wrong_side': return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
            default: return 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10';
        }
    };

    const violationTypes = [
        { value: 'all', label: 'All Types' },
        { value: 'helmet', label: 'Helmet' },
        { value: 'triple_riding', label: 'Triple Riding' },
        { value: 'speed', label: 'Speed' },
        { value: 'wrong_side', label: 'Wrong Side' }
    ];

    const generateReport = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Title
        doc.setFontSize(20);
        doc.setTextColor(33, 37, 41);
        doc.text('VIOLATION ANALYTICS REPORT', pageWidth / 2, 20, { align: 'center' });

        // Generated timestamp
        doc.setFontSize(10);
        doc.setTextColor(108, 117, 125);
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 28, { align: 'center' });

        // Filters Applied Section
        doc.setFontSize(12);
        doc.setTextColor(33, 37, 41);
        doc.text('FILTERS APPLIED:', 14, 40);

        doc.setFontSize(10);
        doc.setTextColor(73, 80, 87);
        let yPos = 48;

        const statusLabels = { pending: 'Pending', approved: 'Approved', all: 'All', fines: 'Fines' };
        doc.text(`• Status: ${statusLabels[statusTab] || statusTab}`, 18, yPos);
        yPos += 6;

        if (selectedViolationType !== 'all') {
            const typeLabel = violationTypes.find(t => t.value === selectedViolationType)?.label || selectedViolationType;
            doc.text(`• Violation Type: ${typeLabel}`, 18, yPos);
            yPos += 6;
        }

        if (selectedCamera !== 'all') {
            doc.text(`• Camera: ${selectedCamera}`, 18, yPos);
            yPos += 6;
        }

        if (selectedDate) {
            doc.text(`• Date: ${selectedDate}`, 18, yPos);
            yPos += 6;
        } else if (timeFilter !== 'all') {
            const timeLabels = { today: 'Today', '1hour': 'Last Hour', '15min': 'Last 15 Min', '1week': 'Last Week' };
            doc.text(`• Time Range: ${timeLabels[timeFilter] || timeFilter}`, 18, yPos);
            yPos += 6;
        }

        // Summary Section
        yPos += 6;
        doc.setFontSize(12);
        doc.setTextColor(33, 37, 41);
        doc.text('SUMMARY:', 14, yPos);
        yPos += 8;

        const currentViolations = statusTab === 'fines' ? [] : filteredViolations;
        const pending = currentViolations.filter(v => v.status === 'pending').length;
        const approved = currentViolations.filter(v => v.status === 'verified').length;
        const rejected = currentViolations.filter(v => v.status === 'rejected').length;

        doc.setFontSize(10);
        doc.setTextColor(73, 80, 87);
        doc.text(`Total Violations: ${currentViolations.length}  |  Pending: ${pending}  |  Approved: ${approved}  |  Rejected: ${rejected}`, 18, yPos);
        yPos += 12;

        // Table
        if (currentViolations.length > 0) {
            const tableData = currentViolations.map((v, i) => [
                i + 1,
                v.licensePlate,
                v.violationType.replace('_', ' ').toUpperCase(),
                v.cameraId,
                new Date(v.timestamp).toLocaleString(),
                v.status.toUpperCase(),
                v.speed ? `${v.speed.toFixed(1)} km/h` : '-'
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['#', 'License Plate', 'Type', 'Camera', 'Date/Time', 'Status', 'Speed']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246], textColor: 255 },
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                    0: { cellWidth: 10 },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 25 },
                    3: { cellWidth: 25 },
                    4: { cellWidth: 40 },
                    5: { cellWidth: 20 },
                    6: { cellWidth: 20 }
                }
            });
        } else {
            doc.text('No violations found matching the current filters.', 18, yPos);
        }

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175);
            doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
        }

        // Save the PDF
        const filename = `violation_report_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
    };

    return (
        <div className="h-full flex bg-[#050b14] overflow-hidden">
            {/* Sidebar List */}
            <div className="w-80 flex flex-col border-r border-gray-800 bg-gray-900/50 backdrop-blur-sm">
                {/* Status Tabs */}
                <div className="p-2 border-b border-gray-800 flex gap-1">
                    <button
                        onClick={() => setStatusTab('pending')}
                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${statusTab === 'pending'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        Pending ({pendingCount})
                    </button>
                    <button
                        onClick={() => setStatusTab('approved')}
                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${statusTab === 'approved'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        Approved ({approvedCount})
                    </button>
                    <button
                        onClick={() => { setStatusTab('fines'); setSelectedFine(null); }}
                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1 ${statusTab === 'fines'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        <IndianRupee size={12} /> Fines
                    </button>
                    <button
                        onClick={() => setStatusTab('all')}
                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${statusTab === 'all'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        All
                    </button>
                </div>

                <div className="p-4 border-b border-gray-800 space-y-3">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Clock className="absolute left-2 top-2.5 w-4 h-4 text-gray-500" />
                            <select
                                value={timeFilter}
                                onChange={(e) => { setTimeFilter(e.target.value); setSelectedDate(''); }}
                                className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg pl-8 pr-3 py-2 outline-none focus:border-cyan-500 appearance-none"
                                disabled={!!selectedDate}
                            >
                                <option value="all">All Time</option>
                                <option value="today">Today</option>
                                <option value="1hour">Last Hour</option>
                                <option value="15min">Last 15 Min</option>
                            </select>
                        </div>
                        <div className="relative flex-1">
                            <Filter className="absolute left-2 top-2.5 w-4 h-4 text-gray-500" />
                            <select
                                value={selectedCamera}
                                onChange={(e) => setSelectedCamera(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg pl-8 pr-3 py-2 outline-none focus:border-cyan-500 appearance-none"
                            >
                                <option value="all">All Cameras</option>
                                {cameras.map(cam => <option key={cam.id} value={cam.name}>{cam.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <FileText className="absolute left-2 top-2.5 w-4 h-4 text-gray-500" />
                            <select
                                value={selectedViolationType}
                                onChange={(e) => setSelectedViolationType(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg pl-8 pr-3 py-2 outline-none focus:border-cyan-500 appearance-none"
                            >
                                {violationTypes.map(type => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="relative flex-1">
                            <Calendar className="absolute left-2 top-2.5 w-4 h-4 text-gray-500" />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg pl-8 pr-3 py-2 outline-none focus:border-cyan-500"
                            />
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-500 font-mono">
                            {statusTab === 'fines' 
                                ? `${finesPagination.total_count || fines.length} Fines`
                                : `${pagination.total_count || filteredViolations.length} Violations`
                            }
                        </div>
                        <button
                            onClick={generateReport}
                            disabled={statusTab === 'fines'}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={14} />
                            Download Report
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {statusTab === 'fines' ? (
                        /* Fines List View */
                        fines.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                                <IndianRupee className="w-8 h-8 mb-2 opacity-50" />
                                <span className="text-sm">No fines to display</span>
                                <span className="text-xs mt-1">Approve violations to generate fines</span>
                            </div>
                        ) : (
                            <>
                                {/* Fines Summary Header */}
                                <div className="p-3 border-b border-gray-800 bg-emerald-500/5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400 uppercase tracking-wider">Total Fines</span>
                                        <span className="text-lg font-bold text-emerald-400 font-mono">
                                            ₹{fines.reduce((sum, f) => sum + f.totalFine, 0).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {fines.length} vehicle{fines.length !== 1 ? 's' : ''} • {fines.reduce((sum, f) => sum + f.violationCount, 0)} violation{fines.reduce((sum, f) => sum + f.violationCount, 0) !== 1 ? 's' : ''}
                                    </div>
                                </div>
                                {/* Fines List */}
                                {fines.map(f => (
                                    <div
                                        key={f.licensePlate}
                                        onClick={() => setSelectedFine(f)}
                                        className={`p-3 border-b border-gray-800 cursor-pointer transition-colors relative group ${selectedFine?.licensePlate === f.licensePlate ? 'bg-emerald-900/20' : 'hover:bg-gray-800/50'}`}
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${selectedFine?.licensePlate === f.licensePlate ? 'bg-emerald-500' : 'bg-emerald-500/30'}`} />
                                        <div className="pl-3">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-mono font-bold text-gray-200">{f.licensePlate}</span>
                                                <span className="text-sm font-bold text-emerald-400 font-mono">₹{f.totalFine.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-gray-500">
                                                    {f.violationCount} violation{f.violationCount !== 1 ? 's' : ''}
                                                </span>
                                                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                                                    ₹500 × {f.violationCount}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 transition-transform ${selectedFine?.licensePlate === f.licensePlate ? 'translate-x-1 text-emerald-500' : 'group-hover:translate-x-1'}`} />
                                    </div>
                                ))}
                            </>
                        )
                    ) : (
                        /* Regular Violations List */
                        filteredViolations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                                <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
                                <span className="text-sm">No violations found</span>
                            </div>
                        ) : (
                            filteredViolations.map(v => (
                                <div
                                    key={v.id}
                                    onClick={() => setSelectedId(v.id)}
                                    className={`p-3 border-b border-gray-800 cursor-pointer transition-colors relative group ${selectedId === v.id ? 'bg-cyan-900/20' : 'hover:bg-gray-800/50'}`}
                                >
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${selectedId === v.id ? 'bg-cyan-500' : v.status === 'verified' ? 'bg-green-500' : v.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'}`} />
                                    <div className="pl-3">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-mono font-bold text-gray-200">{v.licensePlate}</span>
                                            <span className="text-xs text-gray-500 font-mono">{new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${getViolationTypeColor(v.violationType)}`}>
                                                {v.violationType.replace('_', ' ')}
                                            </span>
                                            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${v.status === 'verified' ? 'text-green-400 bg-green-400/10' :
                                                v.status === 'rejected' ? 'text-red-400 bg-red-400/10' :
                                                    'text-amber-400 bg-amber-400/10'
                                                }`}>
                                                {v.status}
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 transition-transform ${selectedId === v.id ? 'translate-x-1 text-cyan-500' : 'group-hover:translate-x-1'}`} />
                                </div>
                            ))
                        )
                    )}
                    
                    {/* Pagination Controls */}
                    {statusTab !== 'fines' && pagination.total_pages > 1 && (
                        <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Page</span>
                                    <select
                                        value={currentPage}
                                        onChange={(e) => setCurrentPage(Number(e.target.value))}
                                        className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500"
                                    >
                                        {Array.from({ length: pagination.total_pages }, (_, i) => i + 1).map(page => (
                                            <option key={page} value={page}>{page}</option>
                                        ))}
                                    </select>
                                    <span className="text-xs text-gray-400">of {pagination.total_pages}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={!pagination.has_previous}
                                        className="px-3 py-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(pagination.total_pages, prev + 1))}
                                        disabled={!pagination.has_next}
                                        className="px-3 py-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center justify-center gap-2">
                                <span className="text-xs text-gray-500">Items per page:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                    className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                </select>
                            </div>
                        </div>
                    )}
                    
                    {/* Fines Pagination Controls */}
                    {statusTab === 'fines' && finesPagination.total_pages > 1 && (
                        <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Page</span>
                                    <select
                                        value={currentPage}
                                        onChange={(e) => setCurrentPage(Number(e.target.value))}
                                        className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500"
                                    >
                                        {Array.from({ length: finesPagination.total_pages }, (_, i) => i + 1).map(page => (
                                            <option key={page} value={page}>{page}</option>
                                        ))}
                                    </select>
                                    <span className="text-xs text-gray-400">of {finesPagination.total_pages}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={!finesPagination.has_previous}
                                        className="px-3 py-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(finesPagination.total_pages, prev + 1))}
                                        disabled={!finesPagination.has_next}
                                        className="px-3 py-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center justify-center gap-2">
                                <span className="text-xs text-gray-500">Items per page:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                    className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-6 overflow-y-auto">
                {statusTab === 'fines' ? (
                    /* Fines Detail View */
                    selectedFine ? (
                        <div className="max-w-6xl mx-auto space-y-6">
                            {/* Fine Summary Card */}
                            <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">License Plate</div>
                                        <div className="font-mono text-3xl font-bold text-white">{selectedFine.licensePlate}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Total Fine</div>
                                        <div className="font-mono text-4xl font-bold text-emerald-400">₹{selectedFine.totalFine.toLocaleString('en-IN')}</div>
                                        <div className="text-sm text-gray-500 mt-1">
                                            {selectedFine.violationCount} violation{selectedFine.violationCount !== 1 ? 's' : ''} × ₹500
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Violations List */}
                            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-gray-800 bg-gray-800/50">
                                    <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Violation History</h3>
                                </div>
                                <div className="divide-y divide-gray-800">
                                    {selectedFine.violations.map((v, i) => (
                                        <div key={i} className="p-4 flex gap-4 hover:bg-gray-800/30 transition-colors">
                                            {/* Thumbnail */}
                                            <div className="w-32 h-20 bg-black rounded-lg overflow-hidden flex-shrink-0">
                                                <img
                                                    src={v.snapshotUrl}
                                                    alt="Violation"
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { e.target.src = 'https://placehold.co/160x100/1e293b/475569?text=No+Image' }}
                                                />
                                            </div>
                                            {/* Details */}
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className={`text-xs uppercase px-2 py-0.5 rounded border ${getViolationTypeColor(v.violationType)}`}>
                                                        {v.violationType.replace('_', ' ')}
                                                    </span>
                                                    <span className="text-emerald-400 font-mono font-bold">₹500</span>
                                                </div>
                                                <div className="text-xs text-gray-500 space-y-1">
                                                    <div className="flex gap-4">
                                                        <span>Camera: <span className="text-gray-400">{v.cameraId}</span></span>
                                                        <span>Confidence: <span className="text-gray-400">{(v.confidence * 100).toFixed(0)}%</span></span>
                                                    </div>
                                                    <div>
                                                        <span>Date: <span className="text-gray-400">{new Date(v.timestamp).toLocaleString()}</span></span>
                                                    </div>
                                                    {v.speed && (
                                                        <div>
                                                            <span>Speed: <span className="text-red-400 font-medium">{v.speed.toFixed(1)} km/h</span></span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600">
                            <IndianRupee size={64} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">Select a vehicle to view fines</p>
                        </div>
                    )
                ) : (
                    /* Regular Violation Detail View */
                    selectedViolation ? (
                        <div className="max-w-6xl mx-auto space-y-6">
                            {/* Action Bar */}
                            {selectedViolation.status === 'pending' ? (
                                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex justify-between items-center backdrop-blur-sm">
                                    <div>
                                        <h3 className="text-gray-200 font-semibold">Verification Required</h3>
                                        <p className="text-sm text-gray-500">Review the violation evidence below. Approving will move it to the Approved tab.</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={() => handleValidate('reject_violation')} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                                            <ShieldAlert size={16} /> Reject
                                        </button>
                                        <button onClick={() => handleValidate('accept')} className="flex items-center gap-2 px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors shadow-lg shadow-green-900/20">
                                            <CheckCircle size={16} /> Approve
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className={`rounded-xl p-4 flex items-center gap-3 border ${selectedViolation.status === 'verified' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                                    {selectedViolation.status === 'verified' ? <CheckCircle size={24} /> : <XCircle size={24} />}
                                    <div>
                                        <div className="font-bold uppercase">{selectedViolation.status === 'verified' ? 'Approved' : 'Rejected'} Violation</div>
                                        <div className="text-sm opacity-80">This violation has been processed and {selectedViolation.status === 'verified' ? 'approved for further action' : 'rejected as invalid'}.</div>
                                    </div>
                                </div>
                            )}

                            {/* Evidence Grid */}
                            <div className="grid grid-cols-3 gap-6">
                                {/* Full Snapshot */}
                                <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
                                    <div className="p-3 border-b border-gray-800 bg-gray-800/50 flex justify-between items-center">
                                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Full Snapshot</span>
                                        <span className="text-xs font-mono text-cyan-500">{selectedViolation.cameraId}</span>
                                    </div>
                                    <div className="relative aspect-video bg-black">
                                        <img
                                            src={selectedViolation.snapshotUrl}
                                            alt="Snapshot"
                                            className="w-full h-full object-contain"
                                            onError={(e) => { e.target.src = 'https://placehold.co/800x450/1e293b/475569?text=No+Image' }}
                                        />
                                    </div>
                                </div>

                                {/* Sidebar Details */}
                                <div className="space-y-6">
                                    {/* Plate Image */}
                                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                                        <div className="p-3 border-b border-gray-800 bg-gray-800/50">
                                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">License Plate</span>
                                        </div>
                                        <div className="relative h-32 bg-black flex items-center justify-center">
                                            <img
                                                src={selectedViolation.plateImageUrl}
                                                alt="Plate"
                                                className="max-w-full max-h-full object-contain"
                                                onError={(e) => { e.target.src = 'https://placehold.co/300x100/1e293b/475569?text=No+Plate' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Details Card */}
                                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4 shadow-lg">
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Violation Type</label>
                                            <div className={`inline-block px-3 py-1 rounded-md border text-sm font-medium ${getViolationTypeColor(selectedViolation.violationType)}`}>
                                                {selectedViolation.violationType.replace('_', ' ')}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Plate Number</label>
                                            {editMode && selectedViolation.status === 'pending' ? (
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={editedPlate}
                                                        onChange={(e) => setEditedPlate(e.target.value.toUpperCase())}
                                                        className="flex-1 bg-gray-800 border border-cyan-500 text-white font-mono rounded px-2 py-1 uppercase"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleValidate('fix_plate')} className="p-1 bg-green-600 rounded hover:bg-green-500"><Save size={16} /></button>
                                                    <button onClick={() => setEditMode(false)} className="p-1 bg-gray-700 rounded hover:bg-gray-600"><X size={16} /></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xl font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20">
                                                        {selectedViolation.licensePlate}
                                                    </span>
                                                    {selectedViolation.status === 'pending' && (
                                                        <button onClick={() => setEditMode(true)} className="text-gray-500 hover:text-cyan-400 transition-colors">
                                                            <Edit2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Confidence</label>
                                                <div className="font-mono text-gray-300">{(selectedViolation.confidence * 100).toFixed(1)}%</div>
                                            </div>
                                            {selectedViolation.speed && (
                                                <div>
                                                    <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Speed</label>
                                                    <div className="font-mono text-red-400 font-bold">{selectedViolation.speed.toFixed(1)} km/h</div>
                                                </div>
                                            )}
                                            <div>
                                                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Time</label>
                                                <div className="font-mono text-gray-300">{new Date(selectedViolation.timestamp).toLocaleTimeString()}</div>
                                            </div>
                                        </div>

                                        {/* Speed Violation Details */}
                                        {selectedViolation.violationType === 'speed' && selectedViolation.speed && (
                                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs font-bold text-red-400 uppercase">Speed Violation</span>
                                                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                        RADAR
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div>
                                                        <span className="text-gray-500">Detected Speed:</span>
                                                        <span className="ml-1 text-red-400 font-mono font-bold">{selectedViolation.speed.toFixed(1)} km/h</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Speed Limit:</span>
                                                        <span className="ml-1 text-gray-300 font-mono">40 km/h (2W) / 30 km/h (4W)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600">
                            <Car size={64} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">Select a violation to view details</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default Violations;
