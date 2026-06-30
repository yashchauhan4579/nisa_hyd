"""
Unified Pipeline Configuration.

"""

import os
import torch

class Config:
    # --- Paths ---
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Weights: Use /app/weights in Docker, or project-root/weights locally
    WEIGHTS_DIR = "/app/weights" if os.path.exists("/app/weights") else os.path.join(os.path.dirname(BASE_DIR), "weights")
    
    OUTPUT_DIR = os.path.join(os.path.dirname(BASE_DIR), "output")
    
    # Model Paths - TensorRT Optimized (2-3x faster, 30-50% less RAM)
    # Note: Detector class auto-falls back to .pt if .engine not found
    MODEL_TRAFFIC = os.path.join(WEIGHTS_DIR, "new_v1.pt")
    MODEL_VIOLATION = os.path.join(WEIGHTS_DIR, "new_v1.pt")
    MODEL_OCR = os.path.join(WEIGHTS_DIR, "stage_2.pth")          # CRNN OCR (kept as PyTorch)
    
    # --- Detection Thresholds ---
    # Detection Thresholds (Jetson Optimized)
    CONF_TRAFFIC_DEFAULT = 0.15  # Jetson optimization - saves 10-15% CPU
    CONF_PLATE = 0.10            # Lowered for unified split — was 0.45
    
    # Unified 10-class new_v1 engine:
    #   0=auto, 1=bus, 2=car, 3=plate, 4=truck, 5=motorcycle,
    #   6=helmet, 7=no-helmet, 8=seatbelt, 9=no-seatbelt
    CLASS_AUTO         = 0
    CLASS_BUS          = 1
    CLASS_CAR          = 2
    CLASS_PLATE        = 3
    CLASS_TRUCK        = 4
    CLASS_MOTORCYCLE   = 5
    CLASS_HELMET       = 6
    CLASS_NO_HELMET    = 7
    CLASS_SEATBELT     = 8
    CLASS_NO_SEATBELT  = 9
    CLASS_RIDER        = CLASS_MOTORCYCLE

    VEHICLE_CLASSES_4W  = (CLASS_BUS, CLASS_CAR, CLASS_TRUCK)
    VEHICLE_CLASSES_ALL = (CLASS_AUTO, CLASS_BUS, CLASS_CAR, CLASS_TRUCK, CLASS_MOTORCYCLE)
    HEAD_CLASSES        = (CLASS_HELMET, CLASS_NO_HELMET)
    PERSON_CLASSES      = (CLASS_SEATBELT, CLASS_NO_SEATBELT)

    # Per-class confidence for the split filter. The forward pass uses
    # CONF_PLATE (lowest) so nothing is dropped before split.
    CONF_VEHICLE       = 0.15
    CONF_RIDER         = 0.20
    CONF_HELMET        = 0.40
    CONF_NO_HELMET     = 0.40
    CONF_SEATBELT      = 0.35
    CONF_NO_SEATBELT   = 0.35
    
    # OCR
    CONF_OCR = 0.1              # Accept almost all recognized text
    
    # Mobile-use (rider-phone) detector
    MODEL_MOBILE       = os.path.join(WEIGHTS_DIR, "mobile_best.pt")
    CONF_MOBILE        = 0.30
    MOBILE_HEAD_PROX   = 1.0
    MOBILE_MOTO_EXPAND = 0.20
    
    # --- Business Logic ---
    ENABLED_VIOLATIONS = ['helmet', 'triple_riding', 'wrong_side', 'seatbelt', 'mobile']
    MINOR_RIDER_MIN_FRAMES = 6
    MINOR_RIDER_MIN_POSITIVE_FRAMES = 5
    MINOR_RIDER_MIN_CONFIDENCE = 0.55
    MINOR_RIDER_CHILD_MIN_PROB = 0.55
    MINOR_RIDER_MINOR_MIN_PROB = 0.72
    MINOR_RIDER_ADULT_MIN_PROB = 0.30
    MINOR_RIDER_MIN_CROP_WIDTH = 130
    MINOR_RIDER_MIN_CROP_HEIGHT = 260
    MINOR_RIDER_CONSENSUS = 0.80

    # --- Multi-Mode Detection ---
    # Enable/disable detection modes (can run simultaneously)
    ENABLED_DETECTION_MODES = ['vcc', 'anpr', 'violation']  # All enabled by default
    
    # VCC (Vehicle Classification & Counting) Settings
    VCC_SEND_INTERVAL_FRAMES = 30  # Send VCC data every N frames (~5 sec at 6 FPS)
    
    # ANPR (Automatic Number Plate Recognition) Settings  
    ANPR_MIN_PLATE_CONFIDENCE = 0.10  # Minimum confidence to send ANPR detection
    ANPR_DEDUPE_WINDOW = 300  # Seconds - Don't re-send same vehicle within this window
    
    # Speed Limit
    SPEED_LIMIT = 40.0          # km/h
    MIN_SPEED_THRESHOLD = 5.0   # Ignore stationary vehicles
    
    # Radar Configuration
    RADAR_IP = "192.168.150.12"  # TSC224 Radar IP Address
    RADAR_PORT = 50000
    RADAR_ENABLED = False  # No radar hardware deployed; disabled to suppress reconnect spam
    
    # Tracking
    MIN_DETECTION_FRAMES = 2    # Require 5 frames of tracking before processing
    MAX_FRAME_GAP = 30          # Lost track recovery
    
    # Plate Association
    # Stricter threshold to prevent matching plates from adjacent vehicles
    MAX_PLATE_DISTANCE = 50    # Reduced from 100 (was too loose for crowded scenes)
    
    # Snapshot Quality Control
    # Snapshot Quality
    # Buffer 3 frames only (videos disabled, just for snapshot quality selection)
    SNAPSHOT_BUFFER_SIZE = 3   # Number of frames to buffer per rider/vehicle
    BLUR_THRESHOLD = 100.0      # Laplacian variance threshold (lower = more blurry)
    MIN_SNAPSHOT_QUALITY = 0.3  # Minimum quality score to save snapshot
    
    # --- Device ---
    # Auto-detect device
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    
    # --- CRNN Settings ---
    CRNN_INPUT_SIZE = (192, 48)
    CRNN_CLASSES = 36  # 0-9, A-Z
    
    
    # --- RTSP Streaming Settings ---
    RECONNECT_DELAY = 5  # seconds between reconnection attempts
    STREAM_BUFFER_SIZE = 3  # frames to buffer (increased for quality - was 1)
    FRAME_SKIP = 0  # skip N frames between processing (0 = process all frames)
    
    @staticmethod
    def setup():
        """Ensure necessary directories exist."""
        os.makedirs(Config.OUTPUT_DIR, exist_ok=True)
        for viol in Config.ENABLED_VIOLATIONS:
            os.makedirs(os.path.join(Config.OUTPUT_DIR, viol), exist_ok=True)
        # Create ANPR output directory
        os.makedirs(os.path.join(Config.OUTPUT_DIR, 'anpr'), exist_ok=True)
