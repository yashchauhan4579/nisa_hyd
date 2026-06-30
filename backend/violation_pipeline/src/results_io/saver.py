
import cv2
import os
import json
import time
import numpy as np
from datetime import datetime
from violation_pipeline.config.config import Config

# Import database and central server (lazy import to avoid circular deps)
_db_imported = False
_central_imported = False

# Lazy imports for OCR and detector (only when needed)
_ocr_recognizer = None
_traffic_detector = None


class SnapshotSaver:
    def __init__(self, camera_id: int = 1, camera_name: str = None):
        self.output_dir = Config.OUTPUT_DIR
        self.camera_id = camera_id
        self.camera_name = camera_name or f"CAMERA_{camera_id}"
        
    def _save_video_clip(self, frames, output_path, violation_type=None, bbox=None, plate_text=None):
        """Save a list of frames as an MP4 video."""
        if not frames:
            return
        
        try:
            import subprocess
            
            # Use original frames without any overlay
            h, w, _ = frames[0].shape
            
            # Step 1: Use mp4v (works reliably with OpenCV)
            temp_path = output_path.replace('.mp4', '_temp.mp4')
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(temp_path, fourcc, 25.0, (w, h))
            
            if not out.isOpened():
                print(f"  ⚠ Failed to initialize VideoWriter")
                return
            
            for frame in frames:
                out.write(frame)
            out.release()
            
            # Step 2: Transcode to H.264 using ffmpeg for browser compatibility
            ffmpeg_cmd = [
                'ffmpeg', '-y', '-i', temp_path,
                '-c:v', 'libx264', '-preset', 'fast',
                '-crf', '23', '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',  # Enable fast start for web streaming and thumbnails
                output_path
            ]
            
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=30)
            
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            if result.returncode == 0:
                print(f"  → Video clip saved: {os.path.basename(output_path)}")
            else:
                print(f"  ⚠ FFmpeg transcoding failed: {result.stderr[:200]}")
                
        except Exception as e:
            print(f"  ⚠ Error saving video clip: {e}")

    def save(self, frame, violation_type, details, video_buffer=None):
        """
        Save violation snapshot and metadata in backend-compatible format.
        Also saves to database and syncs to central server.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        rider_id = details.get('rider_id', 'unknown')
        
        # Backend expects a folder starting with "rider_"
        folder_name = f"rider_{rider_id}_{timestamp}"
        
        # Directory: output/{violation_type}/{folder_name}
        save_dir = os.path.join(self.output_dir, violation_type, folder_name)
        os.makedirs(save_dir, exist_ok=True)
        
        # 1. Prepare Images
        snapshot_path = os.path.join(save_dir, "violation_snapshot.jpg")
        plate_path = None
        
        # Determine which bbox to use for violation_snapshot.jpg
        # For seatbelt: use person detection bbox (zoomed)
        # For others: use rider/vehicle bbox (full)
        violation_type = details.get('violation', details.get('violation_type', ''))
        snapshot_bbox = None
        
        if 'seatbelt' in str(violation_type).lower() and 'bbox' in details and details['bbox'] is not None:
            # Seatbelt: Use person detection bbox (zoomed on violator)
            snapshot_bbox = details['bbox']
        elif 'bbox_rider' in details and details['bbox_rider'] is not None:
            # Other violations: Use rider/vehicle bbox
            snapshot_bbox = details['bbox_rider']
        
        if snapshot_bbox is not None:
            x1, y1, x2, y2 = map(int, snapshot_bbox)
            h, w = frame.shape[:2]
            
            padding = 50
            crop_x1 = max(0, x1 - padding)
            crop_y1 = max(0, y1 - padding)
            crop_x2 = min(w, x2 + padding)
            crop_y2 = min(h, y2 + padding)
            
            # Save RAW cropped frame (no bounding box, no text overlay)
            cropped_frame = frame[crop_y1:crop_y2, crop_x1:crop_x2].copy()
            # Use 100% JPEG quality for maximum image quality
            cv2.imwrite(snapshot_path, cropped_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 100])
        else:
            # If no specific bbox, save the full frame
            cv2.imwrite(snapshot_path, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 100])

        # B. Plate Image
        if 'bbox_plate' in details and details['bbox_plate'] is not None:
            px1, py1, px2, py2 = map(int, details['bbox_plate'])
            h, w = frame.shape[:2]
            
            px1 = max(0, px1-10); py1 = max(0, py1-10)
            px2 = min(w, px2+10); py2 = min(h, py2+10)
            
            plate_crop = frame[py1:py2, px1:px2]
            if plate_crop.size > 0:
                plate_path = os.path.join(save_dir, "plate_image.jpg")
                # Use 100% JPEG quality for plate images
                cv2.imwrite(plate_path, plate_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 100])


        # C. Vehicle Image
        vehicle_path = None
        if 'bbox_vehicle' in details and details['bbox_vehicle'] is not None:
            vx1, vy1, vx2, vy2 = map(int, details['bbox_vehicle'])
            h, w = frame.shape[:2]
            
            vx1 = max(0, vx1-20); vy1 = max(0, vy1-20)
            vx2 = min(w, vx2+20); vy2 = min(h, vy2+20)
            
            vehicle_crop = frame[vy1:vy2, vx1:vx2]
            if vehicle_crop.size > 0:
                vehicle_path = os.path.join(save_dir, "vehicle_crop.jpg")
                cv2.imwrite(vehicle_path, vehicle_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 100])
        else:
            print(f"  ⚠ No vehicle bbox provided, skipping vehicle crop")


        # D. Video Clip - DISABLED to reduce overhead
        # video_clip_path = None
        # if video_buffer and len(video_buffer) > 0:
        #     video_clip_path = os.path.join(save_dir, "video_clip.mp4")
        #     
        #     # Determine which bbox to use for visualization
        #     viz_bbox = details.get('bbox_vehicle') or details.get('bbox_rider')
        #     
        #     # Pass violation metadata for overlay
        #     self._save_video_clip(
        #         video_buffer, 
        #         video_clip_path,
        #         violation_type=violation_type,
        #         bbox=viz_bbox,
        #         plate_text=details.get('plate_text')
        #     )
        # else:
        #     print(f"  ⚠ Video buffer empty or missing (len={len(video_buffer) if video_buffer else 0}), skipping video")
        video_clip_path = None  # Video generation disabled

        # 2. POST-PROCESSING: Run OCR on snapshot if plate is UNKNOWN
        plate_text = details.get('plate_text') or "UNKNOWN"
        plate_conf = details.get('plate_conf', 0.0)
        
        # If plate is UNKNOWN, try to extract it from the violation snapshot
        if plate_text == "UNKNOWN" or not plate_text or plate_text.strip() == "":
            print(f"  🔍 Plate is UNKNOWN, running OCR post-processing on FULL FRAME...")
            
            # Use vehicle or rider bbox as spatial constraint
            # This prevents picking up a random plate from another vehicle
            spatial_constraint = None
            if 'bbox_vehicle' in details and details['bbox_vehicle']:
                spatial_constraint = details['bbox_vehicle']
            elif 'bbox_rider' in details and details['bbox_rider']:
                spatial_constraint = details['bbox_rider']
            
            detected_plate, detected_conf, plate_bbox = self._extract_plate_from_frame(frame, vehicle_bbox=None)  # PATCH_2026-06-08: frame is already cropped, spatial filter rejects everything
            if detected_plate and detected_plate != "UNKNOWN":
                plate_text = detected_plate
                plate_conf = detected_conf
                print(f"  ✅ Extracted plate from frame: {plate_text} (conf: {detected_conf:.2f})")
                
                # Update plate_path if we found a plate
                if plate_bbox and ('bbox_plate' not in details or details['bbox_plate'] is None):
                    px1, py1, px2, py2 = map(int, plate_bbox)
                    h, w = frame.shape[:2]
                    px1 = max(0, px1-10); py1 = max(0, py1-10)
                    px2 = min(w, px2+10); py2 = min(h, py2+10)
                    plate_crop = frame[py1:py2, px1:px2]
                    if plate_crop.size > 0:
                        plate_path = os.path.join(save_dir, "plate_image.jpg")
                        cv2.imwrite(plate_path, plate_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 100])
                        details['bbox_plate'] = plate_bbox
            else:
                print(f"  ⚠️  Could not extract plate from frame")
        
        speed = details.get('speed', 0.0)
        
        # 2. Save Metadata
        txt_path = os.path.join(save_dir, "license_number.txt")
        with open(txt_path, 'w') as f:
            f.write(f"License Plate Number: {plate_text}\n")
            f.write(f"Detection Confidence: {plate_conf:.2f}\n")
            f.write(f"Rider ID: {rider_id}\n")
            f.write(f"Violation Type: {violation_type}\n")
            f.write(f"Speed: {speed} km/h\n")
            if video_clip_path:
                f.write(f"Video Clip: {os.path.basename(video_clip_path)}\n")

        # 3. Save JSON Metadata
        meta_path = os.path.join(save_dir, "metadata.json")
        if video_clip_path:
            details['video_path'] = video_clip_path
            
        try:
            def convert(o):
                if isinstance(o, (np.float32, np.float64)): return float(o)
                if isinstance(o, (np.int32, np.int64)): return int(o)
                if hasattr(o, 'item'): return o.item()
                if hasattr(o, 'tolist'): return o.tolist()
                return str(o)
                
            with open(meta_path, 'w') as f:
                json.dump(details, f, indent=4, default=convert)
        except Exception as e:
            print(f"Error saving JSON metadata: {e}")
        
        print(f"✓ Saved {violation_type} violation to: {folder_name}")
        
        # Get detection confidence (rider confidence or plate confidence)
        detection_confidence = details.get(
            'confidence',
            details.get(
                'rider_conf',
                details.get('plate_conf', 0.0)
            )
        )
        
        # 4. Save to Database
        self._save_to_database(violation_type, plate_text, plate_conf, speed, snapshot_path, plate_path, vehicle_path, video_clip_path)
        
        # 5. Sync to Central Server (async)
        # DASHBOARD FILTERS: Only sync violations that meet dashboard criteria
        # - Must NOT be SPEED violations
        # - Must be within last 24 hours (checked in sync function)
        # - UNKNOWN plates are filtered (Anti-Spam)
        is_speed_violation = violation_type and violation_type.upper() == "SPEED"
        is_unknown_plate = (plate_text == "UNKNOWN" or not plate_text or plate_text.strip() == "")
        
        # Sync all violations except SPEED and UNKNOWN plates
        should_upload = not is_speed_violation and not is_unknown_plate
        
        # FIXED: Allow SPEED violations to be uploaded (even if plate is unknown)
        if is_speed_violation:
            should_upload = True
            
        if should_upload:
            # Map internal type to Central Server type
            server_violation_type = violation_type
            if violation_type == "seatbelt":
                server_violation_type = "No Seatbelt"
            elif violation_type == "mobile":
                server_violation_type = "MOBILE_USE"

            self._sync_to_central_server(
                violation_type=server_violation_type,
                plate_number=plate_text,
                plate_confidence=plate_conf,
                speed=speed,
                snapshot_path=snapshot_path,
                plate_path=plate_path,
                vehicle_path=vehicle_path,
                video_path=video_clip_path,
                confidence=detection_confidence,
                metadata=details  # Pass full details as metadata
            )
        else:
            reason = "SPEED violation" if is_speed_violation else "UNKNOWN plate"
            print(f"  ℹ Skipping central server upload: {violation_type} violation ({reason} filtered)")
    
    def _extract_plate_from_frame(self, frame, vehicle_bbox=None):
        """
        Post-process violation frame to extract license plate using OCR.
        Uses FULL FRAME (not cropped snapshot) to catch plates outside rider crop.
        Tries multiple confidence thresholds and image preprocessing.
        If vehicle_bbox is provided, only accepts plates overlapping/inside that box.
        Returns: (plate_text, plate_conf, plate_bbox) tuple
        """
        global _ocr_recognizer, _traffic_detector
        
        try:
            # Lazy load OCR and detector (only when needed)
            if _ocr_recognizer is None:
                from violation_pipeline.src.core.ocr import OCRRecognizer
                _ocr_recognizer = OCRRecognizer()
                print("  ✓ OCR Recognizer loaded for post-processing")
            
            if _traffic_detector is None:
                from violation_pipeline.src.core.detector import Detector
                _traffic_detector = Detector(Config.MODEL_TRAFFIC, Config.DEVICE)
                print("  ✓ Traffic Detector loaded for post-processing")
            
            # Plate class ID from Config (unified new_v1 engine has plate=3)
            plate_class_id = Config.CLASS_PLATE
            
            # Try multiple confidence thresholds (start high, go lower)
            confidence_levels = [0.45, 0.35, 0.25, 0.15, 0.10]
            all_plates = []
            
            for conf_thresh in confidence_levels:
                detections = _traffic_detector.detect(frame, conf=conf_thresh, classes=None)
                
                for det in detections:
                    if len(det) >= 6:
                        cls_id = int(det[5])
                        if cls_id == plate_class_id:
                            # Avoid duplicates (same plate detected at different conf levels)
                            px1, py1, px2, py2 = map(int, det[:4])
                            
                            # SPATIAL FILTER: Check if plate is valid for this vehicle/rider
                            if vehicle_bbox is not None:
                                vx1, vy1, vx2, vy2 = map(int, vehicle_bbox)
                                v_width = vx2 - vx1
                                v_height = vy2 - vy1
                                
                                # Horizontal: Strict (prevent side-by-side mixing)
                                # Allow 20% margin on sides
                                margin_x = v_width * 0.2
                                
                                # Vertical: Generous downwards (plate can be below rider/bike)
                                # Allow 10% above, but 100% (1.0x height) below
                                margin_y_top = v_height * 0.1
                                margin_y_bottom = v_height * 1.0 
                                
                                limit_x1 = vx1 - margin_x
                                limit_x2 = vx2 + margin_x
                                limit_y1 = vy1 - margin_y_top
                                limit_y2 = vy2 + margin_y_bottom
                                
                                p_center_x = (px1 + px2) / 2
                                p_center_y = (py1 + py2) / 2
                                
                                if not (limit_x1 < p_center_x < limit_x2 and limit_y1 < p_center_y < limit_y2):
                                    continue # Skip plate outside valid region
                                    
                            is_duplicate = False
                            for existing in all_plates:
                                ex_px1, ex_py1, ex_px2, ex_py2 = map(int, existing[:4])
                                # Check if boxes overlap significantly
                                overlap_x = max(0, min(px2, ex_px2) - max(px1, ex_px1))
                                overlap_y = max(0, min(py2, ex_py2) - max(py1, ex_py1))
                                overlap_area = overlap_x * overlap_y
                                area1 = (px2 - px1) * (py2 - py1)
                                area2 = (ex_px2 - ex_px1) * (ex_py2 - ex_py1)
                                if overlap_area > 0.5 * min(area1, area2):
                                    is_duplicate = True
                                    # Keep the one with higher confidence
                                    if det[4] > existing[4]:
                                        all_plates.remove(existing)
                                        all_plates.append(det)
                                    break
                            
                            if not is_duplicate:
                                all_plates.append(det)
            
            if not all_plates:
                return "UNKNOWN", 0.0, None
            
            # Sort by confidence (highest first)
            all_plates.sort(key=lambda x: x[4], reverse=True)
            
            # Process each plate and run OCR with preprocessing
            best_plate = None
            best_conf = 0.0
            best_bbox = None
            
            for plate_det in all_plates:
                px1, py1, px2, py2 = map(int, plate_det[:4])
                plate_conf_det = plate_det[4]

                # Feed the RAW detector bbox to OCR — padding adds background
                # text/edges that the CRNN reads as plate characters, corrupting
                # the result. The saved evidence JPEG is padded separately in
                # save_violation, so this only affects what OCR sees.
                h_img, w_img = frame.shape[:2]
                tight_x1 = max(0, px1)
                tight_y1 = max(0, py1)
                tight_x2 = min(w_img, px2)
                tight_y2 = min(h_img, py2)

                plate_crop = frame[tight_y1:tight_y2, tight_x1:tight_x2]
                if plate_crop.size == 0:
                    continue

                ocr_results = _ocr_recognizer.recognize_batch([plate_crop])
                ocr_text = None

                if ocr_results:
                    _, ocr_text = ocr_results[0]

                # Validate OCR result
                if ocr_text and len(ocr_text.strip()) >= 3:
                    ocr_text = ocr_text.strip()
                    # Filter out obvious garbage (all numbers, all letters, too long)
                    if len(ocr_text) <= 15 and not (ocr_text.isdigit() or ocr_text.isalpha()):
                        # Use combined confidence
                        combined_conf = plate_conf_det * 0.85
                        if combined_conf > best_conf:
                            best_conf = combined_conf
                            best_plate = ocr_text
                            # Return the TIGHT bbox; saver pads it later for the
                            # evidence JPEG. Returning the padded bbox here would
                            # double-pad when callers re-pad on top.
                            best_bbox = [tight_x1, tight_y1, tight_x2, tight_y2]
            
            if best_plate:
                return best_plate, best_conf, best_bbox
            
            return "UNKNOWN", 0.0, None
            
        except Exception as e:
            print(f"  ⚠️  Error in OCR post-processing: {e}")
            import traceback
            traceback.print_exc()
            return "UNKNOWN", 0.0, None
    
    
    def _save_to_database(self, violation_type, plate_text, plate_conf, speed, snapshot_path, plate_path, vehicle_path, video_path=None):
        """Save violation to SQLite database."""
        try:
            from violation_pipeline.database import SessionLocal, Violation
            
            db = SessionLocal()
            violation = Violation(
                camera_id=self.camera_id,
                violation_type=violation_type,
                plate_number=plate_text if plate_text != "UNKNOWN" else None,
                plate_confidence=plate_conf,
                speed=speed if speed else None,
                snapshot_path=snapshot_path,
                plate_image_path=plate_path,
                vehicle_image_path=vehicle_path,
                video_path=video_path, # Mapping to video_path in schema
                synced_to_central=False
            )
            db.add(violation)
            db.commit()
            db.close()
            print(f"  → Saved to database")
        except Exception as e:
            # print(f"  ⚠ Database error: {e}") 
            # Suppress schema mismatch errors if column missing
             print(f"  → Video path not saved to DB (column likely missing)")

    def _sync_to_central_server(self, violation_type, plate_number, plate_confidence, speed, snapshot_path, plate_path, vehicle_path=None, video_path=None, confidence=None, metadata=None):
        """Sync violation to central server (async)."""
        try:
            from violation_pipeline.central_server_client import send_violation_async
            
            send_violation_async(
                camera_id=self.camera_id,
                violation_type=violation_type,
                plate_number=plate_number,
                plate_confidence=plate_confidence,
                snapshot_image_path=snapshot_path,
                plate_image_path=plate_path,
                vehicle_image_path=vehicle_path,
                video_image_path=video_path, # Pass video path
                speed=speed if "speed" in violation_type.lower() else None,
                speed_limit=Config.SPEED_LIMIT if "speed" in violation_type.lower() else None,
                camera_name=self.camera_name,
                confidence=confidence,
                metadata=metadata
            )
            print(f"  → Syncing to central server...")
        except Exception as e:
            print(f"  ⚠ Central server sync error: {e}")
