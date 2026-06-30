#!/usr/bin/env python3
"""IRIS Perimeter Intrusion — ROI-only live inference + event-clip recording + editable ROI.

- Reads VIDEO_SOURCE (RTSP cam now; file fallback). Downscales for a smooth stream.
- Person detection + tracking (ultralytics yolov8s TRT engine, built-in ByteTrack).
- ROI = a polygon zone. A person ENTERING the ROI raises an Intrusion alert.
  Dwelling past LOITER_SECONDS raises a Loitering alert.
- On ROI entry -> start a clip (pre-roll); when the ROI empties -> short post-roll,
  then finalize a browser-playable H.264 mp4 (ffmpeg). Clips listed + served.
- ROI editable live from the UI: GET/POST /zones, persisted to zones.json, no restart.

Endpoints: /health /alerts /stream.mjpg /zones(GET,POST) /clips /clips/{name} /snapshot.jpg
"""
import os, time, json, threading, collections, subprocess, glob
# Low-latency RTSP: prefer TCP, disable input buffering/reordering so the
# decoder hands us the freshest frame instead of a growing backlog.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS",
                      "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|reorder_queue_size;0")
import cv2
import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.environ.get("ENGINE", "/home/jetson/iris-edge/models/person/yolov8s.engine")
def _read_source():
    s = os.environ.get("VIDEO_SOURCE")
    if s: return s
    try: return open("/home/jetson/cam_source.txt").read().strip()
    except Exception: return "/home/jetson/iris-edge/recordings/ch3_2026-06-10_1000-1010_IST.mp4"
VIDEO_SOURCE = _read_source()
DEVICE_ID = os.environ.get("DEVICE_ID", "perimeter-219")
CONF = float(os.environ.get("CONF", "0.30"))
IMGSZ = int(os.environ.get("IMGSZ", "640"))
STREAM_W = int(os.environ.get("STREAM_W", "900"))
JPEG_Q = int(os.environ.get("JPEG_Q", "68"))
LOITER_SECONDS = float(os.environ.get("LOITER_SECONDS", "8.0"))
TARGET_FPS = float(os.environ.get("TARGET_FPS", "14"))
PREROLL_SEC = float(os.environ.get("PREROLL_SEC", "1.0"))
POSTROLL_SEC = float(os.environ.get("POSTROLL_SEC", "1.2"))
CLIP_FPS = float(os.environ.get("CLIP_FPS", "12"))
CLIPS_DIR = os.path.join(HERE, "clips"); os.makedirs(CLIPS_DIR, exist_ok=True)
ZONES_PATH = os.path.join(HERE, "zones.json")
IS_FILE = "://" not in VIDEO_SOURCE

# ---- ROI geometry (normalized [0,1]); editable live ----
ZONE = [[0.30, 0.30], [0.72, 0.26], [0.80, 0.78], [0.34, 0.84]]
def _load_zones():
    global ZONE
    try:
        z = json.load(open(ZONES_PATH)).get(DEVICE_ID, {})
        if z.get("zone"): ZONE = z["zone"]
    except Exception: pass
def _save_zones():
    try:
        data = {}
        if os.path.exists(ZONES_PATH):
            try: data = json.load(open(ZONES_PATH))
            except Exception: data = {}
        data[DEVICE_ID] = {"zone": ZONE}
        json.dump(data, open(ZONES_PATH, "w"), indent=2)
    except Exception as e: print("save zones failed:", e)
_load_zones()

# ---- shared state ----
_lock = threading.Condition()
_latest_jpeg = None
_alerts = collections.deque(maxlen=80)
_clips = collections.deque(maxlen=40)
_stats = {"intrusions": 0, "loiterers": 0, "live": False, "source": VIDEO_SOURCE, "fps": 0.0,
          "recording": False, "occupancy": 0, "clips": 0}
_track_inzone = {}; _track_dwell = {}; _track_loitered = set()

