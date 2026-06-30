import cv2, numpy as np
from insightface.app import FaceAnalysis
DET=0.65; MATCH=0.35
app=FaceAnalysis(name="buffalo_l",allowed_modules=["detection","recognition"],providers=["CUDAExecutionProvider","CPUExecutionProvider"])
app.prepare(ctx_id=0,det_size=(960,960),det_thresh=DET)
def nrm(e): return e/(np.linalg.norm(e)+1e-9)
# 1) ENROLL PersonA from portrait.jpg
img=cv2.imread("/work/portrait.jpg"); f=app.get(img)[0]
gallery={"PersonA":nrm(f.embedding)}
print(f"[enroll] PersonA  det={f.det_score:.3f} emb=512d")
# 2) run watchlist match on both portraits, keep EVERY detection, alert only >=0.35
kept=0; alerts=0
for name in ["portrait.jpg","portrait2.jpg"]:
    im=cv2.imread("/work/"+name); faces=app.get(im); vis=im.copy()
    print(f"\n{name}: {len(faces)} detection(s)")
    for f in faces:
        b=f.bbox.astype(int); e=nrm(f.embedding)
        sim=max(float(np.dot(e,g)) for g in gallery.values())
        is_alert=sim>=MATCH; ident="PersonA" if is_alert else "unknown"
        kept+=1; alerts+=int(is_alert)
        col=(0,0,255) if is_alert else (0,200,0)
        cv2.rectangle(vis,(b[0],b[1]),(b[2],b[3]),col,3)
        cv2.putText(vis,f"{ident} {sim:.2f}",(b[0],max(b[1]-8,12)),cv2.FONT_HERSHEY_SIMPLEX,0.7,col,2)
        print(f"   det={f.det_score:.3f} match={sim:.3f} -> KEPT  identity={ident}  ALERT={is_alert}")
    cv2.imwrite("/work/e2e_"+name,vis)
print(f"\nRESULT: kept={kept} detections, alerts={alerts} (expect PersonA alerts on self, unknown on other)")
print("FRS END-TO-END OK")
