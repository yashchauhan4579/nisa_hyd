import cv2, os, time, base64, json, urllib.request, numpy as np
from ultralytics import YOLO
ING="http://10.10.0.206:5173/ingest"
NM={0:"auto",1:"bus",2:"car",3:"motorcycle",4:"truck",5:"plate"}
COL={0:[0,200,200],1:[200,0,200],2:[0,200,0],3:[0,150,255],4:[200,100,0],5:[0,0,255]}
URL="rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=1&subtype=1"
URL=os.environ.get("RTSP_SUB",URL)  # agent override (default unchanged)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]="rtsp_transport;tcp"
RUN=int(os.environ.get("RUN_SECONDS","0")); SKIP=int(os.environ.get("SKIP","2"))  # vehicles move fast → 2 for good tracking
m=YOLO("/home/jetson/iris-edge/models/vcc/st1.engine", task="detect")
m.predict(np.zeros((640,640,3),np.uint8),imgsz=640,verbose=False)
def _ist_day(): return time.strftime("%Y-%m-%d", time.gmtime(time.time()+19800))  # IST = UTC+5:30
SEEN=set(); cur_day=_ist_day()  # distinct vehicle track-IDs counted today (reset at IST midnight)
cap=cv2.VideoCapture(URL,cv2.CAP_FFMPEG); print("Ch1 opened:",cap.isOpened(),flush=True)
t0=time.time(); i=0; push=0
while RUN==0 or time.time()-t0<RUN:
    if not cap.grab(): cap.release(); time.sleep(1); cap=cv2.VideoCapture(URL,cv2.CAP_FFMPEG); continue
    i+=1
    if i%SKIP: continue
    ok,frame=cap.retrieve()
    if not ok: continue
    day=_ist_day()
    if day!=cur_day: SEEN.clear(); cur_day=day
    # ByteTrack vehicles (classes 0-4, exclude plate). Count each distinct track ID ONCE
    # → vehicle_detections = real distinct vehicles, not per-frame detections.
    r=m.track(frame,imgsz=640,conf=0.30,persist=True,tracker="bytetrack.yaml",classes=[0,1,2,3,4],verbose=False)[0]
    if r.boxes is None or r.boxes.id is None: continue
    ids=r.boxes.id.cpu().numpy().astype(int)
    cls=r.boxes.cls.cpu().numpy().astype(int); xy=r.boxes.xyxy.cpu().numpy()
    new_boxes=[]; counts={}
    for j in range(len(ids)):
        tid=int(ids[j])
        if tid in SEEN: continue            # already counted this vehicle
        SEEN.add(tid)
        c=int(cls[j]); b=xy[j].astype(int)
        new_boxes.append([int(b[0]),int(b[1]),int(b[2]),int(b[3]),NM[c],COL[c]])
        counts[NM[c]]=counts.get(NM[c],0)+1
    if not new_boxes: continue              # no NEW vehicles this frame → nothing to record
    _,fb=cv2.imencode(".jpg",frame,[cv2.IMWRITE_JPEG_QUALITY,80])
    lbl="VCC Ch1 | new: "+(" ".join("%s:%d"%(k,v) for k,v in counts.items()))
    try:
        urllib.request.urlopen(urllib.request.Request(ING,data=json.dumps({"analytic":"vcc","camera":"Channel1","boxes":new_boxes,"label":lbl,"meta":counts,"frame":base64.b64encode(fb).decode()}).encode(),headers={"Content-Type":"application/json"}),timeout=12); push+=1
    except Exception as ex: print("post fail",ex,flush=True)
print("VCC RUNNER DONE Ch1: pushes=%d seen=%d"%(push,len(SEEN)))
