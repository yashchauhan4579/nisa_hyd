import cv2, os, json, numpy as np
from ultralytics import YOLO
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]="rtsp_transport;tcp"
URL="rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=4&subtype=0"
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
# keep a crisp 1280px-wide display frame (vs 512 before)
nw=1280; nh=int(frame.shape[0]*nw/frame.shape[1]); sx=nw/frame.shape[1]; sy=nh/frame.shape[0]
hq=cv2.resize(frame,(nw,nh))
pb=[[b[0]*sx,b[1]*sy,b[2]*sx,b[3]*sy] for b in persons]
cv2.imwrite("/tmp/hq_frame.jpg",hq,[cv2.IMWRITE_JPEG_QUALITY,92])
json.dump({"persons":pb},open("/tmp/hq_boxes.json","w"))
print("hq frame %dx%d persons=%d"%(nw,nh,len(persons)))