def _point_in_poly(px, py, poly):
    inside = False; n = len(poly); j = n-1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (px < (xj-xi)*(py-yi)/((yj-yi)+1e-9)+xi): inside = not inside
        j = i
    return inside
def _add_alert(kind, severity, title, zone, tid, desc, extra=None):
    a = {"id": f"{kind}-{tid}-{int(time.time()*1000)}", "deviceId": DEVICE_ID, "alertType": kind,
         "severity": severity, "title": title, "zone": zone, "trackId": tid, "description": desc,
         "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")}
    if extra: a.update(extra)
    _alerts.appendleft(a)

# ---- clip recorder (ffmpeg H.264, browser-playable) ----
class ClipRecorder:
    def __init__(self): self.proc=None; self.path=None; self.name=None; self.w=0; self.h=0; self.frames=0; self.start_t=0
    def start(self, w, h, preroll):
        ts = time.strftime("%Y%m%d_%H%M%S")
        self.name = f"clip_{ts}.mp4"; self.path = os.path.join(CLIPS_DIR, self.name)
        self.w, self.h, self.frames, self.start_t = w, h, 0, time.time()
        cmd = ["ffmpeg","-y","-loglevel","error","-f","rawvideo","-pix_fmt","bgr24","-s",f"{w}x{h}",
               "-r",f"{CLIP_FPS:g}","-i","-","-an","-c:v","libx264","-preset","ultrafast",
               "-pix_fmt","yuv420p","-movflags","+faststart", self.path]
        try:
            self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            print("ffmpeg start failed:", e); self.proc=None
        for f in list(preroll): self.write(f)
    def write(self, frame):
        if self.proc and self.proc.stdin:
            if frame.shape[1]!=self.w or frame.shape[0]!=self.h: frame=cv2.resize(frame,(self.w,self.h))
            try: self.proc.stdin.write(frame.tobytes()); self.frames+=1
            except Exception: pass
    def stop(self):
        if not self.proc: return None
        try: self.proc.stdin.close(); self.proc.wait(timeout=15)
        except Exception:
            try: self.proc.kill()
            except Exception: pass
        dur = round(self.frames/CLIP_FPS, 1)
        meta = {"name": self.name, "url": f"/clips/{self.name}", "start": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(self.start_t)),
                "duration": dur, "frames": self.frames}
        self.proc=None
        return meta if self.frames>0 else None

# ---- low-latency frame grabber ----
class FrameGrabber:
    """Background reader that always holds ONLY the freshest frame. For RTSP it
    reads as fast as the decoder delivers and keeps just the latest frame, so the
    inference loop never falls behind the live feed (stale frames are dropped).
    For file sources it paces playback at TARGET_FPS so clips/loops play normally."""
    def __init__(self, src):
        self.src = src; self.is_file = "://" not in src
        self.lock = threading.Lock(); self.frame = None; self.seq = 0; self.stopped = False
        self.cap = self._open()
        threading.Thread(target=self._run, daemon=True).start()
    def _open(self):
        cap = cv2.VideoCapture(self.src, cv2.CAP_FFMPEG)
        try: cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception: pass
        return cap
    def _run(self):
        while not self.stopped:
            ok, f = self.cap.read()
            if not ok or f is None:
                if self.is_file:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0); continue
                time.sleep(0.3)
                try: self.cap.release()
                except Exception: pass
                self.cap = self._open(); continue
            with self.lock:
                self.frame = f; self.seq += 1
            if self.is_file:
                time.sleep(1.0/max(1.0, TARGET_FPS))  # don't race through a file
    def read(self):
        with self.lock:
            if self.frame is None: return False, None, self.seq
            return True, self.frame, self.seq

