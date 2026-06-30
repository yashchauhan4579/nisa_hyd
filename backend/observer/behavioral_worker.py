#!/usr/bin/env python3
"""206 edge-ingest + behavioral worker. Beautiful boxes via supervision (corner+color, orange).
Behavioral = Qwen(clean) -> density heatmap+count -> PERSON boxes. Display = heatmap + boxes (no text)."""
import os, json, base64, time, sys, threading
from datetime import datetime
import numpy as np, cv2, requests, pytz, supervision as sv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
import uvicorn
sys.path.insert(0,"/home/oem/vllm-qwen"); import density

VLLM="http://localhost:11434/v1/chat/completions"; MODEL="qwen2.5vl:7b"
IST=pytz.timezone("Asia/Kolkata")
def _day(): return datetime.now(IST).strftime("%Y-%m-%d")
def _ts():  return datetime.now(IST).strftime("%Y%m%d_%H%M%S_%f")
IRIS_INGEST="http://localhost:3001/api/events/ingest"; IRIS_WORKER="iris-edge-219"; IRIS_TOKEN="2bf613481d0f91a098f114488da7830a90aa889a0b65fd2353838ad39bf818d9"
_last_fwd={}; FWD_EVERY=float(os.environ.get("FWD_EVERY","2"))   # DB-row + /uploads snapshot throttle per camera
IRIS_LIVEFRAME="http://localhost:3001/api/inference/crowd/live-frame"
_last_lf={}; LF_EVERY=1.5
def _density_level(n):
    return "LOW" if n<10 else "MEDIUM" if n<30 else "HIGH"
def forward_live_frame(camera, jpg_bytes):
    """Push the annotated crowd frame to irisdrone's in-memory live-frame store (no auth)
    so the crowd dashboard shows a smooth ~1.5s live feed via getAllLiveFrames."""
    try:
        b64="data:image/jpeg;base64,"+base64.b64encode(jpg_bytes).decode()
        requests.post(IRIS_LIVEFRAME, json={"deviceId":camera,"frame":b64}, timeout=5)
    except Exception as e:
        print("liveframe fail",str(e)[:50],flush=True)
def forward_crowd(camera, jpg_bytes, heads, cumulative=0):
    """Forward a crowd event to irisdrone /api/events/ingest. people_count = live head
    tracks; cumulative_count = distinct ByteTrack IDs today (real de-duplicated count)."""
    try:
        ev={"worker_id":IRIS_WORKER,"device_id":camera,"type":"crowd",
            "data":{"people_count":int(heads),"density_level":_density_level(int(heads)),
                    "cumulative_count":int(cumulative),
                    "model_type":"yolov8-head-detection","confidence":0.9}}
        requests.post(IRIS_INGEST, data={"event":json.dumps(ev)},
                      files={"frame.jpg":("frame.jpg",jpg_bytes,"image/jpeg")},
                      headers={"X-Worker-ID":IRIS_WORKER,"X-Auth-Token":IRIS_TOKEN}, timeout=8)
    except Exception as e:
        print("iris forward fail",str(e)[:60],flush=True)
VTYPE={"auto":"AUTO","bus":"BUS","car":"4W","motorcycle":"2W","truck":"TRUCK"}
def forward_vcc(camera, jpg_bytes, boxes):
    """Forward each detected vehicle as a vcc event to irisdrone (auth). plate class skipped (no OCR)."""
    try:
        hdr={"X-Worker-ID":IRIS_WORKER,"X-Auth-Token":IRIS_TOKEN}
        for b in boxes:
            lab=str(b[4]).lower() if len(b)>4 else ""
            vt=VTYPE.get(lab)
            if not vt: continue
            ev={"worker_id":IRIS_WORKER,"device_id":camera,"type":"vcc","data":{"vehicle_type":vt,"confidence":0.9}}
            requests.post(IRIS_INGEST, data={"event":json.dumps(ev)},
                          files={"frame.jpg":("frame.jpg",jpg_bytes,"image/jpeg")}, headers=hdr, timeout=8)
    except Exception as e:
        print("vcc fwd fail",str(e)[:60],flush=True)
