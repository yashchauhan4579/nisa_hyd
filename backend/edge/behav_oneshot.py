import cv2, os, time, base64, json, urllib.request, numpy as np
from ultralytics import YOLO
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]="rtsp_transport;tcp"
CH=os.environ.get("CH","2")
URL="rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=%s&subtype=1"%CH
m=YOLO("/home/jetson/iris-edge/models/crowd/640sbest.engine", task="detect")
m.predict(np.zeros((640,640,3),np.uint8),imgsz=640,verbose=False)
cap=cv2.VideoCapture(URL,cv2.CAP_FFMPEG)
frame=None
for _ in range(30):
    ok,f=cap.read()
    if ok: frame=f
cap.release()
if frame is None: print("NO FRAME"); raise SystemExit
r=m.predict(frame,imgsz=640,conf=0.25,verbose=False)[0]
cls=r.boxes.cls.cpu().numpy().astype(int); xy=r.boxes.xyxy.cpu().numpy()
heads=int((cls==0).sum())
hbox=[xy[j].tolist() for j in range(len(cls)) if cls[j]==0]
print("live frame %dx%d | head boxes(class0)=%d"%(frame.shape[1],frame.shape[0],heads))
nw=512; nh=int(frame.shape[0]*nw/frame.shape[1]); sx=nw/frame.shape[1]; sy=nh/frame.shape[0]
small=cv2.resize(frame,(nw,nh)); _,buf=cv2.imencode(".jpg",small,[cv2.IMWRITE_JPEG_QUALITY,85])
shb=[[b[0]*sx,b[1]*sy,b[2]*sx,b[3]*sy] for b in hbox]
payload={"camera":"Channel%s"%CH,"head_boxes":shb,"frame":base64.b64encode(buf).decode()}
t=time.time(); resp=json.load(urllib.request.urlopen(urllib.request.Request("http://10.10.0.206:5173/behavior",data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"}),timeout=60)); dt=time.time()-t
print("round-trip %.1fs"%dt)
print("RESULT_PATH="+resp["frame_path"])
print("density_count=%s head_boxes=%s"%(resp["density_count"],resp["head_boxes"]))
print("summary:",resp["analysis"].get("summary","")[:200])
