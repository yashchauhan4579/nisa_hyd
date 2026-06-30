import cv2, os, time, base64, json, urllib.request, numpy as np
from ultralytics import YOLO
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]="rtsp_transport;tcp"
URL="rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=4&subtype=0"  # MAIN stream
m=YOLO("/home/jetson/iris-edge/models/crowd/640sbest.engine",task="detect")
m.predict(np.zeros((640,640,3),np.uint8),imgsz=640,verbose=False)
cap=cv2.VideoCapture(URL,cv2.CAP_FFMPEG); frame=None
for _ in range(30):
    ok,f=cap.read()
    if ok: frame=f
cap.release()
r=m.predict(frame,imgsz=640,conf=0.25,verbose=False)[0]
cls=r.boxes.cls.cpu().numpy().astype(int); xy=r.boxes.xyxy.cpu().numpy()
persons=[xy[j].tolist() for j in range(len(cls)) if cls[j]==1]
heads=int((cls==0).sum())
print("main-stream %dx%d persons=%d heads=%d"%(frame.shape[1],frame.shape[0],len(persons),heads))
nw=512; nh=int(frame.shape[0]*nw/frame.shape[1]); sx=nw/frame.shape[1]; sy=nh/frame.shape[0]
small=cv2.resize(frame,(nw,nh)); _,buf=cv2.imencode(".jpg",small,[cv2.IMWRITE_JPEG_QUALITY,85])
spb=[[b[0]*sx,b[1]*sy,b[2]*sx,b[3]*sy] for b in persons]
payload={"camera":"Channel4","person_boxes":spb,"frame":base64.b64encode(buf).decode()}
resp=json.load(urllib.request.urlopen(urllib.request.Request("http://10.10.0.206:5173/behavior",data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"}),timeout=60))
print("RESULT="+resp["frame_path"], "| density_count=%s person_boxes=%s"%(resp["density_count"],resp["person_boxes"]))
