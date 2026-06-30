import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import VideoGrid from '../components/VideoGrid';
import CameraSidebar from '../components/CameraSidebar';

const Dashboard = () => {
    const [cameras, setCameras] = useState([]);
    const [counts, setCounts] = useState({});

    const fetchCameras = useCallback(async () => {
        try {
            const response = await api.get('/cameras', {
                timeout: 10000, // 10 second timeout
                validateStatus: (status) => status < 500 // Don't throw on 4xx errors
            });
            if (Array.isArray(response.data)) {
                setCameras(response.data);
            } else {
                console.warn('Backend returned non-array for cameras:', response.data);
                setCameras([]);
            }
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.warn('Camera fetch timeout, will retry...');
            } else if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
                console.warn('Network error fetching cameras, will retry...');
            } else {
                console.error('Error fetching cameras:', error);
            }
        }
    }, []);

    const fetchCounts = async () => {
        try {
            const response = await api.get('/counts', {
                timeout: 5000, // 5 second timeout
                validateStatus: (status) => status < 500
            });
            setCounts(response.data);
        } catch (error) {
            // Silently fail for counts - it's updated frequently
            if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK') {
                console.error('Error fetching counts:', error);
            }
        }
    };

    useEffect(() => {
        fetchCameras();
        fetchCounts();
        const camInterval = setInterval(fetchCameras, 5000);
        const countInterval = setInterval(fetchCounts, 1000); // Poll counts every second
        return () => {
            clearInterval(camInterval);
            clearInterval(countInterval);
        };
    }, [fetchCameras]);

    const [gridState, setGridState] = useState({}); // { slotIndex: cameraObject }

    const handleDragStart = (e, camera) => {
        e.dataTransfer.setData('camera', JSON.stringify(camera));
    };

    const handleDrop = (e, slotIndex) => {
        e.preventDefault();
        const cameraData = e.dataTransfer.getData('camera');
        if (cameraData) {
            const camera = JSON.parse(cameraData);
            setGridState(prev => ({
                ...prev,
                [slotIndex]: camera
            }));
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Allow drop
    };

    const handleCloseSlot = (slotIndex) => {
        setGridState(prev => {
            const newState = { ...prev };
            delete newState[slotIndex];
            return newState;
        });
    };

    return (
        <div className="h-full flex bg-[#050b14]">
            {/* Sidebar */}
            <div className="flex-shrink-0 h-full border-r border-[#1a2333] z-20 relative">
                {/* Lazy load properly or just import it at top. Assuming it's imported. */}
                <CameraSidebar cameras={cameras} onDragStart={handleDragStart} />
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden relative">
                <VideoGrid
                    cameras={cameras}
                    counts={counts}
                    onCameraUpdate={fetchCameras}

                    /* Drag & Drop Props */
                    gridState={gridState}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onCloseSlot={handleCloseSlot}
                />
            </div>
        </div>
    );

};

export default Dashboard;