def forward_frs(camera, frame_jpg, faces):
    """Forward each detected face as a face_detected event to irisdrone (auth). Each face:
    {crop: jpg bytes, emb: base64 float32-LE str, det: float, bbox:[x1,y1,x2,y2]}. The embedding
    drives the backend match vs frs_persons + ReID (no-op until a watchlist is enrolled)."""
    try:
        hdr={"X-Worker-ID":IRIS_WORKER,"X-Auth-Token":IRIS_TOKEN}
        for f in faces:
            md={"is_known":False}
            if f.get("age"): md["age"]=f["age"]
            if f.get("gender"): md["gender"]=f["gender"]
            if f.get("samples"): md["samples"]=f["samples"]
            data={"confidence":float(f.get("det",0.9)),"bbox":f.get("bbox",[]),"metadata":md}
            if f.get("emb"): data["faceEmbedding"]=f["emb"]
            ev={"worker_id":IRIS_WORKER,"device_id":camera,"type":"face_detected","data":data}
            files={"frame.jpg":("frame.jpg",frame_jpg,"image/jpeg")}
            if f.get("crop"): files["face_crop.jpg"]=("face_crop.jpg",f["crop"],"image/jpeg")
            requests.post(IRIS_INGEST, data={"event":json.dumps(ev)}, files=files, headers=hdr, timeout=8)
    except Exception as e:
        print("frs fwd fail",str(e)[:60],flush=True)
ORANGE=sv.Color(r=255,g=121,b=0); LIME=sv.Color(r=118,g=255,b=3); ALERT=sv.Color(r=244,g=67,b=54)
def _ann(c): return (sv.ColorAnnotator(color=c,opacity=0.35,color_lookup=sv.ColorLookup.INDEX), sv.BoxCornerAnnotator(color=c,thickness=2,corner_length=8,color_lookup=sv.ColorLookup.INDEX))
_SETS={"orange":_ann(ORANGE),"lime":_ann(LIME),"alert":_ann(ALERT)}
def _labann(c): return sv.LabelAnnotator(color=c,text_color=sv.Color.BLACK,text_scale=0.4,text_thickness=1,text_padding=3,text_position=sv.Position.TOP_LEFT,color_lookup=sv.ColorLookup.INDEX)
_LABS={"orange":_labann(ORANGE),"lime":_labann(LIME),"alert":_labann(ALERT)}
def draw(img, boxes, labels=None, palette="orange"):
    if not boxes: return img
    xyxy=np.array([[float(b[0]),float(b[1]),float(b[2]),float(b[3])] for b in boxes],dtype=float)
    dets=sv.Detections(xyxy=xyxy,class_id=np.zeros(len(boxes),dtype=int))
    cf,co=_SETS.get(palette,_SETS["orange"])
    img=cf.annotate(img,dets); img=co.annotate(img,dets)
    if labels: img=_LABS.get(palette,_LABS["orange"]).annotate(img,dets,labels=labels)
    return img
PROMPT=("You are a CCTV crowd-behavior analyst. Return JSON only: "
 "{\"density\":\"low|medium|high|critical\",\"dominant_motion\":\"static|left|right|toward|away|chaotic\","
 "\"behaviors\":[\"...\"],\"anomalies\":[\"...\"],\"crowd_mood\":\"calm|excited|agitated|panic|neutral\","
 "\"safety_risk\":\"none|low|medium|high|critical\",\"recommended_action\":\"none|monitor|dispatch|alert|evacuate\","
 "\"summary\":\"a detailed 2-3 sentence description of the scene, the people, their activity, and anything noteworthy for a security operator\"}")
app=FastAPI()
DENSITY_OK=False
try: DENSITY_OK=density.load(); print("density loaded:",DENSITY_OK,flush=True)
except Exception as e: print("density FAILED:",e,flush=True)
def _decode(b64): return cv2.imdecode(np.frombuffer(base64.b64decode(b64),np.uint8),cv2.IMREAD_COLOR)
def analyze(b64):
    body={"model":MODEL,"temperature":0.1,"max_tokens":300,"messages":[{"role":"user","content":[
      {"type":"text","text":PROMPT},{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+b64}}]}]}
    txt=requests.post(VLLM,json=body,timeout=45).json()["choices"][0]["message"]["content"].strip()
    for p in ("```json","```"):
        if txt.startswith(p): txt=txt[len(p):]
    txt=txt.strip().rstrip("`").strip()
    try: return json.loads(txt)
    except Exception: return {"summary":txt[:300],"safety_risk":"?"}

@app.get("/health")
def health(): return {"ok":True,"density":DENSITY_OK,"supervision":sv.__version__,"routes":["/forensics","/ingest"]}

@app.post("/forensics")
async def behavior(req: Request):
    # Offload the heavy Qwen(~4s)+density work to a threadpool so it does NOT block the
    # event loop — keeps /ingest (crowd) fast and decoupled from forensics.
    d=await req.json()
    return await run_in_threadpool(_forensics_sync, d)

