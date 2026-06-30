
import cv2
import time
import torch
import threading
import numpy as np
# import concurrent.futures
from collections import defaultdict, deque
from datetime import datetime

from violation_pipeline.config.config import Config
from violation_pipeline.src.core.detector import Detector
from violation_pipeline.src.core.ocr import OCRRecognizer
from violation_pipeline.src.core.tracker import Tracker
from violation_pipeline.src.logic.association import Associator
from violation_pipeline.src.logic.violations import ViolationManager
from violation_pipeline.src.core.age_estimator import AgeEstimator
from violation_pipeline.src.core.shared_models import SharedModels
from violation_pipeline.src.utils.snapshot_quality import select_best_snapshot
# Radar Integration
from radar_interface import TSC224Radar
from radar_camera_fusion import RadarCameraFusion, FusedVehicle
from violation_pipeline.src.results_io.saver import SnapshotSaver
from violation_pipeline.src.results_io.visualizer import Visualizer
# Multi-mode API clients
from violation_pipeline.central_server_client import (
    send_vcc_event_async,
    send_anpr_detection_async
)


def map_vehicle_class_name(yolo_class_name: str) -> str:
    """Map YOLO class names to dashboard convention.
    
    Args:
        yolo_class_name: Class name from YOLO model (motorcycle, car, auto, truck, bus, plate)
        
    Returns:
        Dashboard class name (2W, 4W, AUTO, TRUCK, BUS, UNKNOWN)
    """
    mapping = {
        'motorcycle': '2W',  # 2 Wheeler
        'car': '4W',          # 4 Wheeler
        'auto': 'AUTO',       # Auto rickshaw
        'truck': 'TRUCK',     # Truck
        'bus': 'BUS',         # Bus
        'plate': 'UNKNOWN',   # Ignore plates
    }
    return mapping.get(yolo_class_name.lower(), 'UNKNOWN')


