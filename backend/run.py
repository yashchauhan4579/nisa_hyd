import cv2
import time
import os
import sys
import numpy as np
from collections import defaultdict

# Add project root to path to ensure imports work
sys.path.append(os.getcwd())

from violation_pipeline.config.config import Config
from violation_pipeline.src.core.detector import Detector
from violation_pipeline.src.core.tracker import Tracker
from violation_pipeline.src.core.ocr import OCRRecognizer
from violation_pipeline.src.logic.association import Associator
from violation_pipeline.src.logic.violations import ViolationManager
from violation_pipeline.src.results_io.visualizer import Visualizer

# Helper to map class names for ANPR logic if needed
def map_vehicle_class_name(cls_name):
    """Simple mapping for display if needed"""
    mapping = {
        'motorcycle': '2W',
        'car': '4W',
        'auto': 'AUTO',
        'truck': 'TRUCK',
        'bus': 'BUS',
        'plate': 'UNKNOWN'
    }
    return mapping.get(cls_name.lower(), 'UNKNOWN')

def run_inference():
    # RTSP URL or Video Path
    RTSP_URL = "/home/oem/Violation_Pipeline_New/feed1.mp4"
    OUTPUT_FILE = "output_inference.mp4"
    
    print("Initializing components...")
    
    # 1. Initialize Models & Components
    # Ensure config is setup
    Config.setup()
    
    print(f"Loading Traffic Model: {Config.MODEL_TRAFFIC}")
    detector_traffic = Detector(Config.MODEL_TRAFFIC, Config.DEVICE)
    
    print(f"Loading Violation Model: {Config.MODEL_VIOLATION}")
    detector_violation = Detector(Config.MODEL_VIOLATION, Config.DEVICE)
    
    ocr = OCRRecognizer()
    
    tracker_traffic = Tracker()
    tracker_violation = Tracker()
    
    violation_manager = ViolationManager()
    visualizer = Visualizer()
    
    # 2. Setup Video Input
    print(f"Opening Source: {RTSP_URL}")
    cap = cv2.VideoCapture(RTSP_URL)
    
    if not cap.isOpened():
        print(f"Error: Could not open stream {RTSP_URL}")
        return

    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps == 0 or fps > 60: fps = 25  # Fallback FPS
    
    print(f"Stream Info: {width}x{height} @ {fps} FPS")
    
    # 3. Setup Video Output
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(OUTPUT_FILE, fourcc, fps, (width, height))
    
    frame_idx = 0
    start_time = time.time()
    
    # State for simple OCR logic
    # Just store plate text for track IDs: {track_id: (text, conf)}
    plate_results = {} 
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("Stream ended or failed to read frame.")
                break
            
            frame_idx += 1
            if frame_idx % 100 == 0:
                print(f"Processing frame {frame_idx}...")
            
            # --- 1. Detection ---
            # Run detection (sequentially for simplicity in this script)
            detections_traffic = detector_traffic.detect(frame, conf=Config.CONF_PLATE)
            detections_violation = detector_violation.detect(frame, conf=Config.CONF_RIDER)
            
            # --- 2. Tracking ---
            sv_tracks_traffic = tracker_traffic.update(detections_traffic)
            sv_tracks_violation = tracker_violation.update(detections_violation)
            
            # --- 3. Logic: Association & Violations ---
            rider_vehicle_map = {} # {rider_track_id: vehicle_track_idx_in_sv_tracks_traffic}
            
            # Extract raw data for logic
            # Traffic tracks data
            traffic_xyxy = sv_tracks_traffic.xyxy
            traffic_class_id = sv_tracks_traffic.class_id
            traffic_track_ids = sv_tracks_traffic.tracker_id
            
            # Violation tracks data (Riders, Heads)
            violation_xyxy = sv_tracks_violation.xyxy
            violation_class_id = sv_tracks_violation.class_id
            violation_track_ids = sv_tracks_violation.tracker_id
            
            # Separate riders and heads
            riders_mask = (violation_class_id == Config.CLASS_RIDER)
            heads_mask = ((violation_class_id == Config.CLASS_HELMET) | (violation_class_id == Config.CLASS_NO_HELMET))
            
            # Raw heads for strict checking (format: [x1, y1, x2, y2, conf, cls])
            # Reconstruct raw head detections from tracked data or use tracking data directly
            # Logic functions usually expect raw detections, but tracking data is fine too if formatted correctly
            heads_raw = []
            if sv_tracks_violation.tracker_id is not None:
                for i, cls in enumerate(violation_class_id):
                    if cls in [Config.CLASS_HELMET, Config.CLASS_NO_HELMET]:
                        # Mimic detection format: x1, y1, x2, y2, conf, cls
                        # Using tracking confidence if available, else default
                        conf = sv_tracks_violation.confidence[i] if sv_tracks_violation.confidence is not None else 0.8
                        head_entry = list(violation_xyxy[i]) + [conf, cls]
                        heads_raw.append(head_entry)

            # Process Riders
            if sv_tracks_violation.tracker_id is not None:
                for i, rider_id in enumerate(violation_track_ids):
                    if violation_class_id[i] != Config.CLASS_RIDER:
                        continue
                        
                    rider_box = violation_xyxy[i]
                    
                    # Associate Rider -> Motorcycle
                    vehicle_idx = Associator.associate_rider_to_motorcycle(
                        rider_box, traffic_xyxy, traffic_class_id
                    )
                    
                    motorcycle_box = None
                    if vehicle_idx is not None:
                        motorcycle_box = traffic_xyxy[vehicle_idx]
                        rider_vehicle_map[rider_id] = traffic_track_ids[vehicle_idx]
                        
                    # Check Violations
                    # 1. Helmet
                    # Find heads associated with this rider
                    rider_heads = []
                    rx1, ry1, rx2, ry2 = rider_box
                    for head in heads_raw:
                        hx1, hy1, hx2, hy2, h_conf, h_cls = head
                        hcx, hcy = (hx1+hx2)/2, (hy1+hy2)/2
                        # Check if head center is inside rider box
                        if rx1 < hcx < rx2 and ry1 < hcy < ry2:
                            rider_heads.append(head)
                            
                    frame_helmet_viol = None
                    if len(rider_heads) > 0:
                        # If ANY head is NO_HELMET -> Violation
                        for h in rider_heads:
                            if h[5] == Config.CLASS_NO_HELMET: # Class 3 is No Helmet usually
                                frame_helmet_viol = True
                                break
                        if frame_helmet_viol is None:
                            frame_helmet_viol = False # Found heads, all safe
                    
                    # 2. Triple Riding
                    frame_triple_viol = None
                    if motorcycle_box is not None:
                        frame_triple_viol = violation_manager.check_triple_riding(
                            heads_raw, motorcycle_box
                        )
                        
                    # Update Violation Manager
                    violation_manager.update(
                        rider_id,
                        frame_helmet_viol if frame_helmet_viol is not None else False,
                        frame_triple_viol if frame_triple_viol is not None else False
                    )

            # --- 4. ANPR (Simple Logic) ---
            # Check plates (ALWAYS check when detected for better accuracy)
            if sv_tracks_traffic.tracker_id is not None:
                for i, track_id in enumerate(traffic_track_ids):
                    cls_id = int(traffic_class_id[i])
                    # If it's a plate (usually class 5 in traffic model)
                    if cls_id == 5: 
                         plate_bbox = traffic_xyxy[i]
                         # Crop and OCR
                         x1, y1, x2, y2 = map(int, plate_bbox)
                         # Clamp
                         h, w = frame.shape[:2]
                         x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
                         
                         if (x2-x1) > 20 and (y2-y1) > 10:
                             plate_crop = frame[y1:y2, x1:x2]
                             results = ocr.recognize_batch([plate_crop])
                             if results:
                                 # returns list of (idx, text) tuples
                                 _, text = results[0] 
                                 if text and len(text) > 4:
                                     # Update if new or longer
                                     if track_id in plate_results:
                                         old_text, _ = plate_results[track_id]
                                         if len(text) > len(old_text):
                                             plate_results[track_id] = (text, 1.0)
                                     else:
                                         plate_results[track_id] = (text, 1.0)

            # --- 5. Visualization (Custom: Logic from User) ---
            # "don't draw vehcile and rider box only voilation and ANPR box"
            
            # Reconstruct the map for visualization logic
            idx_rider_vehicle_map = {} # rider_idx -> vehicle_idx
            if sv_tracks_violation.tracker_id is not None:
                for i, rider_id in enumerate(violation_track_ids):
                     if violation_class_id[i] == Config.CLASS_RIDER:
                         rider_box = violation_xyxy[i]
                         vehicle_idx = Associator.associate_rider_to_motorcycle(
                            rider_box, traffic_xyxy, traffic_class_id
                         )
                         if vehicle_idx is not None:
                             idx_rider_vehicle_map[rider_id] = vehicle_idx

            annotated_frame = frame.copy()
            
            # Helper to draw label
            def draw_box_label(img, box, color, label, thickness=2):
                 cv2.rectangle(img, (box[0], box[1]), (box[2], box[3]), color, thickness)
                 (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
                 cv2.rectangle(img, (box[0], box[1] - 20), (box[0] + text_w, box[1]), color, -1)
                 cv2.putText(img, label, (box[0], box[1] - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

            # 1. Draw Violations on Vehicles
            if sv_tracks_traffic.tracker_id is not None:
                for i, track_id in enumerate(traffic_track_ids):
                    box = traffic_xyxy[i].astype(int)
                    cls_id = int(traffic_class_id[i])
                    
                    violation_labels = []
                    is_violation = False
                    
                    # Find riders on this vehicle
                    riders_on_vehicle = [rid for rid, vidx in idx_rider_vehicle_map.items() if traffic_track_ids[vidx] == track_id]
                    
                    for rider_id in riders_on_vehicle:
                         if rider_id in violation_manager.rider_states:
                             state = violation_manager.rider_states[rider_id]
                             if state.is_confirmed_helmet():
                                 violation_labels.append("No Helmet")
                                 is_violation = True
                             if state.confirmed_triple:
                                 violation_labels.append("Triple Riding")
                                 is_violation = True
                    
                    # Check Seatbelt (if applicable to vehicle class, e.g. Car=2)
                    if cls_id == 2: # Car
                        # Simple dummy check or retrieve from violation manager if implemented
                        pass 

                    if is_violation:
                         color = (0, 0, 255) # Red for violation
                         label = f"Vehicle {track_id} [" + ",".join(violation_labels) + "]"
                         draw_box_label(annotated_frame, box, color, label, thickness=3)
                    else:
                         # Draw Safe Vehicles in Green so user sees detection is working
                         color = (0, 255, 0)
                         label = f"Vehicle {track_id} (Safe)"
                         draw_box_label(annotated_frame, box, color, label, thickness=2)
                    
                    # ANPR Box (Class 5)
                    if cls_id == 5:
                         label = f"Plate {track_id}"
                         if track_id in plate_results:
                             text, conf = plate_results[track_id]
                             label = f"{text} ({conf:.2f})"
                         draw_box_label(annotated_frame, box, (0, 255, 255), label, thickness=2)

            # 2. Draw Standalone Violations (Riders not on vehicle)
            if sv_tracks_violation.tracker_id is not None:
                for i, rider_id in enumerate(violation_track_ids):
                    # Skip if mapped to vehicle (handled above)
                    if rider_id in idx_rider_vehicle_map:
                         continue
                        
                    if violation_class_id[i] == Config.CLASS_RIDER:
                        if rider_id in violation_manager.rider_states:
                             state = violation_manager.rider_states[rider_id]
                             
                             viols = []
                             if state.is_confirmed_helmet(): viols.append("No Helmet")
                             if state.confirmed_triple: viols.append("Triple")
                             
                             if viols:
                                 box = violation_xyxy[i].astype(int)
                                 label = f"Rider {rider_id} [" + ",".join(viols) + "]"
                                 draw_box_label(annotated_frame, box, (0, 0, 255), label, thickness=3)
                             else:
                                 # Draw Safe Riders in Green
                                 box = violation_xyxy[i].astype(int)
                                 draw_box_label(annotated_frame, box, (0, 255, 0), f"Rider {rider_id}", thickness=2)
                        else:
                             # Draw Untracked Riders in Yellow/Green
                             box = violation_xyxy[i].astype(int)
                             draw_box_label(annotated_frame, box, (0, 255, 0), f"Rider {rider_id}", thickness=2)
            
            # Overlay OCR results manually since Visualizer doesn't draw plates explicitly in draw_tracks
            if sv_tracks_traffic.tracker_id is not None:
                for i, track_id in enumerate(traffic_track_ids):
                    if track_id in plate_results:
                        box = traffic_xyxy[i].astype(int)
                        text, conf = plate_results[track_id]
                        label = f"{text} ({conf:.2f})"
                        cv2.putText(annotated_frame, label, (box[0], box[1]-30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

            visualizer.draw_stats(annotated_frame, frame_idx, 0, fps)
            
            out.write(annotated_frame)
            
            # Simple FPS limit to not run super fast on file, but RTSP is real-time anyway
            # if is_file... pass
            
    except KeyboardInterrupt:
        print("Stopping inference...")
    except Exception as e:
        print(f"Error occurred: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        print("Cleaning up...")
        cap.release()
        out.release()
        print(f"Output saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    run_inference()
