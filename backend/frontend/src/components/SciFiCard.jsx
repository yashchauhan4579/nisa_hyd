import React from 'react';
import { X, Target } from 'lucide-react';

const SciFiCard = ({
    children,
    title = "SLOT",
    isEmpty = false,
    onClose,
    className = "",
    gridSize = 2
}) => {
    // Calculate sizes based on grid (reduced by 50%)
    const iconSize = gridSize === 1 ? 48 : gridSize === 2 ? 32 : gridSize === 3 ? 24 : 16;
    const textSize = gridSize === 1 ? 'text-2xl' : gridSize === 2 ? 'text-lg' : gridSize === 3 ? 'text-sm' : 'text-xs';

    return (
        <div className={`relative border border-cyan-900/50 bg-[#0a101a]/80 backdrop-blur-sm flex flex-col overflow-hidden group ${className}`}>
            {/* Corner Markers */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500 z-10"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500 z-10"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500 z-10"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500 z-10"></div>

            {/* Content Area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                {isEmpty ? (
                    <div className="flex flex-col items-center justify-center text-cyan-800 space-y-4">
                        <Target size={iconSize} strokeWidth={1} className="animate-pulse" />
                        <div className={`${textSize} tracking-[0.2em] font-bold text-cyan-700`}>{title}</div>
                    </div>
                ) : (
                    children
                )}
            </div>

            {/* Close Button (only if not empty) */}
            {!isEmpty && onClose && (
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 px-2 py-1 bg-red-950/80 hover:bg-red-900 text-red-500 hover:text-red-400 border border-red-500/50 transition-colors z-20 text-[10px] font-bold tracking-wider backdrop-blur-sm"
                >
                    [REMOVE]
                </button>
            )}
        </div>
    );
};

export default SciFiCard;
