import { createContext, useContext, useState, type ReactNode } from 'react';

export type GridSize = '1x1' | '2x2' | '2x3' | '3x3' | '3x4' | '4x4' | '4x5';
const VISIBLE_GRID_SIZES = ['1x1', '2x2', '3x3', '4x4'] as const;

interface CameraGridContextType {
    gridSize: GridSize;
    setGridSize: (size: GridSize) => void;
    usedSlots: number;
    setUsedSlots: (count: number) => void;
}

const CameraGridContext = createContext<CameraGridContextType | undefined>(undefined);

export function CameraGridProvider({ children }: { children: ReactNode }) {
    // Load grid size from localStorage on mount
    const [gridSize, setGridSizeState] = useState<GridSize>(() => {
        try {
            const saved = localStorage.getItem('cameraGridSize');
            if (saved && VISIBLE_GRID_SIZES.includes(saved as typeof VISIBLE_GRID_SIZES[number])) {
                return saved as GridSize;
            }
        } catch (err) {
            console.error('Failed to load grid size from localStorage:', err);
        }
        return '2x2';
    });

    const [usedSlots, setUsedSlots] = useState(0);

    // Save grid size to localStorage whenever it changes
    const setGridSize = (size: GridSize) => {
        const normalizedSize = VISIBLE_GRID_SIZES.includes(size as typeof VISIBLE_GRID_SIZES[number]) ? size : '2x2';
        setGridSizeState(normalizedSize);
        try {
            localStorage.setItem('cameraGridSize', normalizedSize);
        } catch (err) {
            console.error('Failed to save grid size to localStorage:', err);
        }
    };

    return (
        <CameraGridContext.Provider
            value={{
                gridSize,
                setGridSize,
                usedSlots,
                setUsedSlots,
            }}
        >
            {children}
        </CameraGridContext.Provider>
    );
}

export function useCameraGrid() {
    const context = useContext(CameraGridContext);
    if (context === undefined) {
        throw new Error('useCameraGrid must be used within a CameraGridProvider');
    }
    return context;
}
