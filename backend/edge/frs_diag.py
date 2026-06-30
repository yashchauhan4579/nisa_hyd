import cv2, numpy as np
from insightface.app import FaceAnalysis
for thr in [0.3, 0.5, 0.65]:
    app=FaceAnalysis(name="buffalo_l",allowed_modules=["detection","recognition"],providers=["CUDAExecutionProvider","CPUExecutionProvider"])
    app.prepare(ctx_id=0,det_size=(960,960),det_thresh=thr)
    for name in ["portrait.jpg","faces_test.jpg"]:
        img=cv2.imread("/work/"+name)
        faces=app.get(img)
        scores=[round(float(f.det_score),3) for f in faces]
        print(f"thr={thr} {name}: {len(faces)} faces, scores={scores}")
