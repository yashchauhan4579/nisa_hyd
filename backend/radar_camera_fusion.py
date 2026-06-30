#!/usr/bin/env python3
"""
Radar-Camera Fusion Module for Speed Violation Detection

This module correlates TSC224 radar speed measurements with camera-detected
vehicles to provide accurate, legally-defensible speed violation evidence.

The radar provides accurate speed, while the camera provides:
- Vehicle type classification
- License plate recognition
- Visual evidence (snapshots/video)

Author: Traffic Analytics System
Date: December 2024
"""

import numpy as np
import time
import logging
import threading
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple, Callable
from collections import deque
from scipy.optimize import linear_sum_assignment

from radar_interface import TSC224Radar, RadarTarget, RadarFrame, RadarDirection
from violation_pipeline.config.config import Config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("RadarCameraFusion")


@dataclass
class CameraCalibration:
    """
    Camera calibration parameters for radar-camera coordinate mapping.
    
    The radar is mounted below the camera on the same pole, so we need
    to transform radar coordinates (horizontal distance, vertical distance)
    to camera pixel coordinates.
    
    Use load_from_file() to load calibration from radar_calibration.json
    """
    # Image dimensions
    frame_width: int = 3072
    frame_height: int = 2048
    
    # Radar zone center in camera pixels (from calibration tool)
    radar_center_x: int = 1536   # Where radar 0m horizontal maps to
    radar_center_y: int = 1400   # Reference Y position
    
    # Scale factors from calibration (pixels per meter)
    horizontal_scale: float = 96.0  # pixels per meter horizontally
    vertical_scale: float = 24.0    # pixels per meter (depth/perspective)
    
    # Radar detection zone bounds in camera pixels
    zone_top: int = 0
    zone_bottom: int = 2048
    zone_left: int = 0
    zone_right: int = 3072
    
    # Radar detection range (meters from radar)
    radar_min_distance: float = 5.0
    radar_max_distance: float = 50.0

    # Measurement Zone for Speed Violations (meters)
    measurement_zone_start: float = 5.0
    measurement_zone_end: float = 30.0
    
    # Maximum pixel distance for matching
    max_match_distance: float = 150.0
    
    # Legacy parameters (kept for compatibility)
    horizontal_fov: float = 60.0
    roi_top: float = 0.15
    roi_bottom: float = 0.85
    
    @classmethod
    def load_from_file(cls, filepath: str = "radar_calibration.json") -> 'CameraCalibration':
        """Load calibration from JSON file."""
        import json
        import os
        
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                
                cal = cls()
                for key, value in data.items():
                    if hasattr(cal, key):
                        setattr(cal, key, value)
                
                logger.info(f"Loaded calibration from {filepath}")
                return cal
            except Exception as e:
                logger.warning(f"Failed to load calibration: {e}, using defaults")
        
        return cls()
    
    def save_to_file(self, filepath: str = "radar_calibration.json"):
        """Save calibration to JSON file."""
        import json
        
        data = {
            "frame_width": self.frame_width,
            "frame_height": self.frame_height,
            "radar_center_x": self.radar_center_x,
            "radar_center_y": self.radar_center_y,
            "horizontal_scale": self.horizontal_scale,
            "vertical_scale": self.vertical_scale,
            "zone_top": self.zone_top,
            "zone_bottom": self.zone_bottom,
            "zone_left": self.zone_left,
            "zone_right": self.zone_right,
            "radar_min_distance": self.radar_min_distance,
            "radar_max_distance": self.radar_max_distance,
            "max_match_distance": self.max_match_distance
        }
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Saved calibration to {filepath}")
    
    def radar_to_pixel(self, horizontal_m: float, vertical_m: float) -> Tuple[int, int]:
        """
        Convert radar coordinates to camera pixel position using calibration.
        
        Uses the calibrated center position and scale factors for accurate mapping.
        
        Args:
            horizontal_m: Horizontal distance from radar center (meters, negative=left)
            vertical_m: Distance along road from radar (meters)
            
        Returns:
            Tuple of (x, y) pixel coordinates
        """
        # Horizontal: direct mapping with scale from center
        x = int(self.radar_center_x + horizontal_m * self.horizontal_scale)
        
        # Vertical: map radar distance to Y position in zone
        # Far (high distance) = top of zone, Close (low distance) = bottom
        distance_range = self.radar_max_distance - self.radar_min_distance
        zone_height = self.zone_bottom - self.zone_top
        
        # Normalize distance (0 = min distance, 1 = max distance)
        dist_normalized = (vertical_m - self.radar_min_distance) / max(distance_range, 1)
        dist_normalized = np.clip(dist_normalized, 0, 1)
        
        # Map to Y (far = top of zone, close = bottom of zone)
        y = int(self.zone_top + (1 - dist_normalized) * zone_height)
        
        # Clamp to frame bounds
        x = np.clip(x, 0, self.frame_width - 1)
        y = np.clip(y, 0, self.frame_height - 1)
        
        return (int(x), int(y))
    
    def estimate_radar_position(self, bbox_xyxy: np.ndarray) -> Tuple[float, float]:
        """
        Estimate radar coordinates from camera bounding box.
        
        This is the inverse of radar_to_pixel - used to predict where
        a camera-detected vehicle should appear in radar coordinates.
        
        Args:
            bbox_xyxy: Bounding box [x1, y1, x2, y2]
            
        Returns:
            Tuple of (horizontal_m, vertical_m) estimated radar coordinates
        """
        # Get center-bottom of bounding box (vehicle ground position)
        center_x = (bbox_xyxy[0] + bbox_xyxy[2]) / 2
        bottom_y = bbox_xyxy[3]
        
        # Estimate horizontal distance from X position using calibrated scale
        horizontal_m = (center_x - self.radar_center_x) / max(self.horizontal_scale, 1)
        
        # Estimate vertical distance from Y position
        zone_height = self.zone_bottom - self.zone_top
        distance_range = self.radar_max_distance - self.radar_min_distance
        
        # Inverse of the mapping in radar_to_pixel
        # y = zone_top + (1 - dist_normalized) * zone_height
        # Solve for dist_normalized:
        dist_normalized = 1.0 - (bottom_y - self.zone_top) / max(zone_height, 1)
        dist_normalized = np.clip(dist_normalized, 0, 1)
        
        vertical_m = self.radar_min_distance + dist_normalized * distance_range
        
        return (horizontal_m, vertical_m)


