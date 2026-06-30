import sys
import time
import threading
from unittest.mock import MagicMock

# Ensure we can import modules from root
sys.path.append(".")

from violation_pipeline.pipeline import UnifiedPipeline
from radar_interface import TSC224Radar, RadarFrame, RadarTarget, RadarDirection
from violation_pipeline.config.config import Config

# Mock Radar Class
class MockRadar(TSC224Radar):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._running = False
        
    def connect(self):
        print(">>> MOCK RADAR: Connection simulation SUCCESS.")
        return True
    
    def start(self):
        self._running = True
        print(">>> MOCK RADAR: Started generating synthetic target data.")
        return True
        
    def get_current_frame(self):
        # Generate fake targets roughly matching where vehicles appear in camera_113
        # In this video, vehicles move away/towards camera in the center lanes.
        t = time.time()
        targets = []
        
        # Target 1: Speeding Vehicle (55 km/h)
        # Position: Center of lane (approx 0m horizontal), Distance varying
        targets.append(RadarTarget(
            target_id=99,
            speed_kmh=55.0, # VIOLATION! (Limit is 30)
            direction=RadarDirection.APPROACHING,
            horizontal_distance_m=-1.0, # Slightly left
            vertical_distance_m=10.0 + (t % 20), # Moving 10m -> 30m
            echo_energy=100,
            raw_speed=550
        ))
        
        # Target 2: Normal Vehicle (20 km/h)
        targets.append(RadarTarget(
            target_id=100,
            speed_kmh=20.0,
            direction=RadarDirection.RECEDING,
            horizontal_distance_m=2.0,
            vertical_distance_m=15.0 + (t % 15),
            echo_energy=80,
            raw_speed=-200
        ))
        
        return RadarFrame(
            frame_number=int(t),
            targets=targets,
            timestamp=t,
            checksum_valid=True
        )

# Main Verification Logic
def verify_fusion():
    print("Initializing Pipeline with Mock Radar...")
    
    # 1. Initialize Pipeline
    pipeline = UnifiedPipeline()
    
    # 2. Inject Mock Radar
    # We must replace the radar instance AND update the fusion engine's reference
    mock_radar = MockRadar(ip="0.0.0.0", port=0)
    pipeline.radar = mock_radar
    pipeline.fusion.radar = mock_radar # Critical: Fusion needs the mock ref
    
    # 3. Increase Match Distance for Test
    # Since visual matching is hard with fake data, we make the fusion very generous
    pipeline.fusion.max_match_distance = 1000.0 
    
    print("Starting Video Processing...")
    try:
        pipeline.run_on_video("/Users/atulsah/Downloads/camera_113_recording.mp4")
    except KeyboardInterrupt:
        print("Stopped.")

if __name__ == "__main__":
    verify_fusion()
