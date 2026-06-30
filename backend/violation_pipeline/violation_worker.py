#!/usr/bin/env python3
"""
Violation Processing Worker (Headless)
Runs the UnifiedPipeline for active cameras in a separate process.
Reads configuration from the database and syncs results to the central server.
"""
import time
import json
import threading
import logging
import signal
import sys
import os

# Ensure we can import from local package
sys.path.append(os.getcwd())

from violation_pipeline.database import SessionLocal, Camera, init_db
from violation_pipeline.pipeline import UnifiedPipeline
from violation_pipeline.config.config import Config
from violation_pipeline.src.core.shared_models import SharedModels

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s'
)
logger = logging.getLogger("worker")

# Global state
processors = {}
stop_signal = threading.Event()
# One set of models shared across every camera thread in this process.
# Created lazily on first camera (so boxes with no cameras don't pay the cost).
shared_models = None
shared_models_lock = threading.Lock()


def _get_or_create_shared_models():
    global shared_models
    if shared_models is not None:
        return shared_models
    with shared_models_lock:
        if shared_models is None:
            logger.info("Loading SharedModels for the first camera (one-time cost)...")
            shared_models = SharedModels()
    return shared_models

def signal_handler(sig, frame):
    logger.info("Shutdown signal received...")
    stop_signal.set()
    for cam_id, proc in processors.items():
        if "stop_event" in proc:
            proc["stop_event"].set()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def start_pipeline_thread(camera_id: int, rtsp_url: str, camera_name: str, enabled_violations: list, 
                          wrong_side_zone=None, wrong_side_direction=None):
    """Run a single camera pipeline in a thread."""
    stop_event = threading.Event()
    
    # Configuration
    config = {
        'enabled_violations': enabled_violations,
        'wrong_side_zone': wrong_side_zone,
        'wrong_side_direction': wrong_side_direction
    }
    
    # Debug log to verify configuration
    if wrong_side_zone:
        logger.info(f"Camera {camera_id}: Wrong side zone configured with {len(wrong_side_zone)} points, direction: {wrong_side_direction}")

    def run_pipeline():
        logger.info(f"Starting pipeline for Camera {camera_id} ({camera_name})")
        shared = _get_or_create_shared_models()
        while not stop_event.is_set() and not stop_signal.is_set():
            try:
                # No frame_callback needed for purely headless processing
                # (unless we want to debug, but this is for production efficiency)
                pipeline = UnifiedPipeline(
                    camera_id=camera_id,
                    camera_name=camera_name,
                    config=config,
                    frame_callback=None,
                    shared_models=shared,
                )
                pipeline.run_on_stream(rtsp_url)
            except Exception as e:
                logger.error(f"Pipeline error for Camera {camera_id}: {e}")
            
            if not stop_event.is_set() and not stop_signal.is_set():
                logger.info(f"Camera {camera_id} pipeline ended. Restarting in 10s...")
                time.sleep(10)

    thread = threading.Thread(target=run_pipeline, daemon=True)
    thread.start()
    
    return {
        "thread": thread,
        "stop_event": stop_event,
        "rtsp_url": rtsp_url,
        "config_hash": hash(json.dumps({
            'violations': enabled_violations,
            'wrong_side_zone': wrong_side_zone,
            'wrong_side_direction': wrong_side_direction
        }))
    }

def sync_processors():
    """Sync running processors with database state."""
    db = SessionLocal()
    try:
        active_cameras = db.query(Camera).filter(Camera.is_active == True).all()
        active_ids = {c.id for c in active_cameras}
        
        # 1. Stop removed or disabled cameras
        for cam_id in list(processors.keys()):
            if cam_id not in active_ids:
                logger.info(f"Stopping processor for Camera {cam_id} (removed/disabled)")
                processors[cam_id]["stop_event"].set()
                del processors[cam_id]

        # 2. Start new or update existing cameras
        for cam in active_cameras:
            try:
                violations = json.loads(cam.enabled_violations) if cam.enabled_violations else []
            except:
                violations = ["helmet", "triple_riding"]
            
            # Parse polygon configuration
            wrong_side_zone = None
            wrong_side_direction = None
            
            if cam.wrong_side_zone:
                try:
                    wrong_side_zone = json.loads(cam.wrong_side_zone)
                except Exception as e:
                    logger.error(f"Failed to parse wrong_side_zone for Camera {cam.id}: {e}")
            
            if cam.wrong_side_direction:
                wrong_side_direction = cam.wrong_side_direction
            
            # Check if restart needed (config changed or not running)
            if cam.id in processors:
                proc = processors[cam.id]
                current_hash = hash(json.dumps({
                    'violations': violations,
                    'wrong_side_zone': wrong_side_zone,
                    'wrong_side_direction': wrong_side_direction
                }))
                if proc["rtsp_url"] != cam.rtsp_url or proc["config_hash"] != current_hash:
                    logger.info(f"Configuration changed for Camera {cam.id}, restarting...")
                    proc["stop_event"].set()
                    del processors[cam.id]
                    # Will be restarted in next loop or fall through to start code below
            
            if cam.id not in processors:
                processors[cam.id] = start_pipeline_thread(
                    cam.id, 
                    cam.rtsp_url, 
                    cam.name, 
                    violations,
                    wrong_side_zone,
                    wrong_side_direction
                )
                
    except Exception as e:
        logger.error(f"Database sync error: {e}")
    finally:
        db.close()

def main():
    logger.info("Initializing Violation Worker...")
    Config.setup()
    init_db()
    
    logger.info("Starting worker loop...")
    while not stop_signal.is_set():
        sync_processors()
        time.sleep(10) # Poll database every 10 seconds

if __name__ == "__main__":
    main()