@dataclass
class FusedVehicle:
    """
    Represents a vehicle with fused radar and camera data.
    """
    # Camera tracking info
    camera_track_id: int
    bbox: np.ndarray  # [x1, y1, x2, y2]
    camera_class_id: int
    camera_confidence: float
    
    # Radar info (if matched)
    radar_target_id: Optional[int] = None
    radar_speed_kmh: Optional[float] = None
    radar_direction: Optional[RadarDirection] = None
    radar_horizontal_m: Optional[float] = None
    radar_vertical_m: Optional[float] = None
    radar_energy: Optional[int] = None
    
    # Plate Info
    plate_text: Optional[str] = None
    plate_conf: float = 0.0
    plate_bbox: Optional[List[float]] = None
    
    # Fusion quality
    match_confidence: float = 0.0  # 0-1 confidence of radar-camera match
    speed_source: str = "none"  # "radar", "camera", or "none"
    
    # Violation status
    is_violation: bool = False
    violation_speed: float = 0.0
    consecutive_violations: int = 0
    
    # Timestamps
    first_seen: float = field(default_factory=time.time)
    last_updated: float = field(default_factory=time.time)
    
    @property
    def has_radar_match(self) -> bool:
        return self.radar_target_id is not None and self.radar_speed_kmh is not None
    
    @property
    def speed(self) -> float:
        """Get the best available speed estimate."""
        if self.has_radar_match:
            return self.radar_speed_kmh
        return 0.0
    
    @property
    def is_approaching(self) -> bool:
        if self.radar_direction:
            return self.radar_direction == RadarDirection.APPROACHING
        return False


