
import cv2
import torch
import numpy as np
from ultralytics import YOLO
import os

class Detector:
    def __init__(self, model_path, device="cpu"):
        self.device = device
        self.model_path = model_path
        self.is_tensorrt = False
        
        # Priority 1: TensorRT engine (best performance). When found, the
        # remaining branches MUST be skipped — they would otherwise try to
        # load a .pt that may not exist on disk (e.g. mobile_best.pt) and
        # raise FileNotFoundError even though the engine loaded fine.
        engine_path = model_path.replace('.pt', '.engine').replace('.onnx', '.engine')
        if os.path.exists(engine_path):
            print(f"🚀 Loading TensorRT engine: {engine_path}")
            self.model = YOLO(engine_path, task='detect')
            self.model_path = engine_path
            self.is_tensorrt = True
            print(f"   ✅ TensorRT engine loaded successfully (optimized)")

        # Priority 2: ONNX fallback
        elif model_path.endswith('.onnx'):
            print(f"🚀 Loading ONNX model: {model_path}")
            if not os.path.exists(model_path):
                 raise FileNotFoundError(f"Model not found: {model_path}")
            self.model = YOLO(model_path, task='detect')
            print(f"   ✅ ONNX model loaded successfully")
            print(f"   💡 Tip: Export to TensorRT for 2-3x speed boost with 'python export_yolo_to_tensorrt.py'")

        # Priority 3: PyTorch .pt fallback
        else:
            print(f"🚀 Loading PyTorch model: {model_path}")
            if not os.path.exists(model_path):
                 raise FileNotFoundError(f"Model not found: {model_path}")
            self.model = YOLO(model_path, task='detect')
            print(f"   ✅ PyTorch model loaded successfully")
            print(f"   💡 Tip: Export to TensorRT for 2-3x speed boost with 'python export_yolo_to_tensorrt.py'")
        
        # Warmup inference for TensorRT engines
        if self.is_tensorrt:
            print(f"   ⏳ Warming up TensorRT engine...")
            dummy_frame = np.zeros((640, 640, 3), dtype=np.uint8)
            _ = self.model(dummy_frame, verbose=False)
            print(f"   ✅ Engine ready for inference")

    def detect(self, frame, conf=0.25, classes=None):
        """
        Run detection on a frame.
        Returns: list of detections [x1, y1, x2, y2, conf, cls]
        """
        # Using stricter NMS (iou=0.6) to reduce overlapping boxes
        results = self.model(frame, conf=conf, iou=0.6, verbose=False, classes=classes)[0]
        
        detections = []
        if len(results.boxes) > 0:
            boxes = results.boxes.xyxy.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            clss = results.boxes.cls.cpu().numpy()
            
            for box, conf_score, cls_id in zip(boxes, confs, clss):
                detections.append([
                    *box,
                    float(conf_score),
                    int(cls_id)
                ])
                
        return detections
