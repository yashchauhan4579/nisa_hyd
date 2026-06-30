import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { API_URL } from '../config';
import { Trash2, Plus, Camera, Save, Upload, Settings as SettingsIcon } from 'lucide-react';
import CameraConfigModal from '../components/CameraConfigModal';

const Settings = () => {
    const [cameras, setCameras] = useState([]);
    const [newCamera, setNewCamera] = useState({ name: '', rtsp_url: '', enabled_violations: ['helmet', 'triple_riding'] });
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedCamera, setSelectedCamera] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchCameras();
    }, []);

    const fetchCameras = async () => {
        try {
            const response = await api.get('/cameras');
            setCameras(response.data);
        } catch (error) {
            console.error('Error fetching cameras (offline mode):', error);
            // In offline mode, don't clear cameras if we have them locally
            if (cameras.length === 0) {
                // Optionally set some dummy data if needed, or leave empty
            }
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setUploading(true);
        try {
            await api.post('/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            fetchCameras();
            alert('File uploaded and processing started!');
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Failed to upload file.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleAddCamera = async (e) => {
        e.preventDefault();
        if (!newCamera.name || !newCamera.rtsp_url) return;

        setLoading(true);
        try {
            await api.post('/cameras', newCamera);
            setNewCamera({ name: '', rtsp_url: '', enabled_violations: ['helmet', 'triple_riding'] });
            fetchCameras();
        } catch (error) {
            console.error('Error adding camera:', error);
            const msg = error.response?.data?.detail || error.message || "Unknown error";
            alert(`Failed to add camera: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCamera = async (id) => {
        if (!window.confirm('Are you sure you want to remove this camera?')) return;
        try {
            await api.delete(`/cameras/${id}`);
            fetchCameras();
        } catch (error) {
            console.error('Error deleting camera:', error);
        }
    };

    const handleSaveConfig = async (id, config) => {
        try {
            await api.patch(`/cameras/${id}`, config);
            fetchCameras();
        } catch (error) {
            throw error;
        }
    };

    return (
        <div className="h-full p-8 overflow-y-auto bg-[#050b14] text-cyan-500 font-mono">
            <h2 className="text-3xl font-bold mb-8 tracking-wider border-b border-cyan-900/50 pb-4">
                [SYSTEM.CONFIGURATION]
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-8">
                    {/* Add Camera Section */}
                    <div className="bg-[#0a101a]/80 border border-cyan-900/50 p-6 relative overflow-hidden group">
                        {/* Corner Markers */}
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500"></div>
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500"></div>
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500"></div>
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500"></div>

                        <h3 className="text-xl font-bold mb-6 flex items-center space-x-2 text-cyan-400">
                            <Plus size={20} />
                            <span>ADD_NEW_SOURCE</span>
                        </h3>

                        <form onSubmit={handleAddCamera} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold mb-2 tracking-widest text-cyan-700">SOURCE.NAME</label>
                                <input
                                    type="text"
                                    value={newCamera.name}
                                    onChange={(e) => setNewCamera({ ...newCamera, name: e.target.value })}
                                    className="w-full bg-black/50 border border-cyan-900/50 p-3 text-cyan-100 focus:border-cyan-500 focus:outline-none focus:shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all placeholder-cyan-900/50"
                                    placeholder="ENTER_NAME"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-2 tracking-widest text-cyan-700">RTSP.URL</label>
                                <input
                                    type="text"
                                    value={newCamera.rtsp_url}
                                    onChange={(e) => setNewCamera({ ...newCamera, rtsp_url: e.target.value })}
                                    className="w-full bg-black/50 border border-cyan-900/50 p-3 text-cyan-100 focus:border-cyan-500 focus:outline-none focus:shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all placeholder-cyan-900/50"
                                    placeholder="rtsp://..."
                                />
                            </div>

                            {/* Default: Helmet & Triple Riding */}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-cyan-900/20 hover:bg-cyan-900/40 border border-cyan-500/50 text-cyan-400 font-bold py-3 px-4 flex items-center justify-center space-x-2 transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.2)] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                            >
                                {loading ? (
                                    <span className="animate-pulse">INITIALIZING...</span>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        <span>INITIALIZE_SOURCE</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Upload Local File Section */}
                    <div className="bg-[#0a101a]/80 border border-cyan-900/50 p-6 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500"></div>
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500"></div>
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500"></div>
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500"></div>

                        <h3 className="text-xl font-bold mb-6 flex items-center space-x-2 text-cyan-400">
                            <Upload size={20} />
                            <span>UPLOAD_LOCAL_FILE</span>
                        </h3>

                        <div className="space-y-4">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                accept="video/*"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="w-full bg-cyan-900/20 hover:bg-cyan-900/40 border border-cyan-500/50 text-cyan-400 font-bold py-8 px-4 flex flex-col items-center justify-center space-y-2 transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.2)] border-dashed"
                            >
                                {uploading ? (
                                    <span className="animate-pulse">UPLOADING_AND_PROCESSING...</span>
                                ) : (
                                    <>
                                        <Upload size={32} />
                                        <span>CLICK_TO_SELECT_VIDEO</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>


                </div>

                {/* Camera List Section */}
                <div className="space-y-4">
                    <h3 className="text-xl font-bold mb-6 flex items-center space-x-2 text-cyan-400">
                        <Camera size={20} />
                        <span>ACTIVE_SOURCES [{cameras.length}]</span>
                    </h3>

                    {cameras.map((camera) => (
                        <div key={camera.id} className="bg-[#0a101a]/80 border border-cyan-900/30 p-4 flex items-center justify-between group hover:border-cyan-500/50 transition-all">
                            <div className="flex items-center space-x-4">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                <div>
                                    <div className="font-bold text-cyan-100">{camera.name}</div>
                                    <div className="text-xs text-cyan-800 font-mono mt-1 truncate max-w-[200px]">{camera.rtsp_url}</div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setSelectedCamera(camera)}
                                    className="p-2 text-cyan-700 hover:text-cyan-400 hover:bg-cyan-900/30 rounded border border-transparent hover:border-cyan-500/30 transition-all"
                                    title="CONFIGURE"
                                >
                                    <SettingsIcon size={18} />
                                </button>
                                <button
                                    onClick={() => handleDeleteCamera(camera.id)}
                                    className="p-2 text-red-900 hover:text-red-500 hover:bg-red-950/30 rounded border border-transparent hover:border-red-900/50 transition-all"
                                    title="TERMINATE_SOURCE"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {cameras.length === 0 && (
                        <div className="text-center py-12 text-cyan-900 border border-dashed border-cyan-900/30">
                            NO_ACTIVE_SOURCES_DETECTED
                        </div>
                    )}
                </div>
            </div>

            {selectedCamera && (
                <CameraConfigModal
                    camera={selectedCamera}
                    onClose={() => setSelectedCamera(null)}
                    onSave={handleSaveConfig}
                />
            )}
        </div>
    );
};

export default Settings;
