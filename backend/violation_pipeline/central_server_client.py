"""
Central Server Client for syncing violations to dashboard.
"""
import os
import json
import time
import logging
import threading
import requests
import numpy as np
from datetime import datetime
from typing import Optional, Dict, Any

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("central_server")

# Configuration from environment
# NOTE: Port 3001 is the IRIS backend, port 8443 is the frontend
CENTRAL_SERVER_URL = os.environ.get("CENTRAL_SERVER_URL", "http://139.84.151.69:3001").rstrip('/')
CENTRAL_SERVER_ENABLED = os.environ.get("CENTRAL_SERVER_ENABLED", "true").lower() == "true"
WORKER_ID = os.environ.get("WORKER_ID", "worker-1")
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")
# Shared ingest key — sent as X-Ingest-Key on every central call so the
# backend's WireGuardOrAPIKey middleware accepts public-IP uploads without
# requiring per-box worker tokens. Empty value = headers unchanged, the box
# falls back to the WG source-IP gate (current behaviour).
INGEST_API_KEY = os.environ.get("INGEST_API_KEY", "")
REQUEST_TIMEOUT = 10


def _with_ingest_key(headers: dict) -> dict:
    """Inject X-Ingest-Key into outgoing central requests when configured."""
    if INGEST_API_KEY:
        headers["X-Ingest-Key"] = INGEST_API_KEY
    return headers


