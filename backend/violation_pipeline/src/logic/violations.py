from datetime import datetime
import logging
from violation_pipeline.config.config import Config
from collections import deque

logger = logging.getLogger("ViolationManager")

class ViolationState:
    """Tracks violation history for temporal consensus (Robust Implementation)."""
    def __init__(self, window_size=15, threshold=0.75):
        self.window_size = window_size
        self.threshold = threshold
        
        # Helmet Tracking
        self.detections = deque(maxlen=window_size)
        self.helmet_count = 0
        self.no_helmet_count = 0
        self.last_consensus = None
        self.stable_frames = 0
        self.confidence_sum = 0.0
        self.best_confidence = 0.0
        
        # Triple Riding Tracking (Simple consensus is usually enough for triple)
        self.triple_history = deque(maxlen=window_size)
        self.confirmed_triple = False

        # Minor Rider Tracking (binary vote)
        self.minor_votes = deque(maxlen=window_size)
        self.confirmed_minor = False

        # Mobile-use Tracking
        self.mobile_history = deque(maxlen=window_size)
        self.confirmed_mobile = False

    def update(self, has_violation_frame, confidence, triple_viol_frame, mobile_viol_frame=False):
        # --- Helmet Consensus ---
        # "has_violation_frame" is True if NO_HELMET detected in this frame
        
        # Remove old detection from window if full
        if len(self.detections) == self.window_size:
            old_det = self.detections[0]
            if old_det['is_violation']:
                self.no_helmet_count -= 1
            else:
                self.helmet_count -= 1
            self.confidence_sum -= old_det['confidence']
        
        # Add new detection
        is_violation = has_violation_frame
        detection = {
            'is_violation': is_violation,
            'confidence': confidence
        }
        self.detections.append(detection)
        
        if is_violation:
            self.no_helmet_count += 1
        else:
            self.helmet_count += 1
            
        self.confidence_sum += confidence
        if is_violation:
            self.best_confidence = max(self.best_confidence, confidence)
            
        # Check Consensus
        current_status = self._get_current_status()
        
        # Stability Check
        if current_status != self.last_consensus:
            self.stable_frames = 0
            self.last_consensus = current_status
        else:
            self.stable_frames += 1
            
        # --- Triple Consensus ---
        # 60% across the window (9/15). 40% was firing on pedestrians who
        # crossed behind the rider for ~6 frames; the higher floor demands
        # a sustained 3rd head on the rider's track.
        self.triple_history.append(triple_viol_frame)
        triple_count = sum(self.triple_history)
        triple_required = int(self.window_size * 0.6)
        if triple_count >= triple_required and not self.confirmed_triple:
            self.confirmed_triple = True

        # --- Mobile Consensus ---
        # 67% across the window (10/15). 50% was firing on hands raised
        # near the head for half the track; 67% demands the phone bbox to
        # persist long enough to clearly be a phone, not a transient hand.
        self.mobile_history.append(bool(mobile_viol_frame))
        mobile_required = max(1, int(self.window_size * 0.67))
        if sum(self.mobile_history) >= mobile_required and not self.confirmed_mobile:
            self.confirmed_mobile = True

    def update_minor(self, is_minor):
        if is_minor is None:
            return

        self.minor_votes.append(bool(is_minor))

        min_frames = getattr(Config, "MINOR_RIDER_MIN_FRAMES", 6)
        if len(self.minor_votes) < min_frames:
            return

        minor_count = sum(self.minor_votes)
        consensus = minor_count / len(self.minor_votes)
        required_consensus = getattr(Config, "MINOR_RIDER_CONSENSUS", 0.85)
        required_positive_frames = getattr(Config, "MINOR_RIDER_MIN_POSITIVE_FRAMES", 5)

        if (
            minor_count >= required_positive_frames
            and consensus >= required_consensus
            and not self.confirmed_minor
        ):
            self.confirmed_minor = True

    def _get_current_status(self):
        total = len(self.detections)
        if total < 5: # Need min frames
            return 'uncertain'
            
        viol_ratio = self.no_helmet_count / total
        safe_ratio = self.helmet_count / total
        
        if viol_ratio >= self.threshold:
            return 'violation'
        elif safe_ratio >= self.threshold:
            return 'safe'
        return 'uncertain'

    def is_confirmed_helmet(self):
        # Require 'violation' status AND stability
        # AND min frames
        if len(self.detections) < 10:
            return False
            
        return (self.last_consensus == 'violation' and 
                self.stable_frames >= 5) # Require 5 frames of stability

