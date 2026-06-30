"""Age Classification Client — sends rider crops to the age service."""
import os, cv2, time, logging, requests
import numpy as np

logger = logging.getLogger("AgeClient")
AGE_SERVICE_URL = os.environ.get("AGE_SERVICE_URL", "http://localhost:5050")


class AgeClient:
    def __init__(self, service_url: str = None):
        self.service_url = service_url or AGE_SERVICE_URL
        self._available = None
        self._last_check = 0
        self._check_interval = 30

    def is_available(self) -> bool:
        now = time.time()
        if self._available is not None and (now - self._last_check) < self._check_interval:
            return self._available
        try:
            resp = requests.get(f"{self.service_url}/health", timeout=2)
            self._available = resp.status_code == 200
        except Exception:
            self._available = False
        self._last_check = now
        return self._available

    def classify(self, body_crop: np.ndarray, face_crop=None) -> dict:
        if not self.is_available():
            return None
        try:
            ok, buf = cv2.imencode(".jpg", body_crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok:
                return None
            resp = requests.post(
                f"{self.service_url}/estimate-age",
                data=buf.tobytes(),
                headers={"Content-Type": "image/jpeg"},
                timeout=5,
            )
            if resp.status_code == 200:
                return resp.json()
            return None
        except Exception as e:
            logger.error(f"Age client error: {e}")
            self._available = False
            return None
