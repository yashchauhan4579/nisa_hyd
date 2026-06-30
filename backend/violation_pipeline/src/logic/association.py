
import numpy as np
from violation_pipeline.config.config import Config

class Associator:
    @staticmethod
    def _box_area(box):
        return (box[2] - box[0]) * (box[3] - box[1])
        
    @staticmethod
    def _intersection_area(box1, box2):
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        if x2 <= x1 or y2 <= y1:
            return 0.0
        return (x2 - x1) * (y2 - y1)

    @staticmethod
    def associate_plate_to_vehicle(plate_bbox, vehicle_bboxes):
        """
        Find the vehicle that contains the plate.

        Stricter than before to stop a plate being attached to the wrong vehicle
        in busy frames:
          - Require the plate to be at least 70% inside the vehicle box.
          - If two vehicles both contain the plate, demand a clear winner
            (top match must beat runner-up by ≥0.15 in overlap ratio).
          - The distance-only fallback is removed — a plate that is not
            meaningfully inside any vehicle box is dropped instead of being
            force-matched to the nearest car.
        Returns: vehicle_index or None
        """
        plate_area = Associator._box_area(plate_bbox)
        if plate_area <= 0:
            return None

        MIN_OVERLAP_RATIO = 0.70
        MIN_MARGIN = 0.15

        best_idx, best_ratio = None, 0.0
        second_ratio = 0.0

        for i, v_bbox in enumerate(vehicle_bboxes):
            intersection = Associator._intersection_area(plate_bbox, v_bbox)
            if intersection == 0:
                continue
            overlap_ratio = intersection / plate_area
            if overlap_ratio > best_ratio:
                second_ratio = best_ratio
                best_ratio = overlap_ratio
                best_idx = i
            elif overlap_ratio > second_ratio:
                second_ratio = overlap_ratio

        if best_idx is None or best_ratio < MIN_OVERLAP_RATIO:
            return None
        if (best_ratio - second_ratio) < MIN_MARGIN:
            # Ambiguous — plate sits across two vehicles. Drop instead of guessing.
            return None
        return best_idx

    @staticmethod
    def associate_rider_to_motorcycle(rider_bbox, vehicle_bboxes, vehicle_classes):
        """
        Associate a Rider detection with the Motorcycle bbox it sits on.
        IoU-based primary match, distance fallback if no overlap.

        Filters by Config.CLASS_MOTORCYCLE so it survives model class-ID
        remaps. Hard-coding `v_cls != 3` here previously broke the entire
        rider→vehicle→plate chain when the new combined model swapped
        plate=3 / motorcycle=5.
        """
        rider_area = Associator._box_area(rider_bbox)
        rx_center = (rider_bbox[0] + rider_bbox[2]) / 2
        ry_center = (rider_bbox[1] + rider_bbox[3]) / 2

        moto_cls = Config.CLASS_MOTORCYCLE

        best_match = None
        max_iou = 0.0

        # PRIMARY: IoU-based matching.
        for i, (v_bbox, v_cls) in enumerate(zip(vehicle_bboxes, vehicle_classes)):
            if int(v_cls) != moto_cls:
                continue

            vehicle_area = Associator._box_area(v_bbox)
            intersection = Associator._intersection_area(rider_bbox, v_bbox)

            if intersection == 0:
                continue

            union = rider_area + vehicle_area - intersection
            iou = intersection / union if union > 0 else 0.0

            if iou > max_iou:
                max_iou = iou
                best_match = i

        # FALLBACK: distance-based, scaled by rider height (handles separated rider/bike boxes).
        if best_match is None:
            rider_h = max(1.0, rider_bbox[3] - rider_bbox[1])
            max_dist = rider_h  # within one rider height ≈ same vehicle
            min_dist = float('inf')

            for i, (v_bbox, v_cls) in enumerate(zip(vehicle_bboxes, vehicle_classes)):
                if int(v_cls) != moto_cls:
                    continue

                vx_center = (v_bbox[0] + v_bbox[2]) / 2
                vy_center = (v_bbox[1] + v_bbox[3]) / 2

                dist = ((rx_center - vx_center) ** 2 + (ry_center - vy_center) ** 2) ** 0.5

                if dist < max_dist and dist < min_dist:
                    min_dist = dist
                    best_match = i

        return best_match
