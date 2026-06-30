import os
from ultralytics import YOLO
imgs=["cam01.jpg","portrait.jpg","crowd.jpg","faces_test.jpg"]
base="/home/jetson/iris-edge/"
for tag,mp in [("ENGINE","models/crowd/640sbest.engine"),("PT","models/crowd/640sbest.pt")]:
    m=YOLO(base+mp, task="detect")
    for img in imgs:
        r=m.predict(base+img, imgsz=640, conf=0.10, verbose=False)[0]
        cls=r.boxes.cls.cpu().numpy().astype(int)
        sc=r.boxes.conf.cpu().numpy()
        h=int((cls==0).sum()); p=int((cls==1).sum())
        top=round(float(sc.max()),3) if len(sc) else 0
        print("%-7s %-15s conf>=0.10: heads=%d persons=%d topconf=%s" % (tag,img,h,p,top))
    print()
