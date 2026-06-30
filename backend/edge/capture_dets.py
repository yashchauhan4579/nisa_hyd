import cv2, os, json, numpy as np
from ultralytics import YOLO
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]="rtsp_transport;tcp"
URL="rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=4&subtype=1"
m=YOLO("/home/jetson/iris-edge/models/crowd/640sbest.engine",task="detect")
m.predict(np.zeros((640,640,3),np.uint8),imgsz=640,verbose=False)
cap=cv2.VideoCapture(URL,cv2.CAP_FFMPEG); frame=None
for _ in range(30):
    ok,f=cap.read()
    if ok: frame=f
cap.release()
r=m.predict(frame,imgsz=640,conf=0.25,verbose=False)[0]
cls=r.boxes.cls.cpu().numpy().astype(int); xy=r.boxes.xyxy.cpu().numpy(); cf=r.boxes.conf.cpu().numpy()
heads=[[float(xy[j][0]),float(xy[j][1]),float(xy[j][2]),float(xy[j][3]),float(cf[j])] for j in range(len(cls)) if cls[j]==0]
persons=[[float(xy[j][0]),float(xy[j][1]),float(xy[j][2]),float(xy[j][3]),float(cf[j])] for j in range(len(cls)) if cls[j]==1]
cv2.imwrite("/tmp/style_frame.jpg",frame)
json.dump({"heads":heads,"persons":persons},open("/tmp/style_boxes.json","w"))
print("captured %dx%d heads=%d persons=%d"%(frame.shape[1],frame.shape[0],len(heads),len(persons)))