class RadarCameraFusion:
    """
    Fuses radar speed measurements with camera vehicle detections.
    
    The algorithm:
    1. Receives radar targets with (speed, horizontal_pos, vertical_pos, id)
    2. Receives camera detections with (bbox, class, track_id)
    3. Converts both to a common coordinate frame
    4. Uses Hungarian algorithm for optimal matching
    5. Applies temporal consistency for robust associations
    """
    
    def __init__(self,
                 radar: TSC224Radar,
                 calibration: CameraCalibration = None,
                 calibration_file: str = "radar_calibration.json",
                 speed_limit: float = 60.0,
                 consecutive_violations_threshold: int = 5,
                 max_match_distance: float = None,  # pixels, loaded from calibration
                 max_time_offset: float = 0.2,  # seconds
                 history_size: int = 30):
        """
        Initialize fusion module.
        
        Args:
            radar: Connected TSC224Radar instance
            calibration: Camera calibration parameters (or load from file)
            calibration_file: Path to calibration JSON file
            speed_limit: Speed limit for violations (km/h)
            consecutive_violations_threshold: Consecutive frames above limit to confirm violation
            max_match_distance: Maximum pixel distance for radar-camera matching
            max_time_offset: Maximum time difference for matching (seconds)
            history_size: Number of frames to keep in history
        """
        self.radar = radar
        
        # Load calibration from file if not provided
        if calibration is not None:
            self.calibration = calibration
        else:
            self.calibration = CameraCalibration.load_from_file(calibration_file)
        
        self.speed_limit = speed_limit
        self.consecutive_threshold = consecutive_violations_threshold
        
        # Use calibrated match distance if not explicitly provided
        self.max_match_distance = max_match_distance if max_match_distance is not None else self.calibration.max_match_distance
        self.max_time_offset = max_time_offset
        
        logger.info(f"Fusion initialized with max_match_distance: {self.max_match_distance}px")
        
        # Fused vehicle tracking
        self._fused_vehicles: Dict[int, FusedVehicle] = {}  # camera_track_id -> FusedVehicle
        self._radar_to_camera_map: Dict[int, int] = {}  # radar_target_id -> camera_track_id
        self._lock = threading.Lock()
        
        # History for temporal consistency
        self._match_history: Dict[Tuple[int, int], deque] = {}  # (camera_id, radar_id) -> confidence history
        self._history_size = history_size
        
        # Violation tracking
        self._confirmed_violations: set = set()  # Set of camera_track_ids with confirmed violations
        self._violation_callback: Optional[Callable[[FusedVehicle], None]] = None
        
        # Statistics
        self._frames_processed = 0
        self._successful_matches = 0
        self._total_detections = 0
        
        logger.info(f"Radar-Camera Fusion initialized")
        logger.info(f"Speed limit: {speed_limit} km/h | Violation threshold: {consecutive_violations_threshold} frames")
    
    def set_violation_callback(self, callback: Callable[[FusedVehicle], None]):
        """Set callback for when a violation is confirmed."""
        self._violation_callback = callback
    
    def process_frame(self, 
                      camera_detections: List[Dict],
                      timestamp: float = None) -> List[FusedVehicle]:
        """
        Process a frame of camera detections and fuse with radar data.
        
        Args:
            camera_detections: List of dicts with keys:
                - 'track_id': int
                - 'bbox': np.ndarray [x1, y1, x2, y2]
                - 'class_id': int
                - 'confidence': float
            timestamp: Frame timestamp (defaults to current time)
            
        Returns:
            List of FusedVehicle objects with radar data matched where possible
        """
        if timestamp is None:
            timestamp = time.time()
        
        self._frames_processed += 1
        
        # Get current radar targets
        radar_frame = self.radar.get_current_frame()
        radar_targets = radar_frame.targets if radar_frame else []
        
        # Filter radar targets by age (only use recent readings)
        if radar_frame:
            radar_age = timestamp - radar_frame.timestamp
            if radar_age > self.max_time_offset:
                logger.debug(f"Radar data too old ({radar_age:.3f}s), skipping fusion")
                radar_targets = []
        
        # Match radar targets to camera detections
        matches = self._match_radar_to_camera(radar_targets, camera_detections)
        
        # Update fused vehicles
        fused_vehicles = []
        
        with self._lock:
            for det in camera_detections:
                track_id = det['track_id']
                self._total_detections += 1
                
                # Get or create fused vehicle
                if track_id not in self._fused_vehicles:
                    self._fused_vehicles[track_id] = FusedVehicle(
                        camera_track_id=track_id,
                        bbox=det['bbox'],
                        camera_class_id=det['class_id'],
                        camera_confidence=det['confidence']
                    )
                
                vehicle = self._fused_vehicles[track_id]
                vehicle.bbox = det['bbox']
                vehicle.camera_class_id = det['class_id']
                vehicle.camera_confidence = det['confidence']
                vehicle.last_updated = timestamp
                
                # Check if this detection has a radar match
                if track_id in matches:
                    radar_target, match_confidence = matches[track_id]
                    
                    vehicle.radar_target_id = radar_target.target_id
                    vehicle.radar_speed_kmh = radar_target.speed_kmh
                    vehicle.radar_direction = radar_target.direction
                    vehicle.radar_horizontal_m = radar_target.horizontal_distance_m
                    vehicle.radar_vertical_m = radar_target.vertical_distance_m
                    vehicle.radar_energy = radar_target.echo_energy
                    vehicle.match_confidence = match_confidence
                    vehicle.speed_source = "radar"
                    
                    self._successful_matches += 1
                    
                    # Update radar-to-camera mapping
                    self._radar_to_camera_map[radar_target.target_id] = track_id
                    
                    # Check for violation
                    self._check_speed_violation(vehicle)
                else:
                    # No radar match - keep previous radar data if recent
                    if vehicle.radar_target_id is not None:
                        # Check if radar target is still being tracked
                        radar_target = next((t for t in radar_targets 
                                            if t.target_id == vehicle.radar_target_id), None)
                        if radar_target:
                            # Update with new radar data
                            vehicle.radar_speed_kmh = radar_target.speed_kmh
                            vehicle.radar_direction = radar_target.direction
                            vehicle.match_confidence *= 0.9  # Decay confidence
                        else:
                            # Radar target lost
                            vehicle.match_confidence *= 0.8
                            
                            if vehicle.match_confidence < 0.3:
                                # Clear radar association
                                vehicle.radar_target_id = None
                                vehicle.speed_source = "none"
                
                fused_vehicles.append(vehicle)
            
            # Cleanup old tracks
            self._cleanup_old_tracks(timestamp)
        
        return fused_vehicles
    
    def _match_radar_to_camera(self, 
                                radar_targets: List[RadarTarget],
                                camera_detections: List[Dict]) -> Dict[int, Tuple[RadarTarget, float]]:
        """
        Match radar targets to camera detections using Hungarian algorithm.
        
        Returns:
            Dict mapping camera_track_id to (RadarTarget, match_confidence)
        """
        if not radar_targets or not camera_detections:
            return {}
        
        n_radar = len(radar_targets)
        n_camera = len(camera_detections)
        
        # Dynamic matching threshold (10% of frame width)
        # This adapts to 1080p, 4k, etc. automatically
        dynamic_match_dist = self.calibration.frame_width * 0.10
        
        # Build cost matrix
        cost_matrix = np.full((n_camera, n_radar), dynamic_match_dist * 2)
        
        for i, det in enumerate(camera_detections):
            bbox = det['bbox']
            cam_x = (bbox[0] + bbox[2]) / 2
            cam_y = bbox[3]
            
            # Estimate where this camera detection would appear in radar coordinates
            est_horiz, est_vert = self.calibration.estimate_radar_position(bbox)
            
            for j, radar in enumerate(radar_targets):
                # Convert radar position to pixel coordinates
                radar_x, radar_y = self.calibration.radar_to_pixel(
                    radar.horizontal_distance_m, 
                    radar.vertical_distance_m
                )
                
                # FILTER: Only consider radar targets within valid measurement range
                # Prevents matching very distant fast vehicles to nearby stationary ones
                if radar.vertical_distance_m < 2.0 or radar.vertical_distance_m > 80.0:
                    continue
                
                # Check if radar target is even on screen (with margin)
                # If radar target projects way off screen, don't match it
                margin = dynamic_match_dist
                if (radar_x < -margin or radar_x > self.calibration.frame_width + margin or
                    radar_y < -margin or radar_y > self.calibration.frame_height + margin):
                    continue
                
                # Calculate pixel distance
                pixel_distance = np.sqrt((cam_x - radar_x)**2 + (cam_y - radar_y)**2)
                
                # Also consider coordinate-space distance
                coord_distance = np.sqrt(
                    (est_horiz - radar.horizontal_distance_m)**2 + 
                    (est_vert - radar.vertical_distance_m)**2
                )
                
                # Combined cost (weighted)
                cost = pixel_distance * 0.7 + coord_distance * 10 * 0.3
                
                # Apply temporal consistency bonus
                match_key = (det['track_id'], radar.target_id)
                if match_key in self._match_history:
                    history_bonus = len(self._match_history[match_key]) * 5
                    cost -= history_bonus
                
                # Apply previous association bonus
                if (det['track_id'] in self._fused_vehicles and 
                    self._fused_vehicles[det['track_id']].radar_target_id == radar.target_id):
                    cost -= 30  # Strong bonus for maintaining association
                
                cost_matrix[i, j] = max(0, cost)
        
        # Hungarian algorithm for optimal matching
        row_indices, col_indices = linear_sum_assignment(cost_matrix)
        
        matches = {}
        for i, j in zip(row_indices, col_indices):
            if cost_matrix[i, j] < dynamic_match_dist:
                track_id = camera_detections[i]['track_id']
                radar_target = radar_targets[j]
                
                # Calculate match confidence
                confidence = 1.0 - (cost_matrix[i, j] / dynamic_match_dist)
                confidence = np.clip(confidence, 0, 1)
                
                # Update match history
                match_key = (track_id, radar_target.target_id)
                if match_key not in self._match_history:
                    self._match_history[match_key] = deque(maxlen=self._history_size)
                self._match_history[match_key].append(confidence)
                
                # Boost confidence based on history
                if len(self._match_history[match_key]) >= 3:
                    avg_hist_conf = sum(self._match_history[match_key]) / len(self._match_history[match_key])
                    confidence = 0.7 * confidence + 0.3 * avg_hist_conf
                
                matches[track_id] = (radar_target, confidence)
        
        return matches
    
    def _check_speed_violation(self, vehicle: FusedVehicle):
        """Check if vehicle is violating speed limit."""
        if not vehicle.has_radar_match:
            return
        
        check_speed = vehicle.radar_speed_kmh
        dist = vehicle.radar_vertical_m if vehicle.radar_vertical_m else 0
        
        # DEBUG: Log all tracked vehicles with radar match
        if vehicle.camera_track_id % 10 == 0:  # Log every 10th vehicle to reduce spam
            # logger.info(f"🚗 Tracking V{vehicle.camera_track_id}: {check_speed:.1f} km/h @ {dist:.1f}m (Limit: {self.speed_limit})")
            pass
        
        # Speed violation logic
        if check_speed > self.speed_limit:
            vehicle.consecutive_violations += 1
            vehicle.is_potential_violation = True
            
            # DEBUG: Log when vehicle starts speeding
            if vehicle.consecutive_violations == 1:
                logger.debug(f"⚡ V{vehicle.camera_track_id} SPEEDING: {check_speed:.1f} km/h")
            
            # Check threshold
            if vehicle.consecutive_violations >= self.consecutive_threshold:
                if vehicle.camera_track_id not in self._confirmed_violations:
                    # Mark and save immediately
                    self._confirmed_violations.add(vehicle.camera_track_id)
                    vehicle.is_violation = True
                    vehicle.violation_speed = check_speed
                    
                    logger.warning(f"🚨 VIOLATION: Track {vehicle.camera_track_id} | "
                                  f"Speed: {check_speed:.1f} km/h | Dist: {dist:.1f}m | "
                                  f"Plate: {getattr(vehicle, 'plate_text', None) or 'NONE'}")
                    
                    if self._violation_callback:
                        try:
                            self._violation_callback(vehicle)
                        except Exception as e:
                            logger.error(f"Violation callback error: {e}")
                else:
                    vehicle.is_violation = True
        else:
            # Speed back to normal
            if vehicle.consecutive_violations > 0:
                vehicle.consecutive_violations = max(0, vehicle.consecutive_violations - 1)
    
    def _cleanup_old_tracks(self, current_time: float, max_age: float = 5.0):
        """Remove tracks that haven't been updated recently."""
        tracks_to_remove = []
        
        for track_id, vehicle in self._fused_vehicles.items():
            if current_time - vehicle.last_updated > max_age:
                tracks_to_remove.append(track_id)
        
        for track_id in tracks_to_remove:
            if track_id in self._fused_vehicles:
                vehicle = self._fused_vehicles[track_id]
                if vehicle.radar_target_id in self._radar_to_camera_map:
                    del self._radar_to_camera_map[vehicle.radar_target_id]
                del self._fused_vehicles[track_id]
        
        # Cleanup match history
        keys_to_remove = []
        for key in self._match_history:
            if key[0] not in self._fused_vehicles:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self._match_history[key]
    
    def get_vehicle(self, camera_track_id: int) -> Optional[FusedVehicle]:
        """Get fused vehicle by camera track ID."""
        with self._lock:
            return self._fused_vehicles.get(camera_track_id)
    
    def get_all_vehicles(self) -> List[FusedVehicle]:
        """Get all currently tracked fused vehicles."""
        with self._lock:
            return list(self._fused_vehicles.values())
    
    def get_violations(self) -> List[FusedVehicle]:
        """Get all vehicles with confirmed violations."""
        with self._lock:
            return [v for v in self._fused_vehicles.values() if v.is_violation]
    
    def get_statistics(self) -> dict:
        """Get fusion statistics."""
        with self._lock:
            match_rate = self._successful_matches / max(1, self._total_detections)
            return {
                "frames_processed": self._frames_processed,
                "total_detections": self._total_detections,
                "successful_matches": self._successful_matches,
                "match_rate": match_rate,
                "active_tracks": len(self._fused_vehicles),
                "confirmed_violations": len(self._confirmed_violations),
                "radar_connected": self.radar.is_connected,
                "speed_limit": self.speed_limit
            }


