import React from 'react';
import { Camera, GripVertical } from 'lucide-react';

const CameraSidebar = ({ cameras, onDragStart }) => {
    return (
        <div className="w-64 h-full bg-[#0a101a] border-r border-[#1a2333] flex flex-col p-4 shadow-xl z-20">
            <h2 className="text-cyan-400 font-mono text-lg tracking-widest mb-6 border-b border-cyan-900/50 pb-2">
                [CAM.SOURCES]
            </h2>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                {cameras.map((camera) => (
                    <div
                        key={camera.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, camera)}
                        className="
                            group flex items-center p-3 rounded bg-[#0f1724] border border-[#1a2333]
                            hover:border-cyan-500/50 hover:bg-[#151f2e] cursor-grab active:cursor-grabbing
                            transition-all duration-200 select-none
                        "
                    >
                        <GripVertical className="text-gray-600 group-hover:text-cyan-600 mr-2" size={16} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                                <Camera size={14} className="text-cyan-500" />
                                <span className="text-gray-200 font-mono text-sm truncate">{camera.name}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-wider">
                                <span>ID: {camera.id}</span>
                                <span className={camera.is_active ? "text-green-500 font-bold" : "text-gray-600"}>
                                    {camera.is_active ? "ACTIVE" : "OFFLINE"}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 pt-4 border-t border-[#1a2333]">
                <div className="text-[10px] text-gray-500 font-mono text-center">
                    DRAG_AND_DROP_TO_VIEW
                </div>
            </div>
        </div>
    );
};

export default CameraSidebar;
