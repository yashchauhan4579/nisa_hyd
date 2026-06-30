import cv2, os, time, base64, json, urllib.request, numpy as np, threading
from ultralytics import YOLO
ING="http://10.10.0.206:5173/ingest"; BEH="http://10.10.0.206:5173/forensics"
CH=os.environ.get("CH","2")
SUB="rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=%s&subtype=1"%CH
MAIN="rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=%s&subtype=0"%CH
SUB=os.environ.get("RTSP_SUB",SUB); MAIN=os.environ.get("RTSP_MAIN",MAIN)  # agent override (defaults unchanged)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]="rtsp_transport;tcp"
RUN=int(os.environ.get("RUN_SECONDS","0")); SKIP=int(os.environ.get("SKIP","4")); BEH_EVERY=float(os.environ.get("BEH_EVERY","8"))
GPU=threading.Lock()  # serialize the two models' GPU inference (thread-safe across threads)
m=YOLO("/home/jetson/iris-edge/models/crowd/640sbest.engine",task="detect")
m.predict(np.zeros((640,640,3),np.uint8),imgsz=640,verbose=False)
mp=YOLO("/home/jetson/iris-edge/models/person/yolov8s.engine",task="detect")  # COCO person=cls0
mp.predict(np.zeros((640,640,3),np.uint8),imgsz=640,verbose=False)
def post(u,p):
    try: urllib.request.urlopen(urllib.request.Request(u,data=json.dumps(p).encode(),headers={"Content-Type":"application/json"}),timeout=25); return True
    except Exception as ex: print("post fail",str(ex)[:50],flush=True); return False
def b64(im,q=85): _,b=cv2.imencode(".jpg",im,[cv2.IMWRITE_JPEG_QUALITY,q]); return base64.b64encode(b).decode()
t0=time.time()

# ── Forensics (main-stream person pass) in its OWN thread so it never stalls the crowd
#    loop. The slow part (opening the 1440p RTSP + reading 20 frames) runs concurrently;
#    only the brief person inference takes the GPU lock.
def forensics_loop():
    bp=0
    while RUN==0 or time.time()-t0<RUN:
        c0=time.time()
        mc=cv2.VideoCapture(MAIN,cv2.CAP_FFMPEG); mf=None
        for _ in range(20):
            o,f=mc.read()
            if o: mf=f
        mc.release()
        if mf is not None:
            with GPU: rr=mp.predict(mf,imgsz=640,conf=0.3,verbose=False)[0]
            c2=rr.boxes.cls.cpu().numpy().astype(int); x2=rr.boxes.xyxy.cpu().numpy()
            pbox=[x2[j].tolist() for j in range(len(c2)) if c2[j]==0]
            nw=800; nh=int(mf.shape[0]*nw/mf.shape[1]); sx=nw/mf.shape[1]; sy=nh/mf.shape[0]
            disp=cv2.resize(mf,(nw,nh)); sm=cv2.resize(mf,(512,int(mf.shape[0]*512/mf.shape[1])))
            spb=[[b[0]*sx,b[1]*sy,b[2]*sx,b[3]*sy] for b in pbox]
            if post(BEH,{"camera":"Channel%s"%CH,"person_boxes":spb,"frame":b64(sm,90),"frame_display":b64(disp,62)}): bp+=1
            print("  beh push: persons=%d"%len(pbox),flush=True)
        dt=time.time()-c0
        if dt<BEH_EVERY: time.sleep(BEH_EVERY-dt)
threading.Thread(target=forensics_loop,daemon=True).start()

# ── Crowd (sub-stream head tracking) — main thread, runs continuously (no forensics pause).
def _ist_day(): return time.strftime("%Y-%m-%d", time.gmtime(time.time()+19800))  # IST = UTC+5:30
SEEN=set(); cur_day=_ist_day()  # distinct head track-IDs seen today (reset at IST midnight)
cap=cv2.VideoCapture(SUB,cv2.CAP_FFMPEG); print("Ch%s sub:"%CH,cap.isOpened(),flush=True)
i=0; cp=0
while RUN==0 or time.time()-t0<RUN:
    if not cap.grab(): cap.release(); time.sleep(1); cap=cv2.VideoCapture(SUB,cv2.CAP_FFMPEG); continue
    i+=1
    if i%SKIP: continue
    ok,fr=cap.retrieve()
    if not ok: continue
    day=_ist_day()
    if day!=cur_day: SEEN.clear(); cur_day=day
    with GPU: r=m.track(fr,imgsz=640,conf=0.25,persist=True,tracker="bytetrack.yaml",classes=[0],verbose=False)[0]
    xy=r.boxes.xyxy.cpu().numpy() if (r.boxes is not None and len(r.boxes)) else np.zeros((0,4))
    if r.boxes is not None and r.boxes.id is not None:
        SEEN |= set(int(x) for x in r.boxes.id.cpu().numpy().astype(int))
    heads=len(xy); cumulative=len(SEEN)
    hbox=[[int(b[0]),int(b[1]),int(b[2]),int(b[3])] for b in xy]
    if post(ING,{"analytic":"crowd","camera":"Channel%s"%CH,"boxes":hbox,"meta":{"heads":heads,"cumulative":cumulative},"frame":b64(fr)}): cp+=1
print("RUNNER Ch%s: crowd=%d"%(CH,cp))
