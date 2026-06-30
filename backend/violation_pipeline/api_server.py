#!/usr/bin/env python3
"""
FastAPI Server for Violation Pipeline with Dashboard Integration.
"""
from fastapi import FastAPI, HTTPException, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import uvicorn
import logging
import logging
import os
import threading
import time
import json

from violation_pipeline.database import init_db, get_db, Camera, Violation, User
from violation_pipeline.database import init_db, get_db, Camera, Violation, User
# Removed UnifiedPipeline to decouple processing
import cv2
from violation_pipeline.config.config import Config

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

# Initialize app
app = FastAPI(title="Violation Pipeline API", version="2.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount output directory
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/app/output")
if os.path.exists(OUTPUT_DIR):
    app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")

# Global processors store
processors: Dict[int, dict] = {}
camera_frames: Dict[int, bytes] = {}

# === PERFORMANCE: Response Caching ===
# Simple time-based cache to prevent database query storms from frontend polling
_counts_cache = None
_counts_cache_time = 0
_cameras_cache = None
_cameras_cache_time = 0
CACHE_TTL = 3  # seconds


# Pydantic models
# Auth & Security
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import JWTError, jwt

# JWT Config
SECRET_KEY = "REDACTED"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from violation_pipeline.database import User
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

class CameraCreate(BaseModel):
    name: str
    rtsp_url: str
    enabled_violations: Optional[List[str]] = ["helmet", "triple_riding"]
    speed_limit: int = 60 # Kept from original, not in diff but makes sense
    mpp: Optional[float] = None
    wrong_side_zone: Optional[List[List[int]]] = None # List of [x, y]
    wrong_side_direction: Optional[str] = None
    camera_angle: Optional[float] = None
    camera_height_meters: Optional[float] = None


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    enabled_violations: Optional[List[str]] = None
    speed_limit: Optional[int] = None
    mpp: Optional[float] = None
    wrong_side_zone: Optional[List[List[int]]] = None # List of [x, y]
    wrong_side_direction: Optional[str] = None
    camera_angle: Optional[float] = None
    camera_height_meters: Optional[float] = None


class CameraResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    name: str
    rtsp_url: str
    is_active: bool
    enabled_violations: str # Return as JSON string for simplicity or parse it
    speed_limit: int
    mpp: Optional[float] = None
    wrong_side_zone: Optional[str] = None
    wrong_side_direction: Optional[str] = None
    camera_angle: Optional[float] = None
    camera_height_meters: Optional[float] = None
    created_at: Optional[datetime] = None  # Optional to handle legacy DB records


class ViolationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    camera_id: int
    violation_type: str
    violationType: Optional[str] = None  # CamelCase for frontend
    plate_number: Optional[str] = None
    plateNumber: Optional[str] = None  # CamelCase for frontend
    speed: Optional[float] = None
    synced_to_central: bool
    timestamp: datetime
    status: str
    confidence: Optional[float] = 0.0
    
    # Legacy/Computed equivalents as regular fields
    licensePlate: Optional[str] = None
    snapshotUrl: Optional[str] = None
    plateImageUrl: Optional[str] = None

# --- Auth Logic ---

class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    isAdmin: bool

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@app.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == login_data.username).first()
    if not user or not pwd_context.verify(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "isAdmin": (user.username == "admin")}

@app.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "isAdmin": (current_user.username == "admin")}


# Startup
@app.on_event("startup")
async def startup():
    logger.info("Initializing database...")
    init_db()
    Config.setup()
    
    # Seed Admin User
    db = next(get_db())
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        logger.info("Creating default admin user...")
        hashed = pwd_context.hash("admin")
        db_user = User(username="admin", hashed_password=hashed)
        db.add(db_user)
        db.commit()
    
    
    
    # Auto-start active cameras
    # db = next(get_db())
    # cameras = db.query(Camera).filter(Camera.is_active == True).all()
    # for cam in cameras:
    #     start_processor(cam.id, cam.rtsp_url, cam.name)
    # logger.info(f"Started {len(cameras)} camera processor(s)")


