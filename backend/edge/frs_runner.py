import cv2, os, time, base64, json, urllib.request, numpy as np
from insightface.app import FaceAnalysis
ING="http://10.10.0.206:5173/ingest"
URL=os.environ.get("FRS_SOURCE","rtsp://admin:REDACTED@192.168.1.5:554/cam/realmonitor?channel=3&subtype=0")
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]="rtsp_transport;tcp"
DET=float(os.environ.get("DET_THRESH","0.72")); MATCH=0.35; SKIP=int(os.environ.get("SKIP","8"))  # 0.72 rejects weak false-positives
DET_SIZE=int(os.environ.get("DET_SIZE","640"))
RUN_SECONDS=int(os.environ.get("RUN_SECONDS","0"))
SAME_SIM=float(os.environ.get("DEDUP_SIM","0.40"))    # cosine ≥ → same person (track match); keeps a lingering person as ONE track
CLOSE_GAP=float(os.environ.get("CLOSE_GAP","3.0"))    # emit a person's ONE detection this long after they leave
MAX_COLLECT=float(os.environ.get("MAX_COLLECT","45.0"))# loiterer safety: emit once after this long, then keep suppressing (no duplicates)
CROP_PAD=float(os.environ.get("CROP_PAD","100.0"))    # huge pad → clamps to FULL camera frame w/ face boxed
# genderage is unreliable on tiny/low-conf faces → only sample age/gender for faces this tall (px) + conf.
GENDER_MINFACE=int(os.environ.get("GENDER_MINFACE","95")); GENDER_MINCONF=float(os.environ.get("GENDER_MINCONF","0.72"))
# CPU-only ONNXRuntime → zero GPU memory. Local buffalo_l (no ~/.insightface download).
app=FaceAnalysis(name="buffalo_l", root="/home/jetson/iris-edge",
                 allowed_modules=["detection","recognition","genderage"], providers=["CUDAExecutionProvider","CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(DET_SIZE,DET_SIZE), det_thresh=DET)
app.get(np.zeros((DET_SIZE,DET_SIZE,3),np.uint8))  # warm
def nrm(e): return e/(np.linalg.norm(e)+1e-9)
gallery={}
tracks=[]   # per-person collectors: aggregate every sighting, then emit ONE consensus detection on close

def build_sample(f, frame, e):
    """Encode the best-frame payload for one face: wide boxed crop + scaled box + emb + small scene frame."""
    H,W=frame.shape[:2]
    b=f.bbox.astype(int); x1,y1,x2,y2=int(b[0]),int(b[1]),int(b[2]),int(b[3]); bw=max(x2-x1,1); bh=max(y2-y1,1)
    col=[0,200,0]
    px=int(bw*CROP_PAD)+10; py=int(bh*CROP_PAD)+10
    cx1=max(x1-px,0); cy1=max(y1-py,0); cx2=min(x2+px,W); cy2=min(y2+py,H)
    crop=frame[cy1:cy2,cx1:cx2].copy(); cb64=""
    if crop.size:
        bx1,by1,bx2,by2=x1-cx1,y1-cy1,x2-cx1,y2-cy1
        if crop.shape[1]>720:
            scc=720.0/crop.shape[1]; crop=cv2.resize(crop,(720,int(crop.shape[0]*scc)))
            bx1,by1,bx2,by2=int(bx1*scc),int(by1*scc),int(bx2*scc),int(by2*scc)
        cv2.rectangle(crop,(bx1,by1),(bx2,by2),tuple(col),2)
        _,cb=cv2.imencode(".jpg",crop,[cv2.IMWRITE_JPEG_QUALITY,80]); cb64=base64.b64encode(cb).decode()
    nw=960; nh=int(H*nw/W); sx=nw/W; sy=nh/H
    small=cv2.resize(frame,(nw,nh)); _,fb=cv2.imencode(".jpg",small,[cv2.IMWRITE_JPEG_QUALITY,80])
    sb=[int(x1*sx),int(y1*sy),int(x2*sx),int(y2*sy),"unknown %.2f"%f.det_score,col]
    return {"crop":cb64,"box":sb,"emb":base64.b64encode(np.asarray(e,dtype='<f4').tobytes()).decode(),
            "det":round(float(f.det_score),3),"frame":base64.b64encode(fb).decode()}

def post_track(t):
    """Emit one detection for a person: majority-vote gender + median age over all their sightings, best frame."""
    gs=[g for g in t["genders"] if g]
    gender=max(set(gs),key=gs.count) if gs else ""
    ages=sorted([a for a in t["ages"] if a>0]); age=int(ages[len(ages)//2]) if ages else 0
    s=t["best"]
    payload={"analytic":"frs","camera":"Channel3","boxes":[s["box"]],"crops":[s["crop"]],
             "embs":[s["emb"]],"dets":[s["det"]],"ages":[age],"genders":[gender],
             "label":"FRS Ch3 | 1 face","meta":{"faces":1,"samples":t["n"]},"frame":s["frame"]}
    try:
        urllib.request.urlopen(urllib.request.Request(ING,data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"}),timeout=10); return True
    except Exception as ex: print("push fail:",ex,flush=True); return False

cap=cv2.VideoCapture(URL,cv2.CAP_FFMPEG)
print("stream opened:",cap.isOpened(),flush=True)
t0=time.time(); i=0; pushed=0; total_faces=0
while RUN_SECONDS==0 or time.time()-t0 < RUN_SECONDS:
    if not cap.grab():
        cap.release(); time.sleep(1); cap=cv2.VideoCapture(URL,cv2.CAP_FFMPEG); continue
    i+=1; now=time.time()
    if i%SKIP==0:
        ok,frame=cap.retrieve()
        if ok:
            faces=app.get(frame); total_faces+=len(faces)
            for f in faces:
                e=nrm(f.embedding)
                g=""; a=0
                if (int(f.bbox[3])-int(f.bbox[1]))>=GENDER_MINFACE and float(f.det_score)>=GENDER_MINCONF:
                    a=int(getattr(f,"age",0) or 0)
                    g=getattr(f,"sex",None) or ("M" if int(getattr(f,"gender",0) or 0)==1 else "F")
                mt=None
                for t in tracks:
                    if float(np.dot(e,t["emb"]))>=SAME_SIM: mt=t; break
                if mt is None:
                    mt={"emb":e,"genders":[],"ages":[],"n":0,"first":now,"last":now,"best_det":-1.0,"best":None,"posted":False}; tracks.append(mt)
                mt["last"]=now; mt["n"]+=1; mt["emb"]=nrm(mt["emb"]*0.8+e*0.2)
                if g: mt["genders"].append(g)
                if a>0: mt["ages"].append(a)
                if float(f.det_score)>mt["best_det"]:
                    mt["best_det"]=float(f.det_score); mt["best"]=build_sample(f,frame,e)
    # a person who LEFT (gap ≥ CLOSE_GAP) → emit their ONE best-frame detection (if not already), then drop
    __leaving=[t for t in tracks if now-t["last"]>=CLOSE_GAP]
    __lids={id(t) for t in __leaving}
    for t in __leaving:
        if t["best"] and not t["posted"] and post_track(t): pushed+=1
        if pushed%5==1: print("pushed=%d total_faces=%d active_tracks=%d"%(pushed,total_faces,len(tracks)),flush=True)
    if __leaving:
        tracks[:]=[t for t in tracks if id(t) not in __lids]
    # loiterer still present past MAX_COLLECT → emit ONCE, then keep the track to suppress (no duplicates)
    for t in tracks:
        if t["best"] and not t["posted"] and (now-t["first"]>=MAX_COLLECT):
            if post_track(t): pushed+=1
            t["posted"]=True
print("RUNNER DONE: pushed=%d events, total_faces=%d"%(pushed,total_faces))
