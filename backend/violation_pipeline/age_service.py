"""Age Classification Sidecar Service — open-age-detection (SigLIP2)."""
import os, time, logging, numpy as np, cv2
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("AgeService")

app = FastAPI(title="Age Classification Service")
_estimator = None
_last_error = None
AGE_SERVICE_PORT = int(os.environ.get("AGE_SERVICE_PORT", "5050"))

def get_estimator():
    global _estimator, _last_error
    if _estimator is None:
        from violation_pipeline.src.core.age_estimator import AgeEstimator
        try:
            _estimator = AgeEstimator(device="cuda")
            _last_error = None
            logger.info("Age classifier loaded")
        except Exception as e:
            _last_error = str(e)
            raise
    return _estimator

@app.on_event("startup")
async def startup():
    try:
        get_estimator()
        logger.info(f"Age service ready on port {AGE_SERVICE_PORT}")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")

@app.post("/estimate-age")
async def estimate_age(request: Request):
    try:
        estimator = get_estimator()
        contents = await request.body()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image"})
        start = time.time()
        result = estimator.classify(img)
        elapsed = (time.time() - start) * 1000
        if result is None:
            return JSONResponse(status_code=500, content={"error": "Classification failed"})
        return {
            "is_minor": result["is_minor"],
            "minor_prob": round(result["minor_prob"], 3),
            "child_prob": round(result["child_prob"], 3),
            "teen_prob": round(result["teen_prob"], 3),
            "adult_prob": round(result["adult_prob"], 3),
            "label": result["label"],
            "confidence": round(result["confidence"], 3),
            "inference_ms": round(elapsed, 1),
        }
    except Exception as e:
        logger.error(f"Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/health")
async def health():
    return {
        "status": "ok" if _estimator is not None else "loading",
        "model_loaded": _estimator is not None,
        "last_error": _last_error,
    }

if __name__ == "__main__":
    uvicorn.run("violation_pipeline.age_service:app", host="0.0.0.0", port=AGE_SERVICE_PORT, workers=1, log_level="info")
