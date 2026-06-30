import { createContext, useContext, useState, type ReactNode } from 'react';

interface FullscreenContextType {
    isFullscreen: boolean;
    setIsFullscreen: (fullscreen: boolean) => void;
}

const FullscreenContext = createContext<FullscreenContextType | undefined>(undefined);

export function FullscreenProvider({ children }: { children: ReactNode }) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    return (
        <FullscreenContext.Provider
            value={{
                isFullscreen,
                setIsFullscreen,
            }}
        >
            {children}
        </FullscreenContext.Provider>
    );
}

export function useFullscreen() {
    const context = useContext(FullscreenContext);
    if (context === undefined) {
        throw new Error('useFullscreen must be used within a FullscreenProvider');
    }
    return context;
}