def _forensics_sync(d):
    cam=d.get("camera","cam"); ts=d.get("ts") or _ts()
    b64=d["frame"]; person_boxes=d.get("person_boxes",d.get("head_boxes",[]))
    img=_decode(d.get("frame_display",b64))
    t=time.time(); res=analyze(b64); qwen_s=round(time.time()-t,2)
    dcount=None; t2=time.time()
    if DENSITY_OK:
        try: dcount,dm=density.infer(img); dcount=int(round(dcount)); img=density.heatmap(img,dm)
        except Exception as e: print("density infer fail",e,flush=True)
    den_s=round(time.time()-t2,2)
    img=draw(img, person_boxes, labels=["person"]*len(person_boxes), palette="lime")
    outdir=os.path.join("/mnt/data/forensics",_day(),cam); os.makedirs(outdir,exist_ok=True)
    fp=os.path.join(outdir,ts+".jpg"); cv2.imwrite(fp,img)
    rec={"camera":cam,"ts":ts,"density_count":dcount,"person_boxes":len(person_boxes),
         "frame_path":fp,"qwen_s":qwen_s,"density_s":den_s,"analysis":res}
    open(fp[:-4]+".json","w").write(json.dumps(rec,indent=2)); return JSONResponse(rec)

@app.post("/ingest")
async def ingest(req: Request):
    d=await req.json(); analytic=d.get("analytic","misc"); cam=d.get("camera","cam"); ts=d.get("ts") or _ts()
    boxes=d.get("boxes",[]); meta=d.get("meta",{}); alert=bool(d.get("alert",False))
    img=_decode(d["frame"])
    clean_for_frs=img.copy()  # FRS forwards an UNannotated frame: the UI crops the face from it
    explicit=[str(b[4]) for b in boxes if len(b)>4 and b[4]]
    labels=explicit if len(explicit)==len(boxes) and explicit else (["person"]*len(boxes) if analytic=="crowd" else None)
    img=draw(img, boxes, labels=labels, palette=("alert" if alert else "orange"))
    outdir=os.path.join("/mnt/data",analytic,_day(),cam); os.makedirs(outdir,exist_ok=True)
    fp=os.path.join(outdir,ts+".jpg"); cv2.imwrite(fp,img)
    if analytic=="crowd" and (time.time()-_last_lf.get(cam,0))>=LF_EVERY:
        _last_lf[cam]=time.time()
        _oklf,_blf=cv2.imencode(".jpg",img,[cv2.IMWRITE_JPEG_QUALITY,80])
        if _oklf: threading.Thread(target=forward_live_frame, args=(cam,_blf.tobytes()), daemon=True).start()
    if analytic=="crowd" and (time.time()-_last_fwd.get(cam,0))>=FWD_EVERY:
        _last_fwd[cam]=time.time()
        _ok,_buf=cv2.imencode(".jpg",img,[cv2.IMWRITE_JPEG_QUALITY,85])
        threading.Thread(target=forward_crowd, args=(cam,_buf.tobytes(),(meta or {}).get("heads",len(boxes)),(meta or {}).get("cumulative",0)), daemon=True).start()
    if analytic=="vcc" and boxes:
        # runner now sends only NEW (ByteTrack-deduped) vehicles → forward every one, no throttle
        _ok,_buf=cv2.imencode(".jpg",img,[cv2.IMWRITE_JPEG_QUALITY,85])
        threading.Thread(target=forward_vcc, args=(cam,_buf.tobytes(),boxes), daemon=True).start()
    if analytic=="frs" and boxes:
        # runner emits one consensus detection per person (track-closed) → forward every one, no throttle
        _okf,_bf=cv2.imencode(".jpg",clean_for_frs,[cv2.IMWRITE_JPEG_QUALITY,85])
        _crops=d.get("crops",[]); _embs=d.get("embs",[]); _dets=d.get("dets",[]); _ages=d.get("ages",[]); _genders=d.get("genders",[])
        _samples=(meta or {}).get("samples")
        _faces=[]
        for i,b in enumerate(boxes):
            _faces.append({"crop": base64.b64decode(_crops[i]) if i<len(_crops) else None,
                           "emb": _embs[i] if i<len(_embs) else None,
                           "det": float(_dets[i]) if i<len(_dets) else 0.9,
                           "age": (_ages[i] if i<len(_ages) else None),
                           "gender": (_genders[i] if i<len(_genders) else None),
                           "samples": _samples,
                           "bbox": [int(b[0]),int(b[1]),int(b[2]),int(b[3])]})
        threading.Thread(target=forward_frs, args=(cam,_bf.tobytes(),_faces), daemon=True).start()
    cps=[]
    for i,c in enumerate(d.get("crops",[])):
        cp=os.path.join(outdir,ts+"_crop%d.jpg"%i); cv2.imwrite(cp,_decode(c)); cps.append(cp)
    rec={"analytic":analytic,"camera":cam,"ts":ts,"frame_path":fp,"crops":cps,"boxes":len(boxes),"meta":meta}
    open(fp[:-4]+".json","w").write(json.dumps(rec,indent=2)); return JSONResponse(rec)

if __name__=="__main__":
    uvicorn.run(app,host="0.0.0.0",port=5173)