def infer_loop():
    global _latest_jpeg
    from ultralytics import YOLO
    print("loading engine:", ENGINE, flush=True)
    model = YOLO(ENGINE, task="detect")
    print("opening source:", VIDEO_SOURCE, flush=True)
    grab = FrameGrabber(VIDEO_SOURCE)
    min_dt = 1.0/TARGET_FPS; last_t = time.time(); fps_ema = 0.0; last_seq = -1
    preroll = collections.deque(maxlen=int(PREROLL_SEC*CLIP_FPS)+1)
    rec = ClipRecorder(); empty_since = None
    while True:
        ok, frame, seq = grab.read()
        if not ok or frame is None or seq == last_seq:
            time.sleep(0.005); continue   # wait for a genuinely new frame
        last_seq = seq; frame = frame.copy()
        H0, W0 = frame.shape[:2]
        if W0 > STREAM_W:
            sc = STREAM_W/float(W0); frame = cv2.resize(frame, (STREAM_W, int(H0*sc)))
        H, W = frame.shape[:2]
        try: res = model.track(frame, persist=True, classes=[0], imgsz=IMGSZ, conf=CONF, verbose=False, tracker="bytetrack.yaml")[0]
        except Exception: res = None
        zone = ZONE
        poly_px = [(p[0]*W, p[1]*H) for p in zone]
        occ=0; boxes=[]; new_intrusion=False
        if res is not None and res.boxes is not None and res.boxes.id is not None:
            xy = res.boxes.xyxy.cpu().numpy(); ids = res.boxes.id.cpu().numpy().astype(int)
            for (x1,y1,x2,y2), tid in zip(xy, ids):
                cx, cy = (x1+x2)/2.0, y2
                # hit-test in PIXEL space — poly_px matches cx,cy (both in resized-frame
                # pixels). Testing against the normalized `zone` here always fails.
                inzone = _point_in_poly(cx, cy, poly_px)
                was = _track_inzone.get(tid, False)
                if inzone and not was:   # ENTERED the ROI -> intrusion
                    _stats["intrusions"]+=1; new_intrusion=True
                    _add_alert("intrusion","red","ROI Intrusion","Restricted Zone",int(tid),f"Track #{int(tid)} entered the ROI")
                _track_inzone[tid] = inzone
                if inzone:
                    occ += 1
                    _track_dwell[tid] = _track_dwell.get(tid,0.0)+min_dt
                    if _track_dwell[tid] >= LOITER_SECONDS and tid not in _track_loitered:
                        _track_loitered.add(tid); _stats["loiterers"]+=1
                        _add_alert("loitering","yellow","Loitering Detected","Restricted Zone",int(tid),f"Track #{int(tid)} dwelling in ROI",{"dwellSeconds":round(_track_dwell[tid],1)})
                else:
                    _track_dwell[tid] = max(0.0, _track_dwell.get(tid,0.0)-min_dt*0.5)
                col = (0,0,255) if inzone else (0,200,0)
                boxes.append((int(x1),int(y1),int(x2),int(y2),int(tid),col))
        # ---- draw ----
        overlay = frame.copy()
        cv2.fillPoly(overlay, [np.array(poly_px, np.int32)], (0,140,255))
        frame = cv2.addWeighted(overlay, 0.18, frame, 0.82, 0)
        cv2.polylines(frame, [np.array(poly_px, np.int32)], True, (0,170,255), 2)
        cv2.putText(frame,"ROI",(int(poly_px[0][0]),int(poly_px[0][1])-6),cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,170,255),2)
        for (x1,y1,x2,y2,tid,col) in boxes:
            cv2.rectangle(frame,(x1,y1),(x2,y2),col,2)
            cv2.putText(frame,f"ID {tid}",(x1,max(12,y1-5)),cv2.FONT_HERSHEY_SIMPLEX,0.45,col,1)
        cv2.rectangle(frame,(0,0),(W,28),(15,15,15),-1)
        cv2.putText(frame,f"IRIS PERIMETER  {DEVICE_ID}  in-ROI:{occ}  intrusions:{_stats['intrusions']}",(8,19),cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,220,255),1)
        cv2.putText(frame,time.strftime("%H:%M:%S"),(W-92,19),cv2.FONT_HERSHEY_SIMPLEX,0.5,(200,200,200),1)
        if rec.proc: cv2.circle(frame,(W-12,40),6,(0,0,255),-1); cv2.putText(frame,"REC",(W-44,45),cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,0,255),2)
        if new_intrusion: cv2.rectangle(frame,(0,0),(W,H),(0,0,255),6)

        # ---- clip state machine (ROI occupancy) ----
        preroll.append(frame.copy())
        if occ > 0:
            empty_since = None
            if not rec.proc:
                rec.start(W, H, preroll); _stats["recording"]=True
                _add_alert("clip","red","Intrusion Clip Started","Restricted Zone",0,"Recording ROI event")
            else: rec.write(frame)
        else:
            if rec.proc:
                rec.write(frame)
                if empty_since is None: empty_since = time.time()
                elif time.time()-empty_since >= POSTROLL_SEC:
                    meta = rec.stop(); _stats["recording"]=False
                    if meta:
                        _clips.appendleft(meta); _stats["clips"]=len(_clips)
                        _add_alert("clip","green","Intrusion Clip Saved","Restricted Zone",0,f"Clip {meta['duration']}s ready",{"clip":meta["url"]})
                    empty_since=None
        _stats["occupancy"]=occ

        ok2, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])
        if ok2:
            with _lock:
                _latest_jpeg = jpg.tobytes(); _lock.notify_all()
        dt = time.time()-last_t
        if dt < min_dt: time.sleep(min_dt-dt)
        now2=time.time(); inst=1.0/max(1e-3,now2-last_t); last_t=now2
        fps_ema = inst if fps_ema==0 else fps_ema*0.9+inst*0.1
        _stats["fps"]=round(fps_ema,1); _stats["live"]=True

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health(): return {"ok": True, **_stats, "zone": ZONE, "alerts": len(_alerts)}
@app.get("/alerts")
def alerts(): return JSONResponse(list(_alerts))
@app.get("/zones")
def get_zones(): return {"zone": ZONE, "deviceId": DEVICE_ID}

