#!/usr/bin/env python3
"""
Violation Pipeline Runner - Supports both video files and RTSP streams.
"""
import os
import sys
import argparse
import time

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from violation_pipeline.pipeline import UnifiedPipeline
from violation_pipeline.config.config import Config


def main():
    parser = argparse.ArgumentParser(description="Unified Violation & ANPR Pipeline")
    parser.add_argument("--source", type=str, required=True, 
                        help="Video file path or RTSP URL (e.g., rtsp://192.168.1.10:554/stream)")
    parser.add_argument("--camera-id", type=int, default=1, 
                        help="Camera ID for logging and output organization")
    parser.add_argument("--device", type=str, default=Config.DEVICE, 
                        help="Device to run on (cpu/cuda)")
    parser.add_argument("--no-reconnect", action="store_true",
                        help="Disable auto-reconnect for RTSP streams")
    
    args = parser.parse_args()
    
    # Determine if source is RTSP
    is_rtsp = args.source.lower().startswith("rtsp://")
    
    print(f"=" * 60)
    print(f"Violation Pipeline Starting...")
    print(f"Source: {args.source}")
    print(f"Camera ID: {args.camera_id}")
    print(f"Mode: {'RTSP Stream' if is_rtsp else 'Video File'}")
    print(f"Device: {args.device}")
    print(f"=" * 60)
    
    # Setup directories
    Config.setup()
    
    # Initialize pipeline once
    pipeline = UnifiedPipeline(camera_id=args.camera_id)
    
    if is_rtsp and not args.no_reconnect:
        # RTSP mode with auto-reconnect
        reconnect_delay = getattr(Config, 'RECONNECT_DELAY', 5)
        while True:
            try:
                print(f"\n[Camera {args.camera_id}] Connecting to RTSP stream...")
                pipeline.run_on_stream(args.source)
            except KeyboardInterrupt:
                print(f"\n[Camera {args.camera_id}] Shutdown requested.")
                break
            except Exception as e:
                print(f"\n[Camera {args.camera_id}] Stream error: {e}")
                print(f"[Camera {args.camera_id}] Reconnecting in {reconnect_delay}s...")
                time.sleep(reconnect_delay)
    else:
        # Video file or single-run RTSP
        pipeline.run_on_stream(args.source)
    
    print(f"[Camera {args.camera_id}] Pipeline stopped.")


if __name__ == "__main__":
    main()
