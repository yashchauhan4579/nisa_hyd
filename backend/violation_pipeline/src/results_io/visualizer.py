import cv2
import numpy as np
from violation_pipeline.config.config import Config

class Visualizer:
    """
    Lightweight visualizer for the Unified Pipeline.
    Draws tracking boxes, violation status, and basic statistics.
    """
    
    # Colors (B, G, R)
    COLOR_SAFE = (0, 255, 0)      # Green
    COLOR_VIOLATION = (0, 0, 255) # Red
    COLOR_TRAFFIC = (255, 100, 0) # Blue-ish for vehicles
    COLOR_PLATE = (0, 255, 255)   # Yellow
    COLOR_TEXT = (255, 255, 255)  # White
    
    def draw_tracks(self, frame, rider_tracks, traffic_tracks, violation_manager, fused_vehicles=None, rider_vehicle_map=None):
        """
        Draws all tracks with unified visualization (reduced clutter).
        
        Args:
            frame: Image to draw on.
            rider_tracks: Supervision Detections object for riders.
            traffic_tracks: Supervision Detections object for traffic.
            violation_manager: Instance of ViolationManager.
            fused_vehicles: List of FusedVehicle objects from Radar Logic.
            rider_vehicle_map: Dict {rider_id: vehicle_idx} for merging boxes.
        """
        annotated_frame = frame.copy()
        
        # Build quick lookups
        fused_map = {v.camera_track_id: v for v in fused_vehicles} if fused_vehicles else {}
        drawn_riders = set()  # Track which riders have been drawn
        
        # Build reverse map: vehicle_idx -> list of rider_ids
        vehicle_to_riders = {}
        if rider_vehicle_map:
            for rider_id, vehicle_idx in rider_vehicle_map.items():
                if vehicle_idx not in vehicle_to_riders:
                    vehicle_to_riders[vehicle_idx] = []
                vehicle_to_riders[vehicle_idx].append(rider_id)
        
        # 1. Draw Vehicles (with merged rider info if applicable)
        if traffic_tracks.tracker_id is not None:
            for i, track_id in enumerate(traffic_tracks.tracker_id):
                box = traffic_tracks.xyxy[i].astype(int)
                
                # Default color and label
                color = self.COLOR_TRAFFIC
                label_parts = []
                has_violation = False
                
                # Check if this vehicle has riders
                rider_ids_on_vehicle = vehicle_to_riders.get(i, [])
                
                if rider_ids_on_vehicle:
                    # UNIFIED: Show rider info on vehicle box
                    for rider_id in rider_ids_on_vehicle:
                        label_parts.append(f"Rider #{rider_id}")
                        drawn_riders.add(rider_id)
                        
                        # Check violation status
                        if rider_id in violation_manager.rider_states:
                            state = violation_manager.rider_states[rider_id]
                            violations = []
                            if state.is_confirmed_helmet():
                                violations.append("No Helmet")
                                has_violation = True
                            if state.confirmed_triple:
                                violations.append("Triple")
                                has_violation = True
                            if violations:
                                label_parts.append(f"[{','.join(violations)}]")
                    
                    # Add vehicle type
                    if traffic_tracks.class_id is not None:
                        cls_id = int(traffic_tracks.class_id[i])
                        vehicle_type = {0: 'Auto', 1: 'Bus', 2: 'Car', 3: 'Motorcycle', 4: 'Plate', 5: 'Truck'}.get(cls_id, 'Vehicle')
                        label_parts.append(f"({vehicle_type})")
                else:
                    # Standalone vehicle (no rider)
                    label_parts.append(f"Vehicle #{track_id}")
                
                # Check Radar/Speed data
                if track_id in fused_map:
                    v = fused_map[track_id]
                    
                    if v.has_radar_match:
                        arrow = "↓" if v.is_approaching else "↑"
                        label_parts.append(f"RADAR: {int(v.radar_speed_kmh)}km/h {arrow}")
                    
                    if v.is_violation:
                        has_violation = True
                        label_parts.append("[SPEED]")
                
                # Set color based on violation status
                if has_violation:
                    color = self.COLOR_VIOLATION
                elif rider_ids_on_vehicle:
                    color = self.COLOR_SAFE  # Has rider but no violation
                
                # Draw box
                thickness = 3 if has_violation else 2
                cv2.rectangle(annotated_frame, (box[0], box[1]), (box[2], box[3]), color, thickness)
                
                # Draw label
                label = " ".join(label_parts)
                self._draw_label(annotated_frame, label, box, color)

        # 2. Draw Standalone Riders (not associated with vehicles)
        if rider_tracks.tracker_id is not None:
            for i, rider_id in enumerate(rider_tracks.tracker_id):
                # Skip if already drawn on vehicle
                if rider_id in drawn_riders:
                    continue
                
                box = rider_tracks.xyxy[i].astype(int)
                
                # Check violation status
                is_violation = False
                violation_types = []
                
                if rider_id in violation_manager.rider_states:
                    state = violation_manager.rider_states[rider_id]
                    if state.is_confirmed_helmet():
                        is_violation = True
                        violation_types.append("No Helmet")
                    if state.confirmed_triple:
                        is_violation = True
                        violation_types.append("Triple")
                
                color = self.COLOR_VIOLATION if is_violation else self.COLOR_SAFE
                
                # Build Label
                label = f"Rider #{rider_id}"
                if is_violation:
                    label += f" [{','.join(violation_types)}]"
                
                cv2.rectangle(annotated_frame, (box[0], box[1]), (box[2], box[3]), color, 3 if is_violation else 2)
                self._draw_label(annotated_frame, label, box, color)

        return annotated_frame

    def _draw_label(self, frame, label, box, bg_color):
        """Helper to draw a filled text box."""
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        
        x1, y1 = box[0], box[1]
        
        # Background rect
        cv2.rectangle(frame, (x1, y1 - 20), (x1 + text_w, y1), bg_color, -1)
        # Text
        cv2.putText(frame, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, self.COLOR_TEXT, 1)

    def draw_stats(self, frame, frame_idx, total_frames, fps=0):
        """Draws HUD statistics."""
        info = f"Frame: {frame_idx}/{total_frames} | FPS: {fps:.1f}"
        cv2.putText(frame, info, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