@app.post("/zones")
async def set_zones(req: Request):
    global ZONE
    d = await req.json()
    if isinstance(d.get("zone"), list) and len(d["zone"])>=3:
        ZONE = [[float(p[0]), float(p[1])] for p in d["zone"]]
        _save_zones()
        return {"ok": True, "zone": ZONE}
    return JSONResponse({"ok": False, "error": "zone needs >=3 points"}, status_code=400)

@app.get("/clips")
def list_clips(): return JSONResponse(list(_clips))

@app.get("/clips/{name}")
def get_clip(name: str):
    safe = os.path.basename(name); p = os.path.join(CLIPS_DIR, safe)
    if not os.path.exists(p): return JSONResponse({"error":"not found"}, status_code=404)
    return FileResponse(p, media_type="video/mp4", filename=safe)

@app.get("/snapshot.jpg")
def snapshot():
    with _lock: buf = _latest_jpeg
    if buf is None: return JSONResponse({"error":"warming"}, status_code=503)
    return Response(content=buf, media_type="image/jpeg")

def _mjpeg():
    b = b"--frame"
    while True:
        with _lock:
            _lock.wait(timeout=2.0); buf = _latest_jpeg
        if buf is None: time.sleep(0.05); continue
        yield b + b"\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(buf)).encode() + b"\r\n\r\n" + buf + b"\r\n"

@app.get("/stream.mjpg")
def stream(): return StreamingResponse(_mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame")

if __name__ == "__main__":
    for p in sorted(glob.glob(os.path.join(CLIPS_DIR, "clip_*.mp4")), reverse=True)[:40]:
        n = os.path.basename(p); _clips.append({"name": n, "url": f"/clips/{n}", "start": "", "duration": 0, "frames": 0})
    _stats["clips"] = len(_clips)
    threading.Thread(target=infer_loop, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7300")), log_level="warning")