def start_processor(camera_id: int, rtsp_url: str, camera_name: str = None):
    """Start a lightweight preview stream for a camera (No AI)."""
    if camera_id in processors:
        logger.warning(f"Preview stream for camera {camera_id} already running")
        return
    
    stop_event = threading.Event()

    def run_preview():
        logger.info(f"Starting preview stream for {camera_id}")
        cap = None
        # Ensure TCP transport for this thread's context (if applicable)
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        
        while not stop_event.is_set():
            try:
                if cap is None or not cap.isOpened():
                    cap = cv2.VideoCapture(rtsp_url)
                    # Low latency settings
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                
                if not cap.isOpened():
                     time.sleep(2)
                     continue
                
                ret, frame = cap.read()
                if ret:
                    # Resize for dashboard preview to save bandwidth/CPU
                    # Optional: resize to 640x480 if strict
                    frame = cv2.resize(frame, (640, 360)) 
                    
                    ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                    if ret:
                        camera_frames[camera_id] = buffer.tobytes()
                    time.sleep(0.03) # Cap at ~30 FPS
                else:
                    cap.release()
                    time.sleep(1)
            except Exception as e:
                logger.error(f"Preview error {camera_id}: {e}")
                time.sleep(2)
        
        if cap:
            cap.release()
    
    thread = threading.Thread(target=run_preview, daemon=True)
    thread.start()
    
    processors[camera_id] = {
        "thread": thread,
        "rtsp_url": rtsp_url,
        "stop_event": stop_event
    }
    logger.info(f"Started preview processor for camera {camera_id}")


def stop_processor(camera_id: int):
    """Stop a camera processor."""
    if camera_id in processors:
        # Signal loop to stop
        proc = processors[camera_id]
        if "stop_event" in proc:
            proc["stop_event"].set()
            
        del processors[camera_id]
        logger.info(f"Stopped processor for camera {camera_id}")


@app.get("/api/counts")
async def get_counts(db: Session = Depends(get_db)):
    """Return dashboard statistics."""
    global _counts_cache, _counts_cache_time
    
    # Check cache (3 second TTL)
    current_time = time.time()
    if _counts_cache and (current_time - _counts_cache_time) < CACHE_TTL:
        return _counts_cache
    
    # Cache miss - query database
    active_cameras = len(processors)
    
    # Count today's violations
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_violations = db.query(Violation).filter(Violation.timestamp >= today_start).count()
    
    # Count pending reviews
    pending_reviews = db.query(Violation).filter(Violation.status == 'pending').count()
    
    result = {
        "active_cameras": active_cameras,
        "today_violations": today_violations,
        "pending_reviews": pending_reviews,
        "system_status": "online"
    }
    
    # Update cache
    _counts_cache = result
    _counts_cache_time = current_time
    
    return result

# Health check
@app.get("/health")
@app.get("/uptime")
async def health():
    return {"status": "healthy", "processors": len(processors)}


# Camera endpoints
@app.get("/api/cameras", response_model=List[CameraResponse])
async def list_cameras(db: Session = Depends(get_db)):
    global _cameras_cache, _cameras_cache_time
    
    # Check cache (3 second TTL)
    current_time = time.time()
    if _cameras_cache and (current_time - _cameras_cache_time) < CACHE_TTL:
        return _cameras_cache
    
    # Cache miss - query database
    result = db.query(Camera).all()
    
    # Update cache
    _cameras_cache = result
    _cameras_cache_time = current_time
    
    return result


