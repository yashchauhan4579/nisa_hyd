import React, { useState, useEffect, useRef } from 'react';
import { X, Save, AlertTriangle, Activity, Map, Video } from 'lucide-react';

const CameraConfigModal = ({ camera, onClose, onSave }) => {
    const [config, setConfig] = useState({
        enabled_violations: [],
        speed_limit: 60,
        wrong_side_zone: [],
        wrong_side_direction: ''
    });
    const [loading, setLoading] = useState(false);
    const [drawing, setDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState([]);
    const [imageLoaded, setImageLoaded] = useState(false);
    const canvasRef = useRef(null);
    const imgRef = useRef(null);

    useEffect(() => {
        // Initialize config from camera prop
        let violations = [];
        try {
            violations = typeof camera.enabled_violations === 'string'
                ? JSON.parse(camera.enabled_violations)
                : camera.enabled_violations || ["helmet", "triple_riding"];
        } catch (e) {
            violations = ["helmet", "triple_riding"];
        }

        let zone = [];
        try {
            zone = typeof camera.wrong_side_zone === 'string'
                ? JSON.parse(camera.wrong_side_zone)
                : camera.wrong_side_zone || [];
        } catch (e) {
            zone = [];
        }

        setConfig({
            enabled_violations: violations,
            speed_limit: camera.speed_limit || 60,
            wrong_side_zone: zone,
            wrong_side_direction: camera.wrong_side_direction || ''
        });
    }, [camera]);

    const handleToggleViolation = (type) => {
        setConfig(prev => {
            const current = prev.enabled_violations;
            if (current.includes(type)) {
                return { ...prev, enabled_violations: current.filter(t => t !== type) };
            } else {
                return { ...prev, enabled_violations: [...current, type] };
            }
        });
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await onSave(camera.id, config);
            onClose();
        } catch (error) {
            console.error("Failed to save config", error);
            alert("Failed to save configuration");
        } finally {
            setLoading(false);
        }
    };

    const startDrawing = () => {
        setDrawing(true);
        setCurrentPoints([]);
        setConfig(prev => ({ ...prev, wrong_side_zone: [] }));
    };

    const handleCanvasClick = (e) => {
        if (!drawing) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Scale to image natural size
        const scaleX = imgRef.current.naturalWidth / rect.width;
        const scaleY = imgRef.current.naturalHeight / rect.height;

        const actualX = Math.round(x * scaleX);
        const actualY = Math.round(y * scaleY);

        setCurrentPoints(prev => [...prev, [actualX, actualY]]);
    };

    const finishDrawing = () => {
        setDrawing(false);
        setConfig(prev => ({ ...prev, wrong_side_zone: currentPoints }));
    };

    // Render points on canvas
    useEffect(() => {
        if (!canvasRef.current || !imgRef.current) return;

        // Ensure size matches
        if (imgRef.current.clientWidth > 0 && canvasRef.current.width !== imgRef.current.clientWidth) {
            canvasRef.current.width = imgRef.current.clientWidth;
            canvasRef.current.height = imgRef.current.clientHeight;
        }

        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        const pointsToDraw = drawing ? currentPoints : config.wrong_side_zone;
        if (!pointsToDraw || pointsToDraw.length === 0) return;

        // Calculate scale
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = rect.width / imgRef.current.naturalWidth;
        const scaleY = rect.height / imgRef.current.naturalHeight;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';

        ctx.beginPath();
        pointsToDraw.forEach((p, i) => {
            const x = p[0] * scaleX;
            const y = p[1] * scaleY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        if (!drawing && pointsToDraw.length > 2) ctx.closePath();
        ctx.stroke();
        if (!drawing && pointsToDraw.length > 2) ctx.fill();

        // Draw points
        pointsToDraw.forEach(p => {
            const x = p[0] * scaleX;
            const y = p[1] * scaleY;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });

    }, [currentPoints, config.wrong_side_zone, drawing, imgRef.current?.width]); // Re-render on resize/update

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-8">
            <div className="bg-[#0a101a] border border-cyan-500/30 w-full max-w-4xl max-h-full overflow-y-auto p-6 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                <div className="flex justify-between items-center mb-6 border-b border-cyan-900/50 pb-4">
                    <h2 className="text-2xl font-bold text-cyan-400 tracking-wider">CONFIGURE_SOURCE: {camera.name}</h2>
                    <button onClick={onClose} className="text-cyan-700 hover:text-cyan-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Toggles & Inputs */}
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-bold text-cyan-600 mb-3 tracking-widest">VIOLATION_TYPES</h3>
                            <div className="space-y-2">
                                {['helmet', 'triple_riding', 'wrong_side', 'speed', 'seatbelt'].map(type => (
                                    <label key={type} onClick={() => handleToggleViolation(type)} className="flex items-center space-x-3 cursor-pointer group">
                                        <div className={`w-5 h-5 border ${config.enabled_violations.includes(type) ? 'bg-cyan-500 border-cyan-500' : 'border-cyan-700 bg-transparent'} flex items-center justify-center transition-all`}>
                                            {config.enabled_violations.includes(type) && <div className="w-2 h-2 bg-black"></div>}
                                        </div>
                                        <span className={`font-mono text-sm ${config.enabled_violations.includes(type) ? 'text-cyan-100' : 'text-cyan-800'} group-hover:text-cyan-400 transition-colors uppercase`}>
                                            {type.replace('_', ' ')}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {config.enabled_violations.includes('speed') && (
                            <div className="space-y-4 border-t border-cyan-900/30 pt-4">
                                <h3 className="text-sm font-bold text-cyan-600 tracking-widest flex items-center space-x-2">
                                    <Activity size={16} />
                                    <span>SPEED_CONFIGURATION</span>
                                </h3>
                                <div>
                                    <label className="block text-xs text-cyan-700 mb-1">SPEED_LIMIT (KM/H)</label>
                                    <input
                                        type="number"
                                        value={config.speed_limit}
                                        onChange={e => setConfig({ ...config, speed_limit: parseInt(e.target.value) })}
                                        className="w-full bg-black/30 border border-cyan-900/50 p-2 text-cyan-100 focus:border-cyan-500 outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Wrong Side Drawing */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-cyan-600 tracking-widest flex items-center space-x-2">
                            <Map size={16} />
                            <span>WRONG_SIDE_ZONE</span>
                        </h3>

                        <div className="relative border border-cyan-900/50 bg-black aspect-video group">
                            <img
                                ref={imgRef}
                                src={`http://${window.location.hostname}:8001/api/cameras/${camera.id}/frame`}
                                alt="Camera Frame"
                                className="w-full h-full object-contain opacity-50 group-hover:opacity-100 transition-opacity"
                                crossOrigin="anonymous"
                                onLoad={() => {
                                    setImageLoaded(true);
                                    // Force canvas resize match
                                    if (canvasRef.current && imgRef.current) {
                                        canvasRef.current.width = imgRef.current.clientWidth;
                                        canvasRef.current.height = imgRef.current.clientHeight;
                                    }
                                }}
                            />
                            <canvas
                                ref={canvasRef}
                                className="absolute inset-0 w-full h-full cursor-crosshair"
                                onClick={handleCanvasClick}
                            />

                            {/* Overlay Message if not loaded */}
                            {!imageLoaded && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-cyan-900 text-xs">[FRAME_PREVIEW]</span>
                                </div>
                            )}
                        </div>

                        <div className="flex space-x-2">
                            {!drawing ? (
                                <button
                                    onClick={startDrawing}
                                    className="flex-1 bg-cyan-900/20 hover:bg-cyan-900/40 border border-cyan-500/30 text-cyan-400 py-2 text-xs font-bold"
                                >
                                    DRAW_ZONE
                                </button>
                            ) : (
                                <button
                                    onClick={finishDrawing}
                                    className="flex-1 bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-400 py-2 text-xs font-bold"
                                >
                                    FINISH_DRAWING
                                </button>
                            )}
                            <button
                                onClick={() => setConfig({ ...config, wrong_side_zone: [] })}
                                className="px-3 bg-red-950/30 hover:bg-red-900/50 border border-red-900/30 text-red-500"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-[10px] text-cyan-800">
                            {drawing ? "Click points to define polygon. Click FINISH when done." : "Draw a polygon to define the wrong-side area."}
                        </p>

                        {/* Direction Selector */}
                        {config.enabled_violations.includes('wrong_side') && (
                            <div className="mt-4 border-t border-cyan-900/30 pt-4">
                                <label className="block text-xs text-cyan-700 mb-2 font-bold tracking-wider">TRAFFIC_DIRECTION</label>
                                <select
                                    value={config.wrong_side_direction || 'DOWN'}
                                    onChange={e => setConfig({ ...config, wrong_side_direction: e.target.value })}
                                    className="w-full bg-black/30 border border-cyan-900/50 p-2 text-cyan-100 focus:border-cyan-500 outline-none font-mono text-sm"
                                >
                                    <option value="DOWN">DOWN (Top → Bottom)</option>
                                    <option value="UP">UP (Bottom → Top)</option>
                                </select>
                                <p className="text-[10px] text-cyan-800 mt-1">
                                    Select normal traffic flow direction. Violations detect opposite movement.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 flex justify-end pt-6 border-t border-cyan-900/50">
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="bg-cyan-600 hover:bg-cyan-500 text-black font-bold py-2 px-6 flex items-center space-x-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                    >
                        {loading ? <span>SAVING...</span> : (
                            <>
                                <Save size={18} />
                                <span>SAVE_CONFIGURATION</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div >
    );
};

export default CameraConfigModal;
