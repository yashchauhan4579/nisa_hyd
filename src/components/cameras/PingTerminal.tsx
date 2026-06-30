import { useState, useEffect, useRef } from 'react';
import { X, Terminal, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

interface PingTerminalProps {
    ip: string;
    onClose: () => void;
}

export function PingTerminal({ ip, onClose }: PingTerminalProps) {
    const [output, setOutput] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();

    const runPing = async () => {
        setOutput('');
        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/tools/ping?ip=${encodeURIComponent(ip)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || `HTTP ${res.status}`);
                return;
            }

            const data = await res.json();
            setOutput(data.output || '(no output)');
        } catch (err: any) {
            setError(err.message || 'Failed to reach server');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        runPing();
    }, [ip]);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    const isLight = theme === 'light';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className={cn(
                    "w-full max-w-2xl mx-4 rounded-xl overflow-hidden shadow-2xl border animate-in fade-in zoom-in-95 duration-200",
                    isLight ? "border-gray-200 shadow-gray-300/50" : "border-gray-700 shadow-black/50"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Title Bar */}
                <div className={cn(
                    "flex items-center justify-between px-4 py-2.5 border-b",
                    isLight ? "bg-gray-100 border-gray-200" : "bg-gray-800 border-gray-700"
                )}>
                    <div className="flex items-center gap-2">
                        <Terminal className={cn("w-4 h-4", isLight ? "text-green-600" : "text-green-400")} />
                        <span className={cn(
                            "text-sm font-medium",
                            isLight ? "text-gray-800" : "text-gray-200"
                        )}>
                            ping {ip}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={runPing}
                            disabled={loading}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                loading
                                    ? "text-gray-400 cursor-not-allowed"
                                    : isLight
                                        ? "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
                                        : "text-gray-400 hover:text-white hover:bg-gray-700"
                            )}
                            title="Re-run ping"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                        </button>
                        <button
                            onClick={onClose}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                isLight
                                    ? "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
                                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                            )}
                            title="Close"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Terminal Body */}
                <div
                    className={cn(
                        "p-4 min-h-[250px] max-h-[400px] overflow-auto",
                        isLight ? "bg-white" : "bg-gray-950"
                    )}
                    ref={outputRef}
                >
                    <div className="font-mono text-sm leading-relaxed">
                        <span className={cn(isLight ? "text-green-600" : "text-green-400")}>$ </span>
                        <span className={cn(isLight ? "text-gray-700" : "text-gray-300")}>ping -c 4 {ip}</span>

                        {loading && (
                            <div className="mt-3 flex items-center gap-2">
                                <div className={cn(
                                    "w-2 h-2 rounded-full animate-pulse",
                                    isLight ? "bg-green-500" : "bg-green-400"
                                )} />
                                <span className={cn("text-xs", isLight ? "text-gray-400" : "text-gray-500")}>Running...</span>
                            </div>
                        )}

                        {error && (
                            <div className="mt-3 text-red-500">
                                Error: {error}
                            </div>
                        )}

                        {output && (
                            <pre className={cn(
                                "mt-3 whitespace-pre-wrap break-words",
                                isLight ? "text-gray-800" : "text-gray-300"
                            )}>
                                {output}
                            </pre>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