@app.post("/api/cameras", response_model=CameraResponse)
async def add_camera(camera: CameraCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check duplicate
    existing = db.query(Camera).filter(Camera.rtsp_url == camera.rtsp_url).first()
    if existing:
        raise HTTPException(status_code=400, detail="RTSP URL already exists")
    
    # Serialize violations list to JSON string
    violations_json = json.dumps(camera.enabled_violations) if camera.enabled_violations else json.dumps(["helmet", "triple_riding"])
    
    db_camera = Camera(
        name=camera.name,
        rtsp_url=camera.rtsp_url,
        speed_limit=camera.speed_limit,
        is_active=True,
        enabled_violations=violations_json,
        mpp=camera.mpp,
        wrong_side_zone=json.dumps(camera.wrong_side_zone) if camera.wrong_side_zone else None,
        wrong_side_direction=camera.wrong_side_direction,
        camera_angle=camera.camera_angle,
        camera_height_meters=camera.camera_height_meters
    )
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    
    # Start processor
    start_processor(db_camera.id, db_camera.rtsp_url, db_camera.name)
    
    return db_camera


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    enabled_violations: Optional[List[str]] = None
    speed_limit: Optional[int] = None
    mpp: Optional[float] = None
    wrong_side_zone: Optional[List[List[int]]] = None
    wrong_side_direction: Optional[str] = None
    camera_angle: Optional[float] = None
    camera_height_meters: Optional[float] = None
    is_active: Optional[bool] = None


@app.patch("/api/cameras/{camera_id}")
async def update_camera(camera_id: int, camera_update: CameraUpdate, db: Session = Depends(get_db)):
    db_camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    update_data = camera_update.dict(exclude_unset=True)
    
    # Needs restart if URL changes
    restart_preview = False
    if 'rtsp_url' in update_data and update_data['rtsp_url'] != db_camera.rtsp_url:
        restart_preview = True
        
    for key, value in update_data.items():
        if key == 'enabled_violations':
            setattr(db_camera, key, json.dumps(value))
        elif key == 'wrong_side_zone':
             setattr(db_camera, key, json.dumps(value) if value else None)
        else:
            setattr(db_camera, key, value)
            
    db.commit()
    db.refresh(db_camera)
    
    if restart_preview:
        stop_processor(camera_id)
        if db_camera.is_active:
             start_processor(db_camera.id, db_camera.rtsp_url, db_camera.name)
             
    return db_camera


@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: int, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    stop_processor(camera_id)
    db.delete(camera)
    db.commit()
    
    return {"message": "Camera deleted"}


@app.post("/api/cameras/{camera_id}/start")
async def start_camera(camera_id: int, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    camera.is_active = True
    db.commit()
    
    start_processor(camera.id, camera.rtsp_url, camera.name)
    return {"message": "Camera started"}


@app.post("/api/cameras/{camera_id}/stop")
async def stop_camera(camera_id: int, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    camera.is_active = False
    db.commit()
    
    stop_processor(camera_id)
    return {"message": "Camera stopped"}


@app.get("/api/cameras/{camera_id}/frame")
async def get_camera_frame(camera_id: int, db: Session = Depends(get_db)):
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")
        
        # 1. Try Cache
        if camera_id in processors:
            frame = camera_frames.get(camera_id)
            if frame is not None:
                # If it's already bytes (JPEG), return directly
                if isinstance(frame, bytes):
                    return Response(content=frame, media_type="image/jpeg")
                # If it's a numpy array, check size and encode
                elif hasattr(frame, 'size') and frame.size > 0:
                     logger.info(f"Serving frame from cache for camera {camera_id}")
                     ret, buffer = cv2.imencode('.jpg', frame)
                     if ret:
                        return Response(content=buffer.tobytes(), media_type="image/jpeg")
        
        # 2. Fallback: RTSP
        logger.info(f"Cache miss/empty for camera {camera_id}. Connecting to RTSP: {camera.rtsp_url}")
        
        # Force TCP explicitly for this capture if env var didn't work (OpenCV backend trick)
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        cap = cv2.VideoCapture(camera.rtsp_url)
        
        if not cap.isOpened():
            logger.error(f"Failed to open RTSP stream for camera {camera_id}")
            # Return a black placeholder instead of crashing
            placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, "CONNECTION FAILED", (50, 180), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            _, buffer = cv2.imencode('.jpg', placeholder)
            return Response(content=buffer.tobytes(), media_type="image/jpeg")
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None or frame.size == 0:
            logger.error(f"Failed to read frame from RTSP for camera {camera_id}")
            placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, "NO FRAME", (50, 180), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            _, buffer = cv2.imencode('.jpg', placeholder)
            return Response(content=buffer.tobytes(), media_type="image/jpeg")
            
        _, buffer = cv2.imencode('.jpg', frame)
        return Response(content=buffer.tobytes(), media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Error in get_camera_frame: {str(e)}")
        # Return error placeholder
        placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
        cv2.putText(placeholder, "SERVER ERROR", (50, 180), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        _, buffer = cv2.imencode('.jpg', placeholder)
        return Response(content=buffer.tobytes(), media_type="image/jpeg")


# Violation endpoints
@app.get("/api/violations")
async def list_violations(
    camera_id: Optional[int] = None,
    violation_type: Optional[str] = None,
    status: Optional[str] = None,
    time_filter: Optional[str] = None,
    date: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(Violation)
    
    if camera_id:
        query = query.filter(Violation.camera_id == camera_id)
    if violation_type and violation_type != 'all':
        query = query.filter(Violation.violation_type == violation_type)
    if status and status != 'all':
        if status == 'pending':
             # Include None as pending
             from sqlalchemy import or_
             query = query.filter(or_(Violation.status == 'pending', Violation.status == None))
        else:
             query = query.filter(Violation.status == status)
             
    if date:
        # Filter by specific date YYYY-MM-DD
        try:
            date_obj = datetime.strptime(date, "%Y-%m-%d")
            next_day = date_obj + timedelta(days=1)
            query = query.filter(Violation.timestamp >= date_obj, Violation.timestamp < next_day)
        except ValueError:
            pass
    elif time_filter:
        now = datetime.utcnow()
        if time_filter == '1hour':
            query = query.filter(Violation.timestamp >= now - timedelta(hours=1))
        elif time_filter == '15min':
             query = query.filter(Violation.timestamp >= now - timedelta(minutes=15))
        elif time_filter == 'today':
             query = query.filter(Violation.timestamp >= now.replace(hour=0, minute=0, second=0, microsecond=0))
        elif time_filter == '1week':
             query = query.filter(Violation.timestamp >= now - timedelta(days=7))

    # Pagination
    total_count = query.count()
    total_pages = (total_count + page_size - 1) // page_size
    
    offset = (page - 1) * page_size
    violations = query.order_by(Violation.timestamp.desc()).offset(offset).limit(page_size).all()
    
    # Convert manually to use computed properties
    results = []
    for v in violations:
        v_dict = {
            "id": v.id,
            "camera_id": v.camera_id,
            "violation_type": v.violation_type,
            "violationType": v.violation_type,  # Add camelCase for frontend
            "plate_number": v.plate_number,
            "plateNumber": v.plate_number,  # Add camelCase for frontend
            "speed": v.speed,
            "synced_to_central": v.synced_to_central,
            "timestamp": v.timestamp,
            "status": v.status or 'pending',
            "confidence": getattr(v, 'plate_confidence', 0.0),
            "licensePlate": v.plate_number,
        }
        
        # Add URLs
        if hasattr(v, 'snapshot_path') and v.snapshot_path:
            rel_path = os.path.relpath(v.snapshot_path, Config.OUTPUT_DIR)
            v_dict['snapshotUrl'] = f"/output/{rel_path}"
        
        if hasattr(v, 'plate_image_path') and v.plate_image_path:
            rel_path = os.path.relpath(v.plate_image_path, Config.OUTPUT_DIR)
            v_dict['plateImageUrl'] = f"/output/{rel_path}"
            
        results.append(ViolationResponse(**v_dict))
    
    return {
        "violations": results,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1
        }
    }


class ViolationUpdate(BaseModel):
    status: Optional[str] = None
    licensePlate: Optional[str] = None


@app.patch("/api/violations/{violation_id}")
async def update_violation(violation_id: int, update: ViolationUpdate, db: Session = Depends(get_db)):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    if update.status:
        violation.status = update.status
    if update.licensePlate:
        violation.plate_number = update.licensePlate
        
    db.commit()
    return {"message": "Violation updated", "id": violation.id}


@app.get("/api/fines")
async def list_fines(
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    
    # Aggregate approved violations by license plate
    # Filter for status='verified' (or 'approved' if that's what frontend uses - frontend sends 'verified')
    
    # 1. Get unique plates with counts and total fine
    # Using SQLAlchmey to group by plate_number
    
    offset = (page - 1) * page_size
    
    # Subquery/CTE for aggregation is cleaner, but let's do direct query
    # Select plate_number, count(*), array_agg(id) ... SQLite doesn't support array_agg easily
    # We will fetch grouped stats first
    
    # Query: Select plate_number, count(*) from violations where status='verified' group by plate_number
    
    stats_query = db.query(
        Violation.plate_number,
        func.count(Violation.id).label("violation_count")
    ).filter(
        Violation.status == 'verified'
    ).group_by(
        Violation.plate_number
    ).having(
        func.count(Violation.id) > 0
    )
    
    total_count = stats_query.count()
    total_pages = (total_count + page_size - 1) // page_size
    
    results = stats_query.offset(offset).limit(page_size).all()
    
    fines_data = []
    
    for row in results:
        plate = row.plate_number
        count = row.violation_count
        amount = count * 500  # Rs. 500 per violation
        
        # Get the individual violations for this plate
        violations = db.query(Violation).filter(
            Violation.plate_number == plate,
            Violation.status == 'verified'
        ).order_by(Violation.timestamp.desc()).all()
        
        # Convert violations to Pydantic-friendly dicts manually or let Pydantic handle it via from_attributes
        # We need to compute URL properties effectively. 
        # For simplicity, we'll re-use the Pydantic model logic or reconstruct it.
        
        violation_list = []
        for v in violations:
            # Manually construct to ensure properties are called
            v_resp = ViolationResponse.from_orm(v)
            violation_list.append(v_resp)
            
        fines_data.append({
            "licensePlate": plate,
            "violationCount": count,
            "totalFine": amount,
            "violations": violation_list
        })
        
    return {
        "fines": fines_data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1
        }
    }


@app.get("/api/violations/stats")
async def violation_stats(db: Session = Depends(get_db)):
    from sqlalchemy import func
    
    stats = db.query(
        Violation.violation_type,
        func.count(Violation.id).label("count")
    ).group_by(Violation.violation_type).all()
    
    return {stat.violation_type: stat.count for stat in stats}



# Streaming logic
from fastapi.responses import StreamingResponse

import numpy as np
import os

# Create a placeholder frame (Black image with timestamp) -> Actually static is fine
def create_placeholder():
    img = np.zeros((360, 640, 3), dtype=np.uint8)
    cv2.putText(img, "CONNECTING...", (220, 180), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
    return cv2.imencode('.jpg', img)[1].tobytes()

PLACEHOLDER_FRAME = create_placeholder()

def gen_frames(camera_id: int):
    """Generate MJPEG stream for a camera."""
    
    # Force TCP for better reliability over internet
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
    
    # Lazy start: if processor not running, try to start it
    if camera_id not in processors:
        logger.info(f"Lazy starting camera {camera_id} for stream...")
        try:
             # Create new session for this thread/request
             db = next(get_db())
             cam = db.query(Camera).filter(Camera.id == camera_id).first()
             if cam and cam.is_active:
                 start_processor(cam.id, cam.rtsp_url, cam.name)
             else:
                 logger.warning(f"Camera {camera_id} not found or inactive.")
                 
             # Wait a moment for thread to spin up
             time.sleep(1)
        except Exception as e:
             logger.error(f"Failed to lazy start camera {camera_id}: {e}")
    
    while True:
        if camera_id in camera_frames:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + camera_frames[camera_id] + b'\r\n')
        else:
            # Yield placeholder if stream not ready yet
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + PLACEHOLDER_FRAME + b'\r\n')
            
            # Check if processor died and restart if needed (optional robustness)
            if camera_id not in processors:
                 # Logic to retry could go here, but let's just wait
                 pass
                 
            time.sleep(1) # Slow update for placeholder to save bandwidth
            
        time.sleep(0.04) # ~25 FPS limit

@app.get("/stream/{camera_id}")
async def video_feed(camera_id: int, show_inference: bool = True):
    """Video streaming route. Put this in the src attribute of an img tag."""
    return StreamingResponse(gen_frames(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