def sanitize_for_json(obj):
    """Convert numpy types to Python native types for JSON serialization."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    elif isinstance(obj, (np.integer, np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    else:
        return obj


def get_device_id(camera_id: int, camera_name: Optional[str] = None) -> str:
    """Generate device ID for central server."""
    if camera_name:
        # Use full camera name as-is (uppercase, replace spaces with underscores)
        return camera_name.replace(' ', '_').upper()
    return f"CAMERA_{camera_id}"


def map_violation_type(violation_type: str) -> str:
    """Map local violation types to central server types."""
    mapping = {
        "helmet": "HELMET",
        "no_helmet": "HELMET",
        "HELMET": "HELMET",
        "triple_riding": "TRIPLE_RIDING",
        "speed": "SPEED",
        "SPEED": "SPEED",
        "wrong_side": "WRONG_SIDE"
    }
    return mapping.get(violation_type.lower(), violation_type.upper())


def upload_images_to_central_server(
    snapshot_image_path: Optional[str] = None,
    plate_image_path: Optional[str] = None,
    vehicle_image_path: Optional[str] = None,
    video_image_path: Optional[str] = None,
    device_id: str = "unknown"
) -> Dict[str, Optional[str]]:
    """Upload images/videos to central server and return URLs."""
    result = {'snapshot_url': None, 'plate_url': None, 'vehicle_url': None, 'video_url': None}
    
    if not CENTRAL_SERVER_ENABLED:
        return result
    
    files = {}
    file_handles = []
    
    try:
        if snapshot_image_path and os.path.exists(snapshot_image_path):
            fh = open(snapshot_image_path, 'rb')
            file_handles.append(fh)
            files['frame.jpg'] = ('frame.jpg', fh, 'image/jpeg')
        
        if plate_image_path and os.path.exists(plate_image_path):
            fh = open(plate_image_path, 'rb')
            file_handles.append(fh)
            files['plate.jpg'] = ('plate.jpg', fh, 'image/jpeg')

        if vehicle_image_path and os.path.exists(vehicle_image_path):
            fh = open(vehicle_image_path, 'rb')
            file_handles.append(fh)
            files['vehicle.jpg'] = ('vehicle.jpg', fh, 'image/jpeg')
            
        if video_image_path and os.path.exists(video_image_path):
            fh = open(video_image_path, 'rb')
            file_handles.append(fh)
            files['video.mp4'] = ('video.mp4', fh, 'video/mp4')
        
        if not files:
            return result
        
        event_data = {
            "id": f"img_upload_{int(time.time() * 1000)}",
            "timestamp": datetime.utcnow().isoformat(),
            "worker_id": WORKER_ID,
            "device_id": device_id,
            "type": "violation",
            "data": {"upload_only": True}
        }
        
        url = f"{CENTRAL_SERVER_URL}/api/events/ingest"
        data = {"event": json.dumps(event_data)}
        
        headers = {
            "X-Worker-ID": WORKER_ID
        }
        if AUTH_TOKEN:
            headers["X-Auth-Token"] = AUTH_TOKEN
            
        response = requests.post(url, data=data, files=files, headers=_with_ingest_key(headers), timeout=REQUEST_TIMEOUT * 3)
        
        for fh in file_handles:
            try:
                fh.close()
            except:
                pass
        
        if response.status_code in [200, 201]:
            response_data = response.json()
            logger.info(f"Ingest Response: {response_data}") # DEBUG: Print full response
            image_urls = response_data.get('images', {})
            
            if 'frame.jpg' in image_urls:
                result['snapshot_url'] = image_urls['frame.jpg']
            
            if 'plate.jpg' in image_urls:
                result['plate_url'] = image_urls['plate.jpg']

            if 'vehicle.jpg' in image_urls:
                result['vehicle_url'] = image_urls['vehicle.jpg']
                
            if 'video.mp4' in image_urls:
                result['video_url'] = image_urls['video.mp4']
            
            logger.info(f"✅ Images/Video uploaded. URLs: {list(image_urls.keys())}")
        else:
            logger.error(f"❌ Failed to upload images: {response.status_code}")
            
    except Exception as e:
        logger.error(f"❌ Error uploading images: {e}")
        for fh in file_handles:
            try:
                fh.close()
            except:
                pass
    
    return result


def send_violation_to_central_server(
    camera_id: int,
    violation_type: str,
    plate_number: Optional[str] = None,
    plate_confidence: Optional[float] = None,
    plate_image_path: Optional[str] = None,
    snapshot_image_path: Optional[str] = None,
    vehicle_image_path: Optional[str] = None,
    video_image_path: Optional[str] = None,
    speed: Optional[float] = None,
    speed_limit: Optional[float] = None,
    camera_name: Optional[str] = None,
    confidence: Optional[float] = None,
    timestamp: Optional[datetime] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """Send violation to central server."""
    if not CENTRAL_SERVER_ENABLED:
        return False
    
    # ============================================================================
    # DASHBOARD FILTERS - Keep violations in local DB but filter what goes to dashboard
    # ============================================================================
    
    # Filter 1: Skip SPEED violations
    #     if violation_type and violation_type.upper() == "SPEED":
    #         logger.debug(f"Skipping SPEED violation (filtered from dashboard)")
    #         return False
    
    # Filter 2: Drop short OCR reads (< 6 chars) — they're almost always
    # garbage detections, not real plates. UNKNOWN/empty is allowed (genuine
    # no-plate) but a 1-5 char read is treated as noise.
    if plate_number:
        clean = plate_number.strip().upper()
        if clean and clean != "UNKNOWN" and len(clean) < 6:
            logger.debug(f"Skipping short plate {plate_number!r} (< 6 chars)")
            return False

    # Filter 3: Only send violations from last 7 days (extended for backfill)
    # NOTE: UNKNOWN plates are now allowed and will show on dashboard
    violation_time = timestamp or datetime.utcnow()
    time_diff = datetime.utcnow() - violation_time
    if time_diff.total_seconds() > 604800:  # 7 days = 604800 seconds
        logger.debug(f"Skipping old violation from {violation_time} (filtered from dashboard)")
        return False
    
    # ============================================================================
    
    try:
        device_id = get_device_id(camera_id, camera_name)
        mapped_type = map_violation_type(violation_type)
        
        # Upload images first (Step 1)
        image_urls = upload_images_to_central_server(
            snapshot_image_path=snapshot_image_path,
            plate_image_path=plate_image_path,
            vehicle_image_path=vehicle_image_path,
            video_image_path=video_image_path,
            device_id=device_id
        )
        
        # Build payload
        payload = {
            "deviceId": device_id,
            "violationType": mapped_type,
            "detectionMethod": "AI_VISION",
            "timestamp": (timestamp or datetime.utcnow()).isoformat()
        }
        
        # Always send plate number - use "UNKNOWN" if not provided or empty
        if plate_number and plate_number.strip() and plate_number.upper() != "UNKNOWN":
            payload["plateNumber"] = plate_number
        else:
            payload["plateNumber"] = "UNKNOWN"
        
        if plate_confidence:
            payload["plateConfidence"] = float(plate_confidence)
        
        if image_urls.get('plate_url'):
            payload["plateImageUrl"] = image_urls['plate_url']
        
        if image_urls.get('snapshot_url'):
            payload["fullSnapshotUrl"] = image_urls['snapshot_url']
            
        if image_urls.get('video_url'):
            payload["video"] = image_urls['video_url'] # Correct key for dashboard
        
        if speed is not None:
            payload["detectedSpeed"] = float(speed)
        
        if speed_limit is not None:
            payload["speedLimit4W"] = float(speed_limit)
            if speed:
                payload["speedOverLimit"] = float(speed - speed_limit)
        
        if confidence is not None:
            payload["confidence"] = float(confidence)
            
        # Add additional images to metadata (Step 2)
        additional_images = []
        if image_urls.get('vehicle_url'):
            additional_images.append(image_urls['vehicle_url'])
            
        if additional_images:
            if "metadata" not in payload:
                payload["metadata"] = {}
            payload["metadata"]["additionalImages"] = additional_images
            
        # Add explicit URLs to metadata for dashboard visibility
        if "metadata" not in payload:
            payload["metadata"] = {}
            
        if image_urls.get('video_url'):
            payload["metadata"]["videoUrl"] = image_urls['video_url']
            
        if image_urls.get('vehicle_url'):
            payload["metadata"]["vehicleImageUrl"] = image_urls['vehicle_url']
            
        # Merge extra metadata if provided (sanitize numpy types)
        if metadata:
            if "metadata" not in payload:
                payload["metadata"] = {}
            # Sanitize metadata to convert numpy types to Python types
            sanitized_metadata = sanitize_for_json(metadata)
            payload["metadata"].update(sanitized_metadata)

        # Send violation (Step 2)
        url = f"{CENTRAL_SERVER_URL}/api/violations"
        logger.info(f"Sending violation Step 2: {device_id} - {mapped_type}")
        
        headers = {
            "Content-Type": "application/json",
            "X-Worker-ID": WORKER_ID
        }
        if AUTH_TOKEN:
            headers["X-Auth-Token"] = AUTH_TOKEN
        
        # Sanitize entire payload to ensure no numpy types
        payload = sanitize_for_json(payload)
            
        response = requests.post(url, json=payload, headers=_with_ingest_key(headers), timeout=REQUEST_TIMEOUT)
        
        if response.status_code in [200, 201]:
            logger.info(f"✅ Violation sent to central server")
            return True
        else:
            logger.error(f"❌ Failed to send violation: {response.status_code}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error sending violation: {e}")
        return False


def send_violation_async(*args, **kwargs):
    """Send violation asynchronously."""
    def _send():
        try:
            send_violation_to_central_server(*args, **kwargs)
        except Exception as e:
            logger.error(f"❌ Async violation error: {e}")
    
    thread = threading.Thread(target=_send, daemon=True)
    thread.start()
    return thread


def send_vcc_event(
    camera_id: int,
    vehicle_counts: Dict[str, int],
    timestamp: Optional[datetime] = None,
    camera_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """Send VCC (Vehicle Classification & Counting) event to central server.
    
    Args:
        camera_id: Camera ID
        vehicle_counts: Dictionary of vehicle counts by class (e.g., {"car": 5, "motorcycle": 3})
        timestamp: Event timestamp
        camera_name: Optional camera name
        
    Returns:
        bool: True if successful, False otherwise
    """
    if not CENTRAL_SERVER_ENABLED:
        return False
    
    try:
        device_id = get_device_id(camera_id, camera_name)
        event_timestamp = (timestamp or datetime.utcnow()).isoformat()
        
        # Build event payload
        # FIXED: Add vehicle_type field (backend expects this for VCC events)
        # Extract primary vehicle type from vehicle_counts (should be single type after fix)
        primary_vehicle_type = next(iter(vehicle_counts.keys())) if vehicle_counts else "UNKNOWN"
        
        event_data = {
            "id": f"vcc_{device_id}_{int(time.time() * 1000)}",
            "type": "vcc",
            "device_id": device_id,
            "timestamp": event_timestamp,
            "data": {
                "vehicle_type": primary_vehicle_type,  # ← ADDED: Backend requires this
                "vehicle_counts": vehicle_counts,
                "total_vehicles": sum(vehicle_counts.values())
            }
        }
        
        if metadata:
            event_data["data"].update(metadata)
            
        if metadata:
            event_data["data"].update(metadata)
            
        # Send to events ingest endpoint
        url = f"{CENTRAL_SERVER_URL}/api/events/ingest"
        
        headers = {
            "Content-Type": "application/json",
            "X-Worker-ID": WORKER_ID
        }
        if AUTH_TOKEN:
            headers["X-Auth-Token"] = AUTH_TOKEN
            
        response = requests.post(url, json={"events": [event_data]}, headers=_with_ingest_key(headers), timeout=REQUEST_TIMEOUT)
        
        if response.status_code in [200, 201]:
            logger.info(f"✅ VCC event sent: {vehicle_counts}")
            return True
        else:
            logger.error(f"❌ Failed to send VCC event: {response.status_code}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error sending VCC event: {e}")
        return False


def send_anpr_detection(
    camera_id: int,
    plate_number: str,
    vehicle_type: str,
    plate_confidence: float,
    plate_image_path: Optional[str] = None,
    vehicle_image_path: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    camera_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """Send ANPR (Automatic Number Plate Recognition) detection to central server.
    
    Args:
        camera_id: Camera ID
        plate_number: Detected plate number
        vehicle_type: Type of vehicle (car, motorcycle, etc.)
        plate_confidence: Confidence score for plate detection
        plate_image_path: Path to saved plate image
        vehicle_image_path: Path to saved vehicle image
        timestamp: Detection timestamp
        camera_name: Optional camera name
        
    Returns:
        bool: True if successful, False otherwise
    """
    if not CENTRAL_SERVER_ENABLED:
        return False
    
    try:
        device_id = get_device_id(camera_id, camera_name)
        detection_timestamp = (timestamp or datetime.utcnow()).isoformat()
        
        # Upload images if provided
        image_urls = {}
        logger.info(f"🔍 [ANPR] Checking image paths - plate: {plate_image_path}, vehicle: {vehicle_image_path}")
        if plate_image_path or vehicle_image_path:
            logger.info(f"🖼️ [ANPR] Attempting image upload - plate_path: {plate_image_path}, vehicle_path: {vehicle_image_path}")
            files = {}
            file_handles = []
            
            try:
                if plate_image_path and os.path.exists(plate_image_path):
                    file_size = os.path.getsize(plate_image_path)
                    logger.info(f"📎 [ANPR] Plate image found: {plate_image_path} ({file_size} bytes)")
                    fh = open(plate_image_path, 'rb')
                    file_handles.append(fh)
                    files['plate.jpg'] = ('plate.jpg', fh, 'image/jpeg')
                elif plate_image_path:
                    logger.warning(f"⚠️ [ANPR] Plate image path provided but file doesn't exist: {plate_image_path}")
                
                if vehicle_image_path and os.path.exists(vehicle_image_path):
                    file_size = os.path.getsize(vehicle_image_path)
                    logger.info(f"📎 [ANPR] Vehicle image found: {vehicle_image_path} ({file_size} bytes)")
                    fh = open(vehicle_image_path, 'rb')
                    file_handles.append(fh)
                    files['vehicle.jpg'] = ('vehicle.jpg', fh, 'image/jpeg')
                elif vehicle_image_path:
                    logger.warning(f"⚠️ [ANPR] Vehicle image path provided but file doesn't exist: {vehicle_image_path}")
                
                if files:
                    logger.info(f"📤 [ANPR] Uploading {len(files)} image(s) to central server...")
                    # Upload via events/ingest
                    event_data = {
                        "id": f"anpr_img_{int(time.time() * 1000)}",
                        "timestamp": detection_timestamp,
                        "worker_id": WORKER_ID,
                        "device_id": device_id,
                        "type": "anpr",
                        "data": {"upload_only": True}
                    }
                    
                    url = f"{CENTRAL_SERVER_URL}/api/events/ingest"
                    data = {"event": json.dumps(event_data)}
                    
                    headers = {
                        "X-Worker-ID": WORKER_ID
                    }
                    if AUTH_TOKEN:
                        headers["X-Auth-Token"] = AUTH_TOKEN
                        
                    response = requests.post(url, data=data, files=files, headers=_with_ingest_key(headers), timeout=REQUEST_TIMEOUT * 3)
                    
                    logger.info(f"📥 [ANPR] Upload response: status={response.status_code}")
                    if response.status_code in [200, 201]:
                        response_data = response.json()
                        uploaded_images = response_data.get('images', {})
                        logger.info(f"✅ [ANPR] Images uploaded successfully: {list(uploaded_images.keys())}")
                        
                        if 'plate.jpg' in uploaded_images:
                            image_urls['plateImageUrl'] = uploaded_images['plate.jpg']
                        if 'vehicle.jpg' in uploaded_images:
                            image_urls['vehicleImageUrl'] = uploaded_images['vehicle.jpg']
                    else:
                        logger.error(f"❌ [ANPR] Upload failed: status={response.status_code}, response={response.text[:200]}")
                
                # Close file handles
                for fh in file_handles:
                    try:
                        fh.close()
                    except:
                        pass
                        
            except Exception as e:
                logger.error(f"❌ Error uploading ANPR images: {e}")
                for fh in file_handles:
                    try:
                        fh.close()
                    except:
                        pass
        
        # Build detection payload
        payload = {
            "deviceId": device_id,
            "plateNumber": plate_number,
            "vehicleType": vehicle_type,
            "confidence": float(plate_confidence),
            "timestamp": detection_timestamp,
            "detectionMethod": "AI_VISION"
        }
        
        # Add image URLs if available
        if image_urls:
            payload.update(image_urls)
        
        if metadata:
            payload.update(metadata)
            
        # Send to vehicles/detect endpoint
        url = f"{CENTRAL_SERVER_URL}/api/vehicles/detect"
        logger.info(f"Sending ANPR detection: {device_id} - {plate_number} ({vehicle_type})")
        
        headers = {
            "Content-Type": "application/json",
            "X-Worker-ID": WORKER_ID
        }
        if AUTH_TOKEN:
            headers["X-Auth-Token"] = AUTH_TOKEN
            
        response = requests.post(url, json=payload, headers=_with_ingest_key(headers), timeout=REQUEST_TIMEOUT)
        
        if response.status_code in [200, 201]:
            logger.info(f"✅ ANPR detection sent to central server")
            return True
        else:
            logger.error(f"❌ Failed to send ANPR detection: {response.status_code}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error sending ANPR detection: {e}")
        return False


def send_vcc_event_async(*args, **kwargs):
    """Send VCC event asynchronously."""
    def _send():
        send_vcc_event(*args, **kwargs)
    
    thread = threading.Thread(target=_send, daemon=True)
    thread.start()
    return thread


def send_anpr_detection_async(*args, **kwargs):
    """Send ANPR detection asynchronously."""
    def _send():
        send_anpr_detection(*args, **kwargs)
    
    thread = threading.Thread(target=_send, daemon=True)
    thread.start()
    return thread
