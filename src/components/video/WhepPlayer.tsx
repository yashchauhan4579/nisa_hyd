import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface WhepPlayerProps {
    url: string; // The URL to the MediaMTX stream resource, e.g., http://host:8889/camera_1
    className?: string;
    muted?: boolean;
    autoPlay?: boolean;
    onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'failed') => void;
}

export function WhepPlayer({ url, className, muted = true, autoPlay = true, onStatusChange }: WhepPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = peerConnection;

        const startStream = async () => {
            try {
                setLoading(true);
                if (onStatusChange) onStatusChange('connecting');

                // Add transceiver for video only
                peerConnection.addTransceiver('video', { direction: 'recvonly' });
                // peerConnection.addTransceiver('audio', { direction: 'recvonly' }); // If audio needed

                peerConnection.ontrack = (event) => {
                    if (videoRef.current && event.streams[0]) {
                        videoRef.current.srcObject = event.streams[0];
                    }
                };

                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                // Send offer to WHEP endpoint
                // URL should be like http://host:8889/streamName/whep
                const whepUrl = url.endsWith('/whep') ? url : `${url}/whep`;

                const response = await fetch(whepUrl, {
                    method: 'POST',
                    body: offer.sdp,
                    headers: {
                        'Content-Type': 'application/sdp',
                    },
                });

                if (!response.ok) {
                    throw new Error(`WHEP connection failed: ${response.status}`);
                }

                const answerSdp = await response.text();
                if (mounted) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription({
                        type: 'answer',
                        sdp: answerSdp,
                    }));
                    setLoading(false);
                    if (onStatusChange) onStatusChange('connected');
                }

            } catch (err) {
                console.error('WHEP Error:', err);
                if (mounted) {
                    setError('Stream unavailable');
                    setLoading(false);
                    if (onStatusChange) onStatusChange('failed');
                }
            }
        };

        startStream();

        return () => {
            mounted = false;
            if (pcRef.current) {
                pcRef.current.close();
            }
        };
    }, [url]);

    return (
        <div className={`relative bg-black ${className}`}>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <p className="text-red-400 text-xs px-2 text-center">{error}</p>
                </div>
            )}
            <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay={autoPlay}
                muted={muted}
                playsInline
            />
        </div>
    );
}