# =============================================================================
# Demo/Test Code
# =============================================================================

def demo_fusion():
    """Demonstrate fusion with simulated camera data."""
    print("\n" + "="*80)
    print("RADAR-CAMERA FUSION DEMO")
    print("="*80 + "\n")
    
    # Initialize radar
    radar = TSC224Radar(
        ip=Config.RADAR_IP,
        port=Config.RADAR_PORT,
        speed_limit=Config.SPEED_LIMIT,
        min_speed_threshold=Config.MIN_SPEED_THRESHOLD
    )
    
    # Initialize fusion
    fusion = RadarCameraFusion(
        radar=radar,
        speed_limit=Config.SPEED_LIMIT,
        consecutive_violations_threshold=5
    )
    
    def on_violation(vehicle: FusedVehicle):
        print(f"\n🚨 VIOLATION CALLBACK:")
        print(f"   Camera Track: {vehicle.camera_track_id}")
        print(f"   Radar Speed: {vehicle.radar_speed_kmh:.1f} km/h")
        print(f"   Direction: {vehicle.radar_direction.value if vehicle.radar_direction else 'unknown'}")
    
    fusion.set_violation_callback(on_violation)
    
    if not radar.start():
        print("Failed to connect to radar!")
        return
    
    print("✅ Radar connected, starting fusion demo...")
    print("Simulating camera detections...\n")
    
    try:
        frame_count = 0
        while True:
            frame_count += 1
            
            # Simulate camera detections (in real use, this comes from YOLO)
            # We'll create fake bounding boxes based on radar positions
            radar_frame = radar.get_current_frame()
            
            if radar_frame and radar_frame.targets:
                simulated_detections = []
                calibration = fusion.calibration
                
                for target in radar_frame.targets:
                    # Convert radar position to pixel
                    px, py = calibration.radar_to_pixel(
                        target.horizontal_distance_m,
                        target.vertical_distance_m
                    )
                    
                    # Create a fake bounding box around this position
                    box_width = 100
                    box_height = 80
                    bbox = np.array([
                        px - box_width/2,
                        py - box_height,
                        px + box_width/2,
                        py
                    ])
                    
                    simulated_detections.append({
                        'track_id': target.target_id,  # Use radar ID as track ID for demo
                        'bbox': bbox,
                        'class_id': 2,  # car
                        'confidence': 0.9
                    })
                
                # Process frame
                fused_vehicles = fusion.process_frame(simulated_detections)
                
                # Print status
                if fused_vehicles:
                    print(f"\nFrame {frame_count} | {len(fused_vehicles)} vehicles")
                    for v in fused_vehicles:
                        match_status = "✓" if v.has_radar_match else "✗"
                        violation_status = "⚠️ VIOLATION" if v.is_violation else ""
                        speed_str = f"{v.radar_speed_kmh:.1f} km/h" if v.has_radar_match else "N/A"
                        print(f"  [{match_status}] Track {v.camera_track_id}: {speed_str} {violation_status}")
            else:
                print(f"Frame {frame_count} | No radar targets")
            
            time.sleep(0.1)  # ~10 FPS
            
            if frame_count % 50 == 0:
                stats = fusion.get_statistics()
                print(f"\n📊 Stats: Match rate: {stats['match_rate']*100:.1f}% | "
                      f"Violations: {stats['confirmed_violations']}")
            
    except KeyboardInterrupt:
        print("\n\nStopping demo...")
    
    finally:
        radar.stop()
        stats = fusion.get_statistics()
        print("\n" + "="*80)
        print("FINAL STATISTICS")
        print("="*80)
        print(f"Frames processed: {stats['frames_processed']}")
        print(f"Match rate: {stats['match_rate']*100:.1f}%")
        print(f"Confirmed violations: {stats['confirmed_violations']}")


if __name__ == "__main__":
    demo_fusion()