class UnifiedPipeline:
    def __init__(self, camera_id=1, camera_name=None, config=None, frame_callback=None, shared_models=None):
        self.camera_id = camera_id
        self.camera_name = camera_name or f"CAMERA_{camera_id}"
        self.config = config or {}
        self.frame_callback = frame_callback

        # Multi-mode detection configuration
        self.enabled_modes = self.config.get('enabled_modes', Config.ENABLED_DETECTION_MODES)
        self.enabled_violations = self.config.get('enabled_violations', ["helmet", "triple_riding"])

        print(f"Initializing Unified Pipeline (Camera {self.camera_name})...")
        print(f"Enabled Detection Modes: {self.enabled_modes}")
        print(f"Enabled Violations: {self.enabled_violations}")

        # 1. Initialize Components
        # When `shared_models` is provided, reuse the process-wide instances.
        # This turns N x (detector+ocr+age) memory into 1 x. Each camera thread
        # still owns its own tracker + buffers; those are tiny per-camera state.
        if shared_models is not None:
            self.detector_traffic = shared_models.detector_traffic
            self.detector_violation = shared_models.detector_violation
            self.detector_mobile = shared_models.detector_mobile
            self.ocr = shared_models.ocr
            self._gpu_lock = shared_models.gpu_lock
            self._shared = shared_models
        else:
            self.detector_traffic = Detector(Config.MODEL_TRAFFIC, Config.DEVICE)
            self.detector_violation = Detector(Config.MODEL_VIOLATION, Config.DEVICE)
            self.detector_mobile = Detector(Config.MODEL_MOBILE, Config.DEVICE)
            self.ocr = OCRRecognizer()
            self._gpu_lock = threading.Lock()
            self._shared = None
        print(f"Traffic Model Classes: {self.detector_traffic.model.names}")
        print(f"Violation Model Classes: {self.detector_violation.model.names}")

        # Trackers are per-camera state (not shareable).
        self.tracker_traffic = Tracker()
        self.tracker_violation = Tracker()

        self.violation_manager = ViolationManager()

        if "minor_rider" in self.enabled_violations:
            if shared_models is not None:
                self.age_estimator = shared_models.get_age_estimator()
            else:
                self.age_estimator = AgeEstimator(device=Config.DEVICE)
            print("Minor rider detection enabled")
        else:
            self.age_estimator = None
        
        # Executor for parallel inference
        # self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        # DISABLE PARALLEL EXECUTION: Causing NVML/CUDA memory crashes on Jetson
        
        # Throttling state for OCR
        self.last_ocr_frames = {} # {vehicle_id: frame_idx}
        
        # Radar Setup (only if enabled and this is the MAIN_GATE)
        # Radar Setup (only if enabled and this is the MAIN_GATE)
        # Restricted to Camera 1 / Main Gate to prevent conflicts
        if Config.RADAR_ENABLED and (str(self.camera_id) == '1'):
            self.radar = TSC224Radar(
                ip=Config.RADAR_IP,
                port=Config.RADAR_PORT,
                speed_limit=Config.SPEED_LIMIT
            )
            self.fusion = RadarCameraFusion(
                radar=self.radar,
                speed_limit=Config.SPEED_LIMIT,
            )
            # Attempt to start radar (non-blocking if handled internally, but let's be safe)
            try:
                connected = self.radar.connect()
                if connected:
                    self.radar.start()
                    print("✓ Radar connected and active")
                else:
                    print("Warning: Radar connection failed. Pipeline will run but fusion will be limited.")
            except Exception as e:
                print(f"Warning: Radar init failed: {e}")
        else:
            # Radar disabled or not the master camera
            if Config.RADAR_ENABLED:
                print(f"ℹ Radar disabled for Camera {self.camera_id} (Only active on Camera 1)")
            else:
                print("ℹ Radar disabled in config")
                
            self.radar = None
            self.fusion = None
            
        self.saver = SnapshotSaver(camera_id=camera_id, camera_name=self.camera_name)
        self.visualizer = Visualizer()
        
        # 2. State Management - Violation Mode
        # Keep track of active violations to avoid spamming save (one save per violation instance)
        self.processed_violations = set() # {f"{violation_type}_{rider_id}"}
        
        # Snapshot buffering: store recent frames per rider for best-frame selection
        # Structure: {rider_id: deque([(frame, bbox, confidence), ...], maxlen=BUFFER_SIZE)}
        self.rider_snapshot_buffers = {}
        # NEW: Snapshot buffering for vehicles (for Seatbelt/Speed violations)
        self.vehicle_snapshot_buffers = {}
        
        # Speed Violation Buffer (Wait for Plate)
        self.pending_speed_violations = {} # {track_id: {start_time, vehicle_data, frame, ...}}
        
        # 3. State Management - VCC Mode
        self.vcc_counts = defaultdict(int)  # Current frame: {class_name: count}
        self.vcc_total_counts = defaultdict(int)  # Session totals
        self.vcc_seen_vehicles = set()  # Track unique vehicle IDs for session totals
        
        # 4. State Management - ANPR Mode
        self.anpr_sent_vehicles = {}  # {track_id: timestamp} - dedupe tracking
        
        # 5. State Management - Wrong Side Detection (Vision-Based)
        self.vehicle_positions = {}  # {track_id: deque([(frame_idx, center_y), ...], maxlen=5)}
        
    def _cleanup_tracking_dicts(self, current_frame_idx):
        """Periodically clean tracking dictionaries to prevent memory leaks."""
        # Keep only recent entries to prevent unbounded growth
        MAX_VIOLATIONS = 1000
        MAX_TRACKING_AGE = 100  # frames
        
        # 1. Limit processed violations set
        if len(self.processed_violations) > MAX_VIOLATIONS:
            # Clear oldest half to avoid complete reset
            violations_list = list(self.processed_violations)
            self.processed_violations = set(violations_list[-500:])
        
        # 2. Clean old vehicle positions
        old_ids = [tid for tid, positions in self.vehicle_positions.items() 
                   if positions and (current_frame_idx - positions[-1][0]) > MAX_TRACKING_AGE]
        for tid in old_ids:
            del self.vehicle_positions[tid]
        
        # 3. Clean old OCR frames
        old_ids = [vid for vid, last_frame in self.last_ocr_frames.items() 
                   if (current_frame_idx - last_frame) > MAX_TRACKING_AGE]
        for vid in old_ids:
            del self.last_ocr_frames[vid]
        
        # 4. Clean old ANPR tracking
        import time
        current_time = time.time()
        old_ids = [vid for vid, timestamp in self.anpr_sent_vehicles.items() 
                   if (current_time - timestamp) > 60]  # 60 seconds
        for vid in old_ids:
            del self.anpr_sent_vehicles[vid]
        
        # 5. Limit VCC seen vehicles
        if len(self.vcc_seen_vehicles) > 5000:
            self.vcc_seen_vehicles.clear()
        
        # 6. Clean snapshot buffers - should be empty if videos disabled
        if self.rider_snapshot_buffers:
            logger.warning(f"Rider snapshot buffers unexpectedly populated: {len(self.rider_snapshot_buffers)} buffers - clearing")
            self.rider_snapshot_buffers.clear()
        
        if self.vehicle_snapshot_buffers:
            logger.warning(f"Vehicle snapshot buffers unexpectedly populated: {len(self.vehicle_snapshot_buffers)} buffers - clearing")
            self.vehicle_snapshot_buffers.clear()
    
    def _point_in_polygon(self, x, y, polygon):
        """Check if point (x, y) is inside polygon using ray casting algorithm."""
        if not polygon or len(polygon) < 3:
            return False
        inside = False
        n = len(polygon)
        j = n - 1
        for i in range(n):
            xi, yi = polygon[i][0], polygon[i][1]
            xj, yj = polygon[j][0], polygon[j][1]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside
        
    def run_on_stream(self, source):
        """
        Process video file or RTSP stream.
        Args:
            source: Path to video file or RTSP URL
        """
        is_rtsp = source.lower().startswith("rtsp://")
        
        # Configure VideoCapture - Use FFMPEG for better quality (matches old working pipeline)
        cap = None
        if is_rtsp:
            import os
            print(f"[{self.camera_name}] Using FFMPEG for RTSP stream (optimized for quality)...", flush=True)
            # Optimized FFMPEG settings for QUALITY + STABILITY
            # - TCP transport for reliability
            # - 512KB buffer (reduced from 2MB to save RAM)
            # RTSP Configuration (FFMPEG)
            # Increased buffer to 4MB to prevent 'Could not find ref' HEVC crashes
            if 'OPENCV_FFMPEG_CAPTURE_OPTIONS' not in os.environ:
                os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|buffer_size;4096000|max_delay;5000000'
            # Use FFMPEG backend for reliable RTSP handling with high quality
            cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
            
            # Quality-optimized OpenCV settings
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)  # Slightly larger buffer for quality
            # Request highest quality frame format if available
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))  # Prefer motion JPEG (less compression)
            
            print(f"  → RTSP configured: TCP transport, 2MB buffer, MJPEG codec preference", flush=True)
        else:
            cap = cv2.VideoCapture(source)
            
        if not cap.isOpened():
            raise ConnectionError(f"Could not open source: {source}")
            
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames < 0 or total_frames > 1000000 or is_rtsp:
            total_str = "Live Stream"
            total_frames = float('inf')
        else:
            total_str = f"{total_frames} frames"
        
        frame_idx = 0
        fps_start_time = time.time()
        fps_frame_count = 0
        current_fps = 0.0
        
        print(f"[Camera {self.camera_id}] Starting processing on {source} ({total_str})...")
        
        while True:
            try:
                ret, frame = cap.read()
                if not ret:
                    if is_rtsp:
                        print(f"[Camera {self.camera_id}] Connection lost. Reconnecting in {Config.RECONNECT_DELAY}s...", flush=True)
                        cap.release()
                        time.sleep(Config.RECONNECT_DELAY)
                        try:
                            # Re-initialize capture with same settings
                            if 'OPENCV_FFMPEG_CAPTURE_OPTIONS' not in os.environ:
                                os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|buffer_size;4096000|max_delay;5000000'
                            cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                            cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)
                            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                            if not cap.isOpened():
                                print(f"  → Reconnection failed.", flush=True)
                            else:
                                print(f"  → Reconnected!", flush=True)
                        except Exception as e:
                            print(f"  → Reconnection error: {e}", flush=True)
                        continue
                    else:
                        print(f"Stream or file ended at frame {frame_idx}.")
                        break
                    
                if frame is None:
                    print(f"Warning: Received empty frame at index {frame_idx}. Skipping.")
                    continue
                    
                # Frame Skipping logic (0 = process all)
                if frame_idx % (Config.FRAME_SKIP + 1) != 0:
                    continue

                frame_idx += 1
                
                # CRITICAL: Periodic memory cleanup every 500 frames
                if frame_idx % 500 == 0:
                    self._cleanup_tracking_dicts(frame_idx)
            
                # --- 1. Detection (single combined model) ---
                # One forward pass through the unified 10-class engine —
                # the THROUGHPUT WIN. We submit at CONF_PLATE (the lowest
                # per-class threshold) so nothing is dropped before the
                # class-split filter applies per-class thresholds below.
                with self._gpu_lock:
                    all_dets = self.detector_traffic.detect(frame, Config.CONF_PLATE)

                # --- 2. Filtering & Tracking (split by class) ---
                # Motorcycle goes to BOTH the traffic stream (tracked as a
                # vehicle) and the violation stream (rider anchor for
                # helmet / triple-riding checks). Each class carries its
                # own confidence threshold from Config.
                traffic_for_tracking = []
                plates_raw = []
                detections_violation = []
                for d in all_dets:
                    cls_id = int(d[5]); conf = float(d[4])
                    if cls_id == Config.CLASS_PLATE:
                        if conf >= Config.CONF_PLATE: plates_raw.append(d)
                    elif cls_id in (Config.CLASS_AUTO, Config.CLASS_BUS, Config.CLASS_CAR, Config.CLASS_TRUCK):
                        if conf >= Config.CONF_VEHICLE: traffic_for_tracking.append(d)
                    elif cls_id == Config.CLASS_MOTORCYCLE:
                        if conf >= Config.CONF_VEHICLE: traffic_for_tracking.append(d)
                        if conf >= Config.CONF_RIDER:   detections_violation.append(d)
                    elif cls_id == Config.CLASS_HELMET:
                        if conf >= Config.CONF_HELMET: detections_violation.append(d)
                    elif cls_id == Config.CLASS_NO_HELMET:
                        if conf >= Config.CONF_NO_HELMET: detections_violation.append(d)
                    elif cls_id == Config.CLASS_SEATBELT:
                        if conf >= Config.CONF_SEATBELT: detections_violation.append(d)
                    elif cls_id == Config.CLASS_NO_SEATBELT:
                        if conf >= Config.CONF_NO_SEATBELT: detections_violation.append(d)
                
                sv_tracks_traffic = self.tracker_traffic.update(traffic_for_tracking)
                
                # --- NEW: Radar Fusion (only if enabled) ---
                fused_vehicles = []
                if self.fusion is not None:
                    # Prepare camera detections for fusion
                    camera_detections = []
                    if sv_tracks_traffic.tracker_id is not None:
                         for i, tid in enumerate(sv_tracks_traffic.tracker_id):
                            bbox = sv_tracks_traffic.xyxy[i]
                            cls_id = int(sv_tracks_traffic.class_id[i])
                            conf = float(sv_tracks_traffic.confidence[i]) if sv_tracks_traffic.confidence is not None else 1.0
                            
                            camera_detections.append({
                                'track_id': int(tid),
                                'bbox': bbox,
                                'class_id': cls_id,
                                'confidence': conf
                            })
                    
                    # FUSE!
                    fused_vehicles = self.fusion.process_frame(camera_detections)
                
                # Check & Save Traffic Violations (only if radar/fusion enabled)
                for vehicle in fused_vehicles:
                    tid = vehicle.camera_track_id
                    
                    # A. Speed Violation (from Radar)
                    # A. Speed Violation (from Radar)
                    if "speed" in self.enabled_violations and vehicle.is_violation:
                         viol_key = f"speed_vehicle_{tid}"
                         if viol_key not in self.processed_violations:
                             # Buffer the violation instead of saving immediately
                             if tid not in self.pending_speed_violations:
                                 print(f"Vehicle {tid}: Confirmed RADAR SPEED violation! Bufering for plate...", flush=True)
                                 self.pending_speed_violations[tid] = {
                                     'start_time': time.time(),
                                     'vehicle_data': vehicle, # Snapshot of vehicle data at violation time
                                     'frame': frame.copy(),   # Save the violation frame
                                     'frame_idx': frame_idx,
                                     'viol_key': viol_key
                                 }

                # Process Pending Speed Violations (Wait for Plate)
                pending_ids_to_remove = []
                current_time = time.time()
                
                for tid, p_viol in self.pending_speed_violations.items():
                    # 1. Check if we have a plate NOW (either from current frame fusion or historical)
                    # We need to get the LATEST fused vehicle data if it still exists
                    
                    plate_found = False
                    final_plate_text = None
                    final_plate_conf = 0.0
                    final_plate_bbox = None
                    
                    # Try to get updated vehicle data
                    current_vehicle = None
                    if self.fusion:
                        current_vehicle = self.fusion.get_vehicle(tid)
                    
                    if current_vehicle and current_vehicle.plate_text:
                        plate_found = True
                        final_plate_text = current_vehicle.plate_text
                        final_plate_conf = current_vehicle.plate_conf
                        final_plate_bbox = current_vehicle.plate_bbox
                    
                    # --- OPTIMIZATION START: Active Plate Search for Speeding Vehicle ---
                    # If fusion didn't give us a plate (likely, as fusion creates vehicles before OCR),
                    # we must actively look for one associated with this TRACK ID in the current frame.
                    if not plate_found and sv_tracks_traffic.tracker_id is not None:
                        # 1. Find where this track ID is in the current traffic detections
                        try:
                            # simple list search or numpy where
                            curr_idx = None
                            for idx, t_id in enumerate(sv_tracks_traffic.tracker_id):
                                if int(t_id) == int(tid):
                                    curr_idx = idx
                                    break
                            
                            if curr_idx is not None:
                                # We found the car in this frame!
                                vehicle_box = sv_tracks_traffic.xyxy[curr_idx]
                                
                                # 2. Try to match with any plate in the current frame
                                # PATCH_2026-06-10: Associator signature is
                                # (plate_bbox, vehicle_bboxes) — caller previously
                                # passed args swapped, so every real plate dropped
                                # to None. Iterate plates against this single vehicle.
                                plate_boxes_only = [p[:4] for p in plates_raw]
                                plate_idx = next(
                                    (j for j, pb in enumerate(plate_boxes_only)
                                     if Associator.associate_plate_to_vehicle(pb, [vehicle_box]) is not None),
                                    None
                                )
                                
                                if plate_idx is not None:
                                    # Found a plate candidate!
                                    p_raw = plates_raw[plate_idx]
                                    plate_box_curr = p_raw[:4]
                                    
                                    # 3. Run OCR ASAP
                                    px1, py1, px2, py2 = map(int, plate_box_curr)
                                    h_img, w_img, _ = frame.shape
                                    
                                    # Use the raw detector plate box for OCR; padding adds background noise.
                                    px1 = max(0, px1); py1 = max(0, py1)
                                    px2 = min(w_img, px2); py2 = min(h_img, py2)

                                    plate_crop = frame[py1:py2, px1:px2]
                                    if plate_crop.size > 0:
                                        with self._gpu_lock:
                                            ocr_res = self.ocr.recognize_batch([plate_crop])
                                        if ocr_res:
                                            _, text = ocr_res[0]
                                            print(f"  → Found Plate for speeder {tid}: {text}", flush=True)
                                            plate_found = True
                                            final_plate_text = text
                                            final_plate_conf = p_raw[4]
                                            final_plate_bbox = list(plate_box_curr)
                                            
                                            # Update the current_vehicle object so it holds this for future frames if needed
                                            # (Though we will likely save and exit now)
                                            if current_vehicle:
                                                current_vehicle.plate_text = text
                                                current_vehicle.plate_conf = p_raw[4]
                                                current_vehicle.plate_bbox = list(plate_box_curr)
                                    
                        except Exception as e:
                            print(f"Error during active plate search: {e}")
                    # --- OPTIMIZATION END ---
                    elif p_viol['vehicle_data'].plate_text: # Check if original snapshot had it
                        plate_found = True
                        final_plate_text = p_viol['vehicle_data'].plate_text
                        final_plate_conf = p_viol['vehicle_data'].plate_conf
                        final_plate_bbox = p_viol['vehicle_data'].plate_bbox
                        
                    # 2. Decisions
                    should_save = False
                    reason = ""
                    frame_to_save = p_viol['frame'] # Default to original snapshot
                    
                    if plate_found:
                        should_save = True
                        reason = "Plate Found"
                        
                        # CRITICAL FIX: Ensure frame matches the bbox source
                        if current_vehicle and current_vehicle.plate_text and final_plate_text == current_vehicle.plate_text:
                             # Plate came from current fusion cycle -> Use CURRENT frame
                             frame_to_save = frame 
                        elif final_plate_text and not p_viol['vehicle_data'].plate_text: 
                             # Plate came from Active Search (current frame) -> Use CURRENT frame
                             frame_to_save = frame
                        else:
                             # Plate came from original snapshot -> Use ORIGINAL frame
                             frame_to_save = p_viol['frame']

                    elif (current_time - p_viol['start_time']) > 3.0: # 3 Second Timeout
                        should_save = True
                        reason = "Timeout (No Plate)"
                        frame_to_save = p_viol['frame']
                    elif current_vehicle is None: # Track lost
                        should_save = True
                        reason = "Track Lost"
                        frame_to_save = p_viol['frame']
                        
                    if should_save:
                        v_data = current_vehicle if current_vehicle else p_viol['vehicle_data']
                        
                        # If no plate bbox found, estimate from vehicle bbox
                        if final_plate_bbox is None and curr_idx is not None:
                            try:
                                vehicle_box = sv_tracks_traffic.xyxy[curr_idx]
                                vx1, vy1, vx2, vy2 = map(int, vehicle_box)
                                v_width = vx2 - vx1
                                plate_width = 200
                                plate_height = 50
                                px1 = int(vx1 + (v_width - plate_width) / 2)
                                py1 = vy2 - plate_height - 10
                                px2 = px1 + plate_width
                                py2 = vy2 - 10
                                h_img, w_img, _ = frame.shape
                                px1 = max(0, px1)
                                py1 = max(0, py1)
                                px2 = min(w_img, px2)
                                py2 = min(h_img, py2)
                                final_plate_bbox = [px1, py1, px2, py2]
                            except:
                                pass
                        
                        details = {
                            'rider_id': int(tid), 
                            'violation': 'SPEED',
                            'frame_idx': p_viol['frame_idx'], # Keep original frame idx for reference
                            'bbox_rider': v_data.bbox.tolist() if hasattr(v_data.bbox, 'tolist') else v_data.bbox, 
                            'bbox_plate': final_plate_bbox, 
                            'plate_text': final_plate_text,
                            'plate_conf': float(final_plate_conf),
                            'speed': float(p_viol['vehicle_data'].violation_speed), # Use ORIGINAL speed at violation buffer time
                            'speed_source': 'RADAR',
                            'rider_conf': float(v_data.camera_confidence)
                        }
                        
                        print(f"Vehicle {tid}: Saving Speed Violation ({reason}). Plate: {final_plate_text}", flush=True)
                        self.saver.save(frame_to_save, 'SPEED', details)
                        self.processed_violations.add(p_viol['viol_key'])
                        pending_ids_to_remove.append(tid)
                
                # Cleanup pending
                for tid in pending_ids_to_remove:
                    del self.pending_speed_violations[tid]
                
                # --- Vision-Based Wrong Side Detection (No Radar Required) ---
                # Process all tracked vehicles for wrong side violations
                if "wrong_side" in self.enabled_violations:
                    wrong_side_zone = self.config.get('wrong_side_zone', None)
                    
                    # Only process if polygon zone is configured
                    if wrong_side_zone and len(wrong_side_zone) >= 3:
                        # Process each tracked vehicle
                        if sv_tracks_traffic.tracker_id is not None:
                            
                            for i, tid in enumerate(sv_tracks_traffic.tracker_id):
                                bbox = sv_tracks_traffic.xyxy[i]
                                
                                # Calculate vehicle center point
                                center_x = (bbox[0] + bbox[2]) / 2
                                center_y = (bbox[1] + bbox[3]) / 2
                                
                                # Initialize position history for new vehicles
                                if tid not in self.vehicle_positions:
                                    self.vehicle_positions[tid] = deque(maxlen=5)
                                
                                # Store current position
                                self.vehicle_positions[tid].append((frame_idx, center_y))
                                
                                # Check if vehicle center is inside wrong-side polygon
                                in_zone = self._point_in_polygon(center_x, center_y, wrong_side_zone)
                                
                                # Only check for violation if vehicle is in zone AND we have position history
                                if in_zone and len(self.vehicle_positions[tid]) >= 3:
                                    # Get position history
                                    positions = list(self.vehicle_positions[tid])
                                    
                                    # Calculate overall movement (first to last position)
                                    y_old = positions[0][1]  # Oldest Y coordinate
                                    y_new = positions[-1][1]  # Newest Y coordinate
                                    total_y_movement = y_new - y_old
                                    
                                    # Movement threshold (must move at least 25 pixels for detection)
                                    movement_threshold = 25
                                    
                                    # Additional check: verify sustained movement (not just jitter)
                                    # Count how many frame-to-frame transitions show consistent direction
                                    upward_count = 0
                                    downward_count = 0
                                    for i in range(1, len(positions)):
                                        delta = positions[i][1] - positions[i-1][1]
                                        if delta < -3:  # Moving up (small threshold for frame-to-frame)
                                            upward_count += 1
                                        elif delta > 3:  # Moving down
                                            downward_count += 1
                                    
                                    # Require at least 60% of transitions in same direction (sustained movement)
                                    total_transitions = len(positions) - 1
                                    consistency_threshold = total_transitions * 0.6
                                    
                                    is_sustained_upward = upward_count >= consistency_threshold
                                    is_sustained_downward = downward_count >= consistency_threshold
                                    
                                    # Get expected traffic direction from config (can be "UP", "DOWN", or empty for default)
                                    expected_direction = self.config.get('wrong_side_direction', 'DOWN').upper() if self.config.get('wrong_side_direction') else 'DOWN'
                                    
                                    # Determine if movement is violating based on expected direction
                                    is_violation = False
                                    violation_description = ""
                                    
                                    if expected_direction == 'DOWN':
                                        # Normal flow: top→bottom (Y increasing)
                                        # Violation: bottom→top (Y decreasing, upward) with sustained movement
                                        if total_y_movement < -movement_threshold and is_sustained_upward:
                                            is_violation = True
                                            violation_description = f"Moving UPWARD (expected DOWN)"
                                    elif expected_direction == 'UP':
                                        # Normal flow: bottom→top (Y decreasing)
                                        # Violation: top→bottom (Y increasing, downward) with sustained movement
                                        if total_y_movement > movement_threshold and is_sustained_downward:
                                            is_violation = True
                                            violation_description = f"Moving DOWNWARD (expected UP)"
                                    else:
                                        # Fallback: default to DOWN
                                        if total_y_movement < -movement_threshold and is_sustained_upward:
                                            is_violation = True
                                            violation_description = f"Moving UPWARD (expected DOWN - default)"
                                    
                                    # VIOLATION: Vehicle moving in wrong direction through the zone
                                    if is_violation:
                                        viol_key = f"wrong_side_vehicle_{tid}"
                                        
                                        if viol_key not in self.processed_violations:
                                            # Calculate speed in pixels per frame for logging
                                            frames_diff = positions[-1][0] - positions[0][0]
                                            if frames_diff > 0:
                                                speed_pixels_per_frame = abs(total_y_movement) / frames_diff
                                            else:
                                                speed_pixels_per_frame = 0
                                            
                                            print(f"Vehicle {tid}: WRONG-SIDE violation! {violation_description} (Y: {y_old:.1f} → {y_new:.1f}, movement: {total_y_movement:.1f}px)", flush=True)
                                            
                                            # Get plate if available
                                            final_plate_text = "UNKNOWN"
                                            final_plate_conf = 0.0
                                            if tid in self.ocr.buffers:
                                                plate_text, plate_conf = self.ocr.get_best_text(tid)
                                                if plate_text:
                                                    final_plate_text = plate_text
                                                    final_plate_conf = plate_conf
                                            
                                            details = {
                                                'rider_id': int(tid),
                                                'violation': 'wrong_side',
                                                'frame_idx': frame_idx,
                                                'bbox_rider': bbox.tolist() if hasattr(bbox, 'tolist') else list(bbox),
                                                'bbox_plate': None,
                                                'plate_text': final_plate_text,
                                                'plate_conf': float(final_plate_conf),
                                                'rider_conf': float(sv_tracks_traffic.confidence[i]) if sv_tracks_traffic.confidence is not None and i < len(sv_tracks_traffic.confidence) else 0.8,
                                                'direction': f"UPWARD (Y: {y_old:.1f}→{y_new:.1f})",
                                                'movement_pixels': float(total_y_movement)
                                            }
                                            
                                            self.saver.save(frame, 'wrong_side', details)
                                            self.processed_violations.add(viol_key)
                
                # --- 3. Multi-Mode Processing ---
                
                # VCC Mode: Count vehicles by class
                if "vcc" in self.enabled_modes:
                    self._process_vcc(sv_tracks_traffic, frame_idx)
                
                # ANPR Mode: Detect and recognize plates
                if "anpr" in self.enabled_modes:
                    self._process_anpr(sv_tracks_traffic, plates_raw, frame, frame_idx)
                
                # --- 3.5 Vehicle Buffering (for videos) ---
                # DISABLED: Video generation disabled, no need to buffer frames per vehicle
                # This was causing MASSIVE memory leak: frame.copy() for every tracked vehicle
                # if sv_tracks_traffic.tracker_id is not None:
                #     for i, t_id in enumerate(sv_tracks_traffic.tracker_id):
                #         if t_id not in self.vehicle_snapshot_buffers:
                #             self.vehicle_snapshot_buffers[t_id] = deque(maxlen=Config.SNAPSHOT_BUFFER_SIZE)
                #         
                #         # Store simple frame buffer
                #         # For vehicles we just need the frame for video, bbox is in tracks
                #         self.vehicle_snapshot_buffers[t_id].append(frame.copy())

                # --- 4. Violation Mode Processing ---
                # (Only process violations if violation mode is enabled)
                if "violation" not in self.enabled_modes:
                    continue
                
                # --- Seatbelt Detection Integration ---
                if "seatbelt" in self.enabled_violations:
                    try:
                        # 1. Run Seatbelt Inference
                        # Only run if we have 4-wheelers on screen to save resources
                        has_4w = False
                        if sv_tracks_traffic.tracker_id is not None:
                             for i, class_id in enumerate(sv_tracks_traffic.class_id):
                                 # YOLO classes: 2=car, 5=bus, 7=truck (COCO)
                                 # Mapped in CONFIG/map_vehicle_class_name
                                 if class_id in [1, 2, 5]:  # Bus=1, Car=2, Truck=5 (new model)
                                     has_4w = True
                                     break
                        
                        if has_4w:
                            # Only detect seatbelt related classes
                            target_classes = [Config.CLASS_SEATBELT, Config.CLASS_NO_SEATBELT]

                            with self._gpu_lock:
                                detections_seatbelt = self.detector_violation.detect(
                                    frame,
                                    conf=Config.CONF_SEATBELT,
                                    classes=target_classes
                                )
                            
                            # Process detections
                            seatbelt_violations = [] # [x1, y1, x2, y2, conf, cls]
                            for d in detections_seatbelt:
                                cls_id = int(d[5])
                                conf = d[4]
                                # Assuming CLASS_NO_SEATBELT is 1 (will verify logs)
                                if cls_id == Config.CLASS_NO_SEATBELT:
                                    seatbelt_violations.append(d)
                            
                            # Associate with 4-wheelers
                                new_sb_violations = self.violation_manager.update_seatbelt_violations(
                                    seatbelt_violations,
                                    sv_tracks_traffic,
                                    self.tracker_traffic,
                                    self.ocr,
                                    frame,
                                    frame_idx,
                                    valid_classes=[2, 5, 7] # Restrict to Car, Bus, Truck (Exclude Auto/Bike)
                                )
                                
                                for details in new_sb_violations:
                                    vehicle_id_sb = details['vehicle_id']
                                    violation_key = f"seatbelt_{vehicle_id_sb}"
                                    
                                    # Use pipeline's centralized deduplication (same as Helmet/Triple)
                                    if violation_key not in self.processed_violations:
                                        # Lookup Plate in OCR Buffer
                                        if self.ocr:
                                            p_text, p_conf = self.ocr.get_best_text(vehicle_id_sb)
                                            if p_text:
                                                details['plate_text'] = p_text
                                                details['plate_conf'] = float(p_conf)
                                                print(f"  → Found associated plate for vehicle {vehicle_id_sb}: {p_text}", flush=True)

                                        # VIDEO DISABLED - No video frames needed
                                        # video_frames = []
                                        # if vehicle_id_sb in self.vehicle_snapshot_buffers:
                                        #     video_frames = list(self.vehicle_snapshot_buffers[vehicle_id_sb])
                                        #     print(f"  → Video buffer has {len(video_frames)} frames", flush=True)
                                        video_frames = []  # Empty - videos disabled

                                        print(f"Vehicle {vehicle_id_sb}: Confirmed SEATBELT violation!", flush=True)
                                        
                                        # Ensure vehicle bbox is set for cropping
                                        if 'bbox_vehicle' not in details and 'bbox_rider' in details:
                                             details['bbox_vehicle'] = details['bbox_rider']

                                        self.saver.save(frame, "seatbelt", details, video_buffer=video_frames)
                                        self.processed_violations.add(violation_key)
                    except Exception as e:
                        print(f"Error in seatbelt detection: {e}", flush=True)
                
                # Filter Violation
                violation_for_tracking = [] # Riders
                heads_raw = [] # [x1, y1, x2, y2, conf, cls]
                
                for d in detections_violation:
                    cls_id = int(d[5])
                    conf = d[4]  # Get confidence
                    
                    if cls_id == Config.CLASS_RIDER:
                        violation_for_tracking.append(d)
                    elif cls_id == Config.CLASS_HELMET:
                        # Only add high-confidence "with helmet" detections
                        if conf >= Config.CONF_HELMET:
                            heads_raw.append(d)
                    elif cls_id == Config.CLASS_NO_HELMET:
                        # Only add high-confidence "without helmet" detections
                        # This prevents low-confidence false positives
                        if conf >= Config.CONF_NO_HELMET:
                            heads_raw.append(d)
                        
                sv_tracks_violation = self.tracker_violation.update(violation_for_tracking)
                
                # Debug Print
                # FPS Calculation
                fps_frame_count += 1
                if time.time() - fps_start_time >= 1.0:
                    current_fps = fps_frame_count / (time.time() - fps_start_time)
                    fps_frame_count = 0
                    fps_start_time = time.time()

                # Streaming Callback
                if self.frame_callback:
                     try:
                        # Raw Feed Mode: Send clean frame without overlays
                        self.frame_callback(frame)
                     except Exception as e:
                        print(f"Streaming callback error: {e}")

                # Debug Print with plate numbers
                if frame_idx % 10 == 0:
                    # Collect detected plate texts from OCR buffer
                    plate_texts = []
                    if sv_tracks_traffic.tracker_id is not None:
                        for tid in sv_tracks_traffic.tracker_id:
                            text, conf = self.ocr.get_best_text(tid)
                            if text:
                                plate_texts.append(f"{text}({conf:.2f})")
                    
                    plate_info = f" | Plates: {', '.join(plate_texts) if plate_texts else str(len(plates_raw))}"
                    print(f"Frame {frame_idx}/{total_frames} | Traffic: {len(traffic_for_tracking)} | Riders: {len(violation_for_tracking)}{plate_info} | FPS: {current_fps:.2f}", flush=True)
                
                # --- 3. Association Chain ---
                
                # We ignore frames with no riders
                if sv_tracks_violation.tracker_id is not None and len(sv_tracks_violation.tracker_id) > 0:
                    
                    # Prepare data structures
                    # Traffic Tracks: bbox, class, tracker_id
                    traffic_bboxes = sv_tracks_traffic.xyxy
                    # Correction: sv_tracks_traffic.class_id
                    traffic_classes = sv_tracks_traffic.class_id
                    traffic_ids = sv_tracks_traffic.tracker_id
                    
                    # Rider Tracks
                    rider_bboxes = sv_tracks_violation.xyxy
                    rider_ids = sv_tracks_violation.tracker_id
                    
                    # Build rider-to-vehicle association map for visualization
                    rider_vehicle_map = {}
                    
                    # --- Mobile-use detector: one shot per frame, gated by motorcycle presence ---
                    phone_dets = []
                    moto_boxes = []
                    if "mobile" in self.enabled_violations:
                        for d in traffic_for_tracking:
                            if int(d[5]) == Config.CLASS_MOTORCYCLE:
                                moto_boxes.append(d[:4])
                        if moto_boxes:
                            try:
                                with self._gpu_lock:
                                    phone_dets = self.detector_mobile.detect(frame, conf=Config.CONF_MOBILE)
                                if phone_dets is not None and len(phone_dets) > 0: print(f"[mobile] phone_dets count={len(phone_dets)}", flush=True)
                            except Exception as e:
                                print(f"[mobile] detect error: {e}", flush=True)

                    # Process each Rider
                    for i, rider_id in enumerate(rider_ids):
                        rider_box = rider_bboxes[i]
                        rider_conf = float(sv_tracks_violation.confidence[i]) if sv_tracks_violation.confidence is not None else 0.5
                        plate_box = None  # Will be set later if plate found
                        
                        # Initialize snapshot buffer for new riders
                        # VIDEO BUFFER DISABLED
                        # if rider_id not in self.rider_snapshot_buffers:
                        #     self.rider_snapshot_buffers[rider_id] = deque(maxlen=Config.SNAPSHOT_BUFFER_SIZE)
                        
                        # Get the motorcycle/vehicle associated with this rider
                        # This is needed for triple riding detection (count heads on SAME vehicle)
                        vehicle_idx = Associator.associate_rider_to_motorcycle(
                            rider_box, sv_tracks_traffic.xyxy, sv_tracks_traffic.class_id
                        )
                        
                        motorcycle_box = None
                        if vehicle_idx is not None:
                            motorcycle_box = sv_tracks_traffic.xyxy[vehicle_idx]
                            rider_vehicle_map[rider_id] = vehicle_idx
                        
                        # A. Check Violations (Helmet & Triple Riding)
                        # CRITICAL UPDATE: Match logic from both_v5.py (Old Pipeline)
                        # Check heads inside RIDER box for helmet violation to avoid false positives
                        
                        rider_heads = []
                        rx1, ry1, rx2, ry2 = rider_box
                        
                        # Add margin matches is_inside_top_region logic from both_v5.py implicitly
                        # or just direct overlap check
                        
                        for h_i, head in enumerate(heads_raw):
                            hx1, hy1, hx2, hy2, h_conf, h_cls = head
                            hcx, hcy = (hx1+hx2)/2, (hy1+hy2)/2
                            
                            # Check if head center is inside RIDER box (Strict association)
                            if rx1 < hcx < rx2 and ry1 < hcy < ry2:
                                rider_heads.append(head)
                        
                        # Frame-level checks
                        frame_helmet_viol = None
                        frame_triple_viol = None
                        
                        if "helmet" in self.enabled_violations and len(rider_heads) > 0:
                            # Strict check: If ANY head in rider box is NO_HELMET -> Violation
                            # This matches both_v5.py logic:
                            # if class_id == 3: helmet_violation = True
                            
                            for h in rider_heads:
                                h_cls = int(h[5])
                                h_conf = h[4]
                                
                                # Class 3 = without_helmet (Config.CLASS_NO_HELMET)
                                if h_cls == Config.CLASS_NO_HELMET and h_conf >= Config.CONF_NO_HELMET:
                                    frame_helmet_viol = "helmet"
                                    break # Found a violation, flag it
                        
                        
                        if "triple_riding" in self.enabled_violations:
                            # FIXED: Pass RIDER box (not motorcycle box) to check triple riding
                            # This counts heads on THIS specific rider, not all nearby riders on same bike
                            frame_triple_viol = self.violation_manager.check_triple_riding(
                                heads_raw,  # ALL heads in frame
                                rider_box  # Check heads overlapping with THIS rider's box
                            )

                        frame_mobile_viol = False
                        if "mobile" in self.enabled_violations and phone_dets:
                            frame_mobile_viol = self.violation_manager.check_mobile(
                                phone_dets, rider_box, heads_raw, moto_boxes, frame.shape
                            )

                        
                        # Update consensus and get confirmed violations
                        # We only pass results if we actually checked them. 
                        # If a check was skipped (None), the manager should ideally handle it or we pass False?
                        # Assuming manager expects boolean or None. If we pass None, does it reset consensus?
                        # Let's assume the manager handles specific flags. If not, we might need to modify it or ensure we only update what we check.
                        # For safety, if we didn't check, we can't confirm a violation.
                        
                        confirmed_h, confirmed_t, confirmed_m, confirmed_mob = self.violation_manager.update(
                            rider_id, 
                            frame_helmet_viol if frame_helmet_viol is not None else False, 
                            frame_triple_viol if frame_triple_viol is not None else False,
                            mobile_violation_flag=bool(frame_mobile_viol)
                        )
                        
                        # Minor Rider Age Check (body-based classification)
                        if self.age_estimator and "minor_rider" in self.enabled_violations:
                            rx1, ry1, rx2, ry2 = map(int, rider_box)
                            h_img, w_img = frame.shape[:2]
                            rx1, ry1 = max(0, rx1), max(0, ry1)
                            rx2, ry2 = min(w_img, rx2), min(h_img, ry2)
                            rider_crop = frame[ry1:ry2, rx1:rx2]

                            crop_h = max(0, ry2 - ry1)
                            crop_w = max(0, rx2 - rx1)
                            min_crop_w = getattr(Config, "MINOR_RIDER_MIN_CROP_WIDTH", 60)
                            min_crop_h = getattr(Config, "MINOR_RIDER_MIN_CROP_HEIGHT", 120)

                            if rider_crop.size > 0 and crop_w >= min_crop_w and crop_h >= min_crop_h:
                                with self._gpu_lock:
                                    age_result = self.age_estimator.classify(rider_crop)
                                if age_result is not None:
                                    age_label = str(age_result.get("label", ""))
                                    age_conf = float(age_result.get("confidence", 0.0))
                                    child_prob = float(age_result.get("child_prob", 0.0))
                                    teen_prob = float(age_result.get("teen_prob", 0.0))
                                    adult_prob = float(age_result.get("adult_prob", 0.0))
                                    minor_prob = float(age_result.get("minor_prob", 0.0))
                                    min_conf = getattr(Config, "MINOR_RIDER_MIN_CONFIDENCE", 0.78)
                                    child_label = getattr(Config, "MINOR_RIDER_CHILD_LABEL", "Child 0-12")
                                    teen_label = getattr(Config, "MINOR_RIDER_TEEN_LABEL", "Teenager 13-20")
                                    adult_labels = set(getattr(Config, "MINOR_RIDER_ADULT_LABELS", ["Adult 21-44", "Middle Age 45-64", "Aged 65+"]))
                                    child_min_prob = getattr(Config, "MINOR_RIDER_CHILD_MIN_PROB", 0.72)
                                    adult_min_prob = getattr(Config, "MINOR_RIDER_ADULT_MIN_PROB", 0.45)
                                    minor_min_prob = getattr(Config, "MINOR_RIDER_MINOR_MIN_PROB", 0.50)

                                    minor_vote = None
                                    if age_conf >= min_conf:
                                        if age_label == child_label and child_prob >= child_min_prob:
                                            minor_vote = True
                                        elif age_label in adult_labels and adult_prob >= adult_min_prob:
                                            minor_vote = False
                                        elif age_label == teen_label:
                                            minor_vote = minor_prob >= minor_min_prob

                                    print(
                                        f"[MINOR_DEBUG] rider={rider_id} crop={crop_w}x{crop_h} "
                                        f"label={age_label} conf={age_conf:.3f} child={child_prob:.3f} "
                                        f"teen={teen_prob:.3f} minor_prob={minor_prob:.3f} adult={adult_prob:.3f} "
                                        f"vote={minor_vote}"
                                    )

                                    self.violation_manager.update_minor(rider_id, minor_vote)
                                    state = self.violation_manager.rider_states.get(rider_id)
                                    if state:
                                        print(
                                            f"[MINOR_DEBUG] rider={rider_id} counts="
                                            f"(minor={state.minor_votes}) "
                                            f"confirmed_minor={state.confirmed_minor}"
                                        )
                                    if state and state.confirmed_minor:
                                        print(f"[MINOR_DEBUG] rider={rider_id} confirmed minor_rider violation")
                                        confirmed_m = "minor_rider"
                                else:
                                    print(f"[MINOR_DEBUG] rider={rider_id} age_result=None crop={crop_w}x{crop_h}")
                            else:
                                print(
                                    f"[MINOR_DEBUG] rider={rider_id} skipped crop "
                                    f"size={crop_w}x{crop_h} min={min_crop_w}x{min_crop_h}"
                                )
        
                        active_violations = []
                        if confirmed_h and "helmet" in self.enabled_violations: 
                            active_violations.append(confirmed_h)
                        if confirmed_t and "triple_riding" in self.enabled_violations: 
                            active_violations.append(confirmed_t)
                        if confirmed_m and "minor_rider" in self.enabled_violations:
                            active_violations.append(confirmed_m)
                        if confirmed_mob and "mobile" in self.enabled_violations:
                            active_violations.append(confirmed_mob)

                        
                        # If no violation, skip further processing for this rider (Optimization)
                        if not active_violations:
                            continue
                            
                        # B. Link Rider -> Motorcycle
                        vehicle_idx = Associator.associate_rider_to_motorcycle(
                            rider_box, traffic_bboxes, traffic_classes
                        )
                        
                        # Store association for visualization (even if no violation)
                        if vehicle_idx is not None:
                            rider_vehicle_map[rider_id] = vehicle_idx
                        
                        plate_text = None
                        plate_conf = 0.0
                        vehicle_id_for_ocr = None
                        
                        # Primary: Try vehicle-based association
                        if vehicle_idx is not None and traffic_ids is not None and vehicle_idx < len(traffic_ids):
                            # C. Link Motorcycle -> Plate
                            vehicle_box = traffic_bboxes[vehicle_idx]
                            vehicle_id_for_ocr = traffic_ids[vehicle_idx]
                            
                            # Match Chikka's stricter plate→vehicle gate: 70% min
                            # overlap of the plate inside the vehicle, AND a 15%
                            # margin over the runner-up plate. 30% with no margin
                            # was attaching adjacent vehicles' plates in busy
                            # frames. No distance fallback — drop ambiguous.
                            MIN_OVERLAP_RATIO = 0.70
                            MIN_MARGIN = 0.15
                            best_plate_idx = None
                            best_ratio = 0.0
                            second_ratio = 0.0

                            for p_idx, p_raw in enumerate(plates_raw):
                                p_box = p_raw[:4]
                                intersection = Associator._intersection_area(p_box, vehicle_box)
                                if intersection <= 0:
                                    continue
                                plate_area = Associator._box_area(p_box)
                                if plate_area <= 0:
                                    continue
                                overlap_ratio = intersection / plate_area
                                if overlap_ratio > best_ratio:
                                    second_ratio = best_ratio
                                    best_ratio = overlap_ratio
                                    best_plate_idx = p_idx
                                elif overlap_ratio > second_ratio:
                                    second_ratio = overlap_ratio

                            if best_plate_idx is None or best_ratio < MIN_OVERLAP_RATIO:
                                plate_idx = None
                            elif (best_ratio - second_ratio) < MIN_MARGIN:
                                # Ambiguous — plate sits across two vehicles.
                                plate_idx = None
                            else:
                                plate_idx = best_plate_idx
                            
                            if plate_idx is not None:
                                # Found a plate via vehicle!
                                p_raw = plates_raw[plate_idx]
                                plate_box = p_raw[:4]
                                
                                # --- 4. OCR ---
                                # Crop and Recognize
                                px1, py1, px2, py2 = map(int, plate_box)
                                w_plate = px2 - px1
                                h_plate = py2 - py1
                                
                                # Pass ALL plates to OCR (like production pipeline)
                                # Let the CRNN model handle edge cases
                                # Throttling REMOVED to match reference pipeline (process every frame)
                                # User Request: OCR for all violations (Helmet AND Triple Riding)
                                # Throttling Logic: Scan every 5th frame per vehicle, or if we haven't scanned it yet
                                should_run_ocr = False
                                
                                # Default to scanning if new
                                if vehicle_id_for_ocr not in self.last_ocr_frames:
                                    should_run_ocr = True
                                else:
                                    # Scan again if N frames have passed (re-verify confidence)
                                    if frame_idx - self.last_ocr_frames[vehicle_id_for_ocr] > 5:
                                        should_run_ocr = True
                                
                                # Force scan if high confidence plate but low confidence OCR (refine)
                                # (Optional optimization)

                                if should_run_ocr and w_plate > 0 and h_plate > 0:
                                    h_img, w_img, _ = frame.shape
                                    px1 = max(0, px1)
                                    py1 = max(0, py1)
                                    px2 = min(w_img, px2)
                                    py2 = min(h_img, py2)

                                    # Feed the raw VCC plate crop to OCR with no extra padding.
                                    plate_crop = frame[py1:py2, px1:px2]
                                    
                                    if plate_crop.size > 0:
                                        # Run OCR
                                        with self._gpu_lock:
                                            ocr_result = self.ocr.recognize_batch([plate_crop])
                                        if ocr_result:
                                            _, text = ocr_result[0]
                                            # Update OCR buffer
                                            self.ocr.update_buffer(vehicle_id_for_ocr, text, p_raw[4])
                                            # Update throttle timestamp
                                            if vehicle_id_for_ocr is not None:
                                                self.last_ocr_frames[vehicle_id_for_ocr] = frame_idx
                        
                        # Get consensus text from buffer
                        if vehicle_id_for_ocr is not None:
                            best_text, best_conf = self.ocr.get_best_text(vehicle_id_for_ocr)
                            if best_text:
                                plate_text = best_text
                                plate_conf = best_conf
                        
                        # ⚠️ REMOVED DANGEROUS FALLBACK PLATE SEARCH
                        # Previous code searched for ANY plate within 200px of rider
                        # This caused wrong plate associations on crowded roads
                        # If no plate found via vehicle association, we skip (safer for legal compliance)
                        
                        # VIDEO BUFFER DISABLED
                        # # Add current frame to buffer AFTER all plate processing (plate_box now set)
                        # self.rider_snapshot_buffers[rider_id].append(
                        #     (frame.copy(), rider_box.copy(), rider_conf, plate_box)
                        # )
                        
                        # --- 5. Save Output ---
                        for viol_type in active_violations:
                            # Check deduplication
                            violation_key = f"{viol_type}_{rider_id}"
                            
                            if violation_key not in self.processed_violations:
                                print(f"Rider {rider_id}: Confirmed {viol_type} violation! Selecting best snapshot...", flush=True)
                                
                                # Select best snapshot from buffer
                                snapshot_buffer = list(self.rider_snapshot_buffers.get(rider_id, []))
                                best_snapshot = select_best_snapshot(
                                    snapshot_buffer,
                                    blur_threshold=Config.BLUR_THRESHOLD,
                                    min_quality=Config.MIN_SNAPSHOT_QUALITY
                                )
                                
                                # Use best snapshot if available, otherwise use current frame
                                if best_snapshot is not None:
                                    best_frame, best_bbox, best_conf, best_plate_box, quality_score = best_snapshot
                                    print(f"  → Selected best snapshot (quality: {quality_score:.3f})", flush=True)
                                    save_frame = best_frame
                                    save_rider_box = best_bbox
                                    save_plate_box = best_plate_box  # Use plate bbox from best frame
                                else:
                                    print(f"  ⚠ No high-quality snapshot in buffer, using current frame", flush=True)
                                    save_frame = frame
                                    save_rider_box = rider_box
                                    save_plate_box = plate_box  # Use current frame's plate bbox
                                
                                # Prepare data for saving
                                rider_box_list = save_rider_box.tolist() if hasattr(save_rider_box, 'tolist') else save_rider_box
                                # Use plate bbox from saved frame (not current frame!)
                                plate_box_list = save_plate_box if save_plate_box is not None else None
                                if hasattr(plate_box_list, 'tolist'):
                                    plate_box_list = list(plate_box_list)
                                
                                # Get vehicle bbox if mapped
                                vehicle_box_list = None
                                if rider_id in rider_vehicle_map:
                                    v_idx = rider_vehicle_map[rider_id]
                                    if v_idx < len(sv_tracks_traffic.xyxy):
                                        v_box = sv_tracks_traffic.xyxy[v_idx]
                                        vehicle_box_list = v_box.tolist() if hasattr(v_box, 'tolist') else v_box

                                # VIDEO DISABLED
                                # video_frames = [item[0] for item in snapshot_buffer]
                                # print(f"  → Video buffer has {len(video_frames)} frames", flush=True)
                                video_frames = []  # Empty - videos disabled

                                details = {
                                    'rider_id': int(rider_id),
                                    'violation': viol_type,
                                    'frame_idx': frame_idx,
                                    'bbox_rider': rider_box_list,
                                    'bbox_vehicle': vehicle_box_list, # Pass vehicle for cropping
                                    'plate_text': plate_text,
                                    'plate_conf': float(plate_conf),
                                    'bbox_plate': plate_box_list,
                                    'rider_conf': rider_conf
                                }
                                
                                self.saver.save(save_frame, viol_type, details, video_buffer=video_frames)
                                self.processed_violations.add(violation_key)
                                
                                # VIDEO BUFFER DISABLED
                                # # Clear buffer after saving
                                # if rider_id in self.rider_snapshot_buffers:
                                #     self.rider_snapshot_buffers[rider_id].clear()
                                
                # --- 6. Visualization & Debug ---
                # Build rider-vehicle map if not already built (for frames with no violations)
                if sv_tracks_violation.tracker_id is not None and 'rider_vehicle_map' not in locals():
                    rider_vehicle_map = {}
                    for i, rider_id in enumerate(sv_tracks_violation.tracker_id):
                        rider_box = sv_tracks_violation.xyxy[i]
                        vehicle_idx = Associator.associate_rider_to_motorcycle(
                            rider_box, sv_tracks_traffic.xyxy, sv_tracks_traffic.class_id
                        )
                        if vehicle_idx is not None:
                            rider_vehicle_map[rider_id] = vehicle_idx
                elif 'rider_vehicle_map' not in locals():
                    rider_vehicle_map = {}
                
                # Visualization & Debug (Disabled for performance)
                # annotated_frame = self.visualizer.draw_tracks(...)
                # if frame_idx % 5 == 0:
                #    cv2.imwrite("debug_latest_frame.jpg", annotated_frame)

                    
            except Exception as e:
                print(f"\nCRITICAL ERROR at frame {frame_idx}: {e}")
                import traceback
                traceback.print_exc()
                break
                    
        cap.release()
        print("Processing complete.")

    def _process_vcc(self, sv_tracks_traffic, frame_idx):
        """Process VCC (Vehicle Classification & Counting) mode.
        
        Count vehicles by class and send to central server periodically.
        """
        # Reset current frame counts
        self.vcc_counts.clear()
        
        if sv_tracks_traffic.tracker_id is None:
            return
        
        # Count vehicles by class
        for i, track_id in enumerate(sv_tracks_traffic.tracker_id):
            class_id = int(sv_tracks_traffic.class_id[i])
            yolo_class_name = self.detector_traffic.model.names[class_id]
            
            # Map to dashboard class name (2W, 4W, AUTO, TRUCK, BUS)
            dashboard_class_name = map_vehicle_class_name(yolo_class_name)
            
            # Skip plates and unknown
            if dashboard_class_name == "UNKNOWN":
                continue
            
            # Increment current frame count
            self.vcc_counts[dashboard_class_name] += 1
            
            # Track unique vehicles for session totals
            if track_id not in self.vcc_seen_vehicles:
                self.vcc_seen_vehicles.add(track_id)
                self.vcc_total_counts[dashboard_class_name] += 1
        
        # Send to central server every N frames
        # FIXED: Send individual events per vehicle type (backend expects vehicle_type field)
        if frame_idx % Config.VCC_SEND_INTERVAL_FRAMES == 0 and self.vcc_counts:
            current_timestamp = datetime.now()
            for vehicle_type, count in self.vcc_counts.items():
                send_vcc_event_async(
                    camera_id=self.camera_id,
                    vehicle_counts={vehicle_type: count},  # Single vehicle type
                    timestamp=current_timestamp,
                    camera_name=self.camera_name
                )
    
    def _process_anpr(self, sv_tracks_traffic, plates_raw, frame, frame_idx):
        """Process ANPR (Automatic Number Plate Recognition) mode.
        
        Detect plates, associate with vehicles, run OCR, and send to central server.
        """
        # --- Self-contained plate-only ANPR (local DB persistence) ---
        # The stock pipeline only sends ANPR to the central server and needs a
        # tracked vehicle. For a self-contained box we OCR any clearly-detected
        # plate and persist it locally as an 'anpr' record (deduped by text).
        try:
            import os as _os, re as _re0, time as _time0
            _h, _w = frame.shape[:2]
            for _pb in plates_raw:
                _pc = float(_pb[4])
                if _pc < Config.ANPR_MIN_PLATE_CONFIDENCE:
                    continue
                _x1, _y1, _x2, _y2 = map(int, _pb[:4])
                _x1 = max(0, _x1); _y1 = max(0, _y1); _x2 = min(_w, _x2); _y2 = min(_h, _y2)
                _crop = frame[_y1:_y2, _x1:_x2]
                if _crop.size == 0:
                    continue
                with self._gpu_lock:
                    _res = self.ocr.recognize_batch([_crop])
                if not _res:
                    continue
                _txt = (_res[0][1] or "").strip().upper().replace(" ", "").replace("-", "")
                if len(_txt) < 6 or _re0.match(r"^(NA|NI|NIL|NP)[0-9A-Z]*$", _txt):
                    continue
                _now = _time0.time()
                _seen = self.anpr_sent_vehicles.get(_txt)
                if _seen and (_now - _seen) < Config.ANPR_DEDUPE_WINDOW:
                    continue
                self.anpr_sent_vehicles[_txt] = _now
                _ad = _os.path.join(Config.OUTPUT_DIR, "anpr"); _os.makedirs(_ad, exist_ok=True)
                _ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                _pp = _os.path.join(_ad, "plate_" + _ts + ".jpg")
                try:
                    cv2.imwrite(_pp, _crop)
                except Exception:
                    _pp = None
                try:
                    self.saver._save_to_database("anpr", _txt, _pc, None, None, _pp, None)
                    print("  -> ANPR plate saved: " + _txt + " (%.2f)" % _pc)
                except Exception as _e:
                    print("  ! ANPR save error: " + str(_e))
        except Exception as _e:
            print("  ! plate-only ANPR error: " + str(_e))
        # --- end plate-only ANPR ---
        if sv_tracks_traffic.tracker_id is None:
            return
        
        current_time = time.time()
        
        for i, track_id in enumerate(sv_tracks_traffic.tracker_id):
            bbox = sv_tracks_traffic.xyxy[i]
            class_id = int(sv_tracks_traffic.class_id[i])
            yolo_class_name = self.detector_traffic.model.names[class_id]
            
            # Map to dashboard class name
            dashboard_class_name = map_vehicle_class_name(yolo_class_name)
            
            # Skip if it's a plate detection or unknown
            if dashboard_class_name == "UNKNOWN":
                continue
            
            # Check if we've already sent this vehicle recently
            if track_id in self.anpr_sent_vehicles:
                last_sent_time = self.anpr_sent_vehicles[track_id]
                if (current_time - last_sent_time) < Config.ANPR_DEDUPE_WINDOW:
                    continue  # Skip - already sent recently
            
            # Try to find plate for this vehicle
            # PATCH_2026-06-10: Associator signature is (plate_bbox, vehicle_bboxes)
            # — caller previously passed args swapped, so every real plate dropped
            # to None. Iterate plates against this single vehicle.
            plate_boxes_only = [p[:4] for p in plates_raw]
            plate_idx = next(
                (j for j, pb in enumerate(plate_boxes_only)
                 if Associator.associate_plate_to_vehicle(pb, [bbox]) is not None),
                None
            )
            
            if plate_idx is not None:
                plate_box = plates_raw[plate_idx][:4]
                plate_conf = plates_raw[plate_idx][4]
                
                # Check confidence threshold
                if plate_conf < Config.ANPR_MIN_PLATE_CONFIDENCE:
                    continue
                
                # Run OCR
                px1, py1, px2, py2 = map(int, plate_box)
                h_img, w_img, _ = frame.shape
                
                # Feed the raw detector plate crop to OCR without expanding the box.
                px1 = max(0, px1)
                py1 = max(0, py1)
                px2 = min(w_img, px2)
                py2 = min(h_img, py2)

                plate_crop = frame[py1:py2, px1:px2]

                if plate_crop.size > 0:
                    with self._gpu_lock:
                        ocr_result = self.ocr.recognize_batch([plate_crop])
                    if ocr_result:
                        _, plate_text = ocr_result[0]

                        # PATCH_2026-06-10: skip plates shorter than 6 chars
                        # or matching known garbage-OCR prefixes (NA, NI, NIL, NP)
                        # — those are not real plates.
                        _pt = (plate_text or "").strip()
                        if len(_pt) < 6:
                            continue
                        import re as _re
                        if _re.match(r'^(NA|NI|NIL|NP)[0-9A-Z]*$', _pt):
                            continue

                        # Save crops
                        import os
                        anpr_output_dir = os.path.join(Config.OUTPUT_DIR, 'anpr')
                        os.makedirs(anpr_output_dir, exist_ok=True)
                        
                        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                        plate_filename = f"plate_{track_id}_{timestamp_str}.jpg"
                        vehicle_filename = f"vehicle_{track_id}_{timestamp_str}.jpg"
                        
                        plate_path = os.path.join(anpr_output_dir, plate_filename)
                        vehicle_path = os.path.join(anpr_output_dir, vehicle_filename)
                        
                        cv2.imwrite(plate_path, plate_crop)
                        
                        # Save vehicle crop
                        vx1, vy1, vx2, vy2 = map(int, bbox)
                        vehicle_crop = frame[vy1:vy2, vx1:vx2]
                        cv2.imwrite(vehicle_path, vehicle_crop)
                        
                        # Send to central server with dashboard class name
                        send_anpr_detection_async(
                            camera_id=self.camera_id,
                            plate_number=plate_text,
                            vehicle_type=dashboard_class_name,  # Use dashboard name (2W, 4W, etc.)
                            plate_confidence=float(plate_conf),
                            plate_image_path=plate_path,
                            vehicle_image_path=vehicle_path,
                            timestamp=datetime.now(),
                            camera_name=self.camera_name
                        )
                        
                        # Mark as sent
                        self.anpr_sent_vehicles[track_id] = current_time