class ViolationManager:
    """Manages violation rules with temporal consensus tracking."""
    def __init__(self):
        self.rider_states = {}  # {rider_id: ViolationState}
        self.max_tracked_riders = 100
        
        # Seatbelt deduplication (one violation per vehicle)
        self.seatbelt_confirmed = set()  # Set of vehicle IDs with saved violations
        
        
    def update(self, rider_id, helmet_violation_flag, triple_violation_flag, mobile_violation_flag=False):
        """Updates state and returns confirmed violations."""
        # Cleanup old riders
        if len(self.rider_states) > self.max_tracked_riders:
            to_remove = list(self.rider_states.keys())[:20]
            for rid in to_remove:
                del self.rider_states[rid]
        
        if rider_id not in self.rider_states:
            self.rider_states[rider_id] = ViolationState()
            
        state = self.rider_states[rider_id]
        
        # Determine confidence (default to 0.0 or 1.0 if boolean passed)
        # Ideally pipeline passes confidence, but if not we assume high
        conf = 0.85 if helmet_violation_flag else 0.0
        
        state.update(
            has_violation_frame=(helmet_violation_flag == "helmet"),
            confidence=conf, 
            triple_viol_frame=triple_violation_flag,
            mobile_viol_frame=mobile_violation_flag
        )
        
        h_viol = "helmet" if state.is_confirmed_helmet() else None
        t_viol = "triple_riding" if state.confirmed_triple else None
        m_viol = "minor_rider" if state.confirmed_minor else None
        mob_viol = "mobile" if state.confirmed_mobile else None
        
        return h_viol, t_viol, m_viol, mob_viol

    def update_minor(self, rider_id, is_minor: bool):
        if rider_id not in self.rider_states:
            self.rider_states[rider_id] = ViolationState()
        self.rider_states[rider_id].update_minor(is_minor)
        return "minor_rider" if self.rider_states[rider_id].confirmed_minor else None

    def update_minor(self, rider_id, is_minor: bool):
        if rider_id not in self.rider_states:
            self.rider_states[rider_id] = ViolationState()
        self.rider_states[rider_id].update_minor(is_minor)
        return "minor_rider" if self.rider_states[rider_id].confirmed_minor else None

    def check_helmet(self, head_detections, rider_box):
        """Check for helmet violation in a single frame."""
        heads_inside = []
        for h in head_detections:
            hx1, hy1, hx2, hy2 = h[:4]
            h_cls = int(h[5])
            hcx, hcy = (hx1+hx2)/2, (hy1+hy2)/2
            
            if (hcx >= rider_box[0] and hcx <= rider_box[2] and
                hcy >= rider_box[1] and hcy <= rider_box[3]):
                heads_inside.append(h_cls)
        
        violation = None
        if Config.CLASS_NO_HELMET in heads_inside:
            violation = "helmet"
        
        return violation


    @staticmethod
    def _expand_box(b, W, H, m):
        x1, y1, x2, y2 = b
        bw, bh = x2 - x1, y2 - y1
        return (max(0, x1 - m * bw), max(0, y1 - m * bh),
                min(W, x2 + m * bw), min(H, y2 + m * bh))

    def check_mobile(self, phone_dets, rider_box, heads_raw, moto_boxes, frame_shape):
        """Per-frame: True if any phone box belongs to *this* rider."""
        if not phone_dets:
            return False
        import math
        H, W = frame_shape[:2]
        rider_heads = []
        for h in heads_raw:
            hx1, hy1, hx2, hy2 = h[:4]
            hcx, hcy = (hx1 + hx2) / 2, (hy1 + hy2) / 2
            if rider_box[0] <= hcx <= rider_box[2] and rider_box[1] <= hcy <= rider_box[3]:
                rider_heads.append((hx1, hy1, hx2, hy2))
        if not rider_heads:
            return False
        moto_exp = [self._expand_box(b, W, H, Config.MOBILE_MOTO_EXPAND) for b in moto_boxes]
        for d in phone_dets:
            px1, py1, px2, py2 = d[:4]
            cx, cy = (px1 + px2) / 2, (py1 + py2) / 2
            if not any(mb[0] <= cx <= mb[2] and mb[1] <= cy <= mb[3] for mb in moto_exp):
                continue
            for hx1, hy1, hx2, hy2 in rider_heads:
                hh = hy2 - hy1
                hcx, hcy = (hx1 + hx2) / 2, (hy1 + hy2) / 2
                if math.hypot(cx - hcx, cy - hcy) <= Config.MOBILE_HEAD_PROX * hh:
                    return True
        return False
    def check_triple_riding(self, head_detections, rider_box):
        """Check for triple riding (3+ people on same rider/motorcycle).
        
        CORRECT LOGIC (from old pipeline):
        - Count heads that overlap with the RIDER's bounding box (not motorcycle)
        - Use top 60% region of rider box to capture heads
        - Require 40% overlap to count the head
        - Triple riding = more than 2 heads on this specific rider
        
        Args:
            head_detections: ALL head detections in frame
            rider_box: Bounding box of the RIDER (not the motorcycle!)
            
        Returns:
            bool: True if 3 or more heads overlap with this rider
        """
        if rider_box is None:
            # Rider box is None
            return False
        
        # Use RIDER box (not motorcycle box!)
        rx1, ry1, rx2, ry2 = rider_box
        rider_height = ry2 - ry1
        
        # Define top region: top 60% of rider box height
        # This captures heads sitting on the motorcycle
        top_region_height = rider_height * 0.6
        top_region = [
            rx1,
            ry1,  # From top of rider
            rx2,
            ry1 + top_region_height  # Down to 60% of rider height
        ]
        
        # Count heads that overlap with this rider's top region
        head_count = 0
        overlap_threshold = 0.4  # Head must overlap 40% with top region
        
        total_heads = len(head_detections) if head_detections is not None else 0
        
        for h in head_detections:
            hx1, hy1, hx2, hy2 = h[:4]
            
            # Calculate intersection with top region
            x_left = max(hx1, top_region[0])
            y_top = max(hy1, top_region[1])
            x_right = min(hx2, top_region[2])
            y_bottom = min(hy2, top_region[3])
            
            # Check if there's any intersection
            if x_right < x_left or y_bottom < y_top:
                continue  # No overlap
            
            # Calculate intersection area
            intersection = (x_right - x_left) * (y_bottom - y_top)
            head_area = (hx2 - hx1) * (hy2 - hy1)
            
            # Check if overlap ratio exceeds threshold
            if head_area > 0:
                overlap_ratio = intersection / head_area
                if overlap_ratio > overlap_threshold:
                    head_count += 1
        
        # Triple riding = more than 2 heads per rider (3+)
        result = head_count > 2
        
        return result

    def update_seatbelt_violations(self, detections, tracks, tracker, ocr, frame, frame_id, valid_classes=None):
        """
        Process Seatbelt Violations with high confidence threshold.
        Returns list of violation details dicts.
        """
        new_violations = []

        if not detections:
            return new_violations

        if tracks.tracker_id is None:
            return new_violations

        for det in detections:
            # STRICT confidence filter to reduce false positives
            det_conf = float(det[4])
            if det_conf < 0.75:  # Very high threshold
                continue
            
            # Check overlap/containment with vehicle tracks
            dx1, dy1, dx2, dy2 = det[:4]
            d_center = ((dx1 + dx2) / 2, (dy1 + dy2) / 2)
            
            matched_vehicle = None
            
            for i, t_id in enumerate(tracks.tracker_id):
                # Filter by vehicle class if specified
                if valid_classes is not None:
                    t_class = int(tracks.class_id[i])
                    if t_class not in valid_classes:
                        continue # Skip non-target vehicles (Autos, Bikes)

                tx1, ty1, tx2, ty2 = tracks.xyxy[i]
                
                # Check if detection center is inside vehicle box
                if tx1 < d_center[0] < tx2 and ty1 < d_center[1] < ty2:
                    matched_vehicle = (t_id, tracks.xyxy[i], i)
                    break
            
            if matched_vehicle:
                t_id, t_bbox, idx = matched_vehicle
                
                # Deduplication: Check if already saved for this vehicle
                if t_id in self.seatbelt_confirmed:
                    continue
                
                # Mark as saved
                self.seatbelt_confirmed.add(t_id)
                
                # Create Violation Data
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                violation_id = f"seatbelt_{t_id}_{timestamp}"
                
                details = {
                    "violation_id": violation_id,
                    "violation_type": "seatbelt",
                    "timestamp": datetime.now().isoformat(),
                    "vehicle_id": int(t_id),
                    "rider_id": int(t_id),
                    "plate_text": "UNKNOWN",
                    "bbox": [float(x) for x in det[:4]],  # Person detection (for zoomed)
                    "bbox_rider": [float(x) for x in t_bbox],  # Vehicle (metadata)
                    "bbox_vehicle": [float(x) for x in t_bbox],  # Vehicle (for crop)
                    "confidence": float(det_conf)
                }
                new_violations.append(details)
                
                print(f"[SEATBELT] Vehicle {t_id}: Violation saved (conf: {det_conf:.2f})")
        
        return new_violations
