import cv2
import time
import os
import sys
import numpy as np
from collections import defaultdict

# Add project root to path
sys.path.append(os.getcwd())

from violation_pipeline.config.config import Config
from violation_pipeline.src.core.detector import Detector
from violation_pipeline.src.core.tracker import Tracker
from violation_pipeline.src.core.ocr import OCRRecognizer
from violation_pipeline.src.results_io.visualizer import Visualizer

# Simplified Visualizer for just ANPR/VCC
class SimpleVisualizer:
    def draw(self, frame, traffic_tracks, plate_results, vcc_counts):
        annotated_frame = frame.copy()
        
        # Draw Traffic (Vehicles + Plates)
        if traffic_tracks.tracker_id is not None:
             for i, track_id in enumerate(traffic_tracks.tracker_id):
                 box = traffic_tracks.xyxy[i].astype(int)
                 cls_id = int(traffic_tracks.class_id[i])
                 
                 # Color based on class
                 if cls_id == 5: # Plate
                     color = (0, 255, 255) # Yellow
                     label = f"Plate #{track_id}"
                     
                     # Add OCR if available
                     # Add OCR if available
                     if track_id in plate_results:
                         text, conf = plate_results[track_id]
                         label = f"{text}"
                         # Draw filled box for text with High Visibility
                         self._draw_label(annotated_frame, label, box, (0, 0, 0), txt_color=(0, 255, 255), scale=0.8, thickness=2)
                     else:
                         self._draw_label(annotated_frame, label, box, (0, 0, 0), txt_color=(0, 255, 255), scale=0.5, thickness=1)
                 else:
                     color = (255, 100, 0) # Blue-ish
                     vehicle_type = {0: 'Auto', 1: 'Bus', 2: 'Car', 3: 'Motorcycle', 4: 'Truck', 5: 'Plate'}.get(cls_id, 'Vehicle')
                     label = f"{vehicle_type} #{track_id}"
                 
                 # Thicker bounding box
                 cv2.rectangle(annotated_frame, (box[0], box[1]), (box[2], box[3]), color, 4)
                 
                 if cls_id != 5: # Don't double draw label for plate if OCR is there
                    # Larger, thicker text for vehicle classes
                    self._draw_label(annotated_frame, label, box, color, scale=0.9, thickness=2)
        
        # Draw VCC Stats
        y_offset = 30
        cv2.putText(annotated_frame, "VCC Counts (Session):", (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        y_offset += 25
        for cls_name, count in vcc_counts.items():
            text = f"{cls_name}: {count}"
            cv2.putText(annotated_frame, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            y_offset += 25

        return annotated_frame

    def _draw_label(self, frame, label, box, bg_color, txt_color=(255, 255, 255), scale=0.6, thickness=1):
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
        x1, y1 = box[0], box[1]
        cv2.rectangle(frame, (x1, y1 - 20 - int(scale*10)), (x1 + text_w, y1), bg_color, -1)
        cv2.putText(frame, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, scale, txt_color, thickness)

def run_anpr_vcc():
    # RTSP URL or Video Path
    RTSP_URL = "/home/oem/Violation_Pipeline_New/feed1.mp4"
    OUTPUT_FILE = "output_anpr_vcc.mp4"
    
    print("Initializing ANPR/VCC Pipeline...")
    Config.setup()
    
    # Only load Traffic Model
    print(f"Loading Traffic Model: {Config.MODEL_TRAFFIC}")
    detector_traffic = Detector(Config.MODEL_TRAFFIC, Config.DEVICE)
    
    ocr = OCRRecognizer()
    tracker_traffic = Tracker()
    visualizer = SimpleVisualizer()
    
    # Video Input
    print(f"Opening Source: {RTSP_URL}")
    cap = cv2.VideoCapture(RTSP_URL) # Standard capture for file
    
    if not cap.isOpened():
        print("Error: Could not open stream")
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps > 60 or fps == 0: fps = 25
    
    print(f"Stream: {width}x{height} @ {fps} FPS")
    
    # Video Output
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(OUTPUT_FILE, fourcc, fps, (width, height))
    
    frame_idx = 0
    plate_results = {} # {track_id: (text, conf)}
    vcc_seen = set() # {track_id}
    vcc_counts = defaultdict(int) 
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret: break
            
            frame_idx += 1
            if frame_idx % 50 == 0: print(f"Processing frame {frame_idx}...")
            
            # 1. Detect Traffic (Vehicles + Plates)
            detections = detector_traffic.detect(frame, conf=Config.CONF_PLATE)
            
            # 2. Track
            tracks = tracker_traffic.update(detections)
            
            # 3. Logic
            if tracks.tracker_id is not None:
                for i, track_id in enumerate(tracks.tracker_id):
                    cls_id = int(tracks.class_id[i])
                    box = tracks.xyxy[i].astype(int)
                    
                    # VCC Logic
                    # Filter out plates (usually class 5, verify with map if needed but assuming 5 based on other code)
                    # Pipeline config says: 0=Auto, 1=Bus, 2=Car, 3=Motorcycle, 4=Truck, 5=Plate
                    if cls_id != 5: 
                        if track_id not in vcc_seen:
                            vcc_seen.add(track_id)
                            vehicle_name = {0: 'Auto', 1: 'Bus', 2: 'Car', 3: 'Motorcycle', 4: 'Truck'}.get(cls_id, 'Unknown')
                            vcc_counts[vehicle_name] += 1
                    
                    # ANPR Logic
                    elif cls_id == 5: # Plate
                        # ALWAYS run OCR on detected plates as requested
                        x1, y1, x2, y2 = max(0, box[0]), max(0, box[1]), min(width, box[2]), min(height, box[3])
                        if (x2-x1) > 20 and (y2-y1) > 10:
                            crop = frame[y1:y2, x1:x2]
                            results = ocr.recognize_batch([crop])
                            
                            if results:
                                _, text = results[0] # unpacked idx, text
                                
                                # Update if new or longer text (heuristic for 'better' if no conf)
                                if text and len(text) > 4: 
                                    # If already exists, prefer longer text
                                    if track_id in plate_results:
                                        old_text, _ = plate_results[track_id]
                                        if len(text) > len(old_text):
                                            plate_results[track_id] = (text, 1.0)
                                    else:
                                        plate_results[track_id] = (text, 1.0)

            # 4. Visualize
            annotated = visualizer.draw(frame, tracks, plate_results, vcc_counts)
            out.write(annotated)
            
    except KeyboardInterrupt:
        print("Stopping...")
    finally:
        cap.release()
        out.release()
        print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    run_anpr_vcc()
