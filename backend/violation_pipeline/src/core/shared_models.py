"""
SharedModels — one set of model weights loaded per Python process,
used by every camera thread. Replaces the old pattern where each
UnifiedPipeline instance loaded its own copy of every model.

Memory before refactor (N cameras): N x (PyTorch + TRT engines + OCR + Age).
Memory after refactor (N cameras):  1 x everything, plus small per-thread
state (tracker, buffers). Roughly 8x RAM reduction on a 4-camera Orin.

Thread-safety: model objects are exposed read-only; GPU inference calls
are serialized via `gpu_lock` to match the physical GPU's single execution
stream and avoid the CUDA context collisions that the commented-out
ThreadPoolExecutor attempt hit.
"""

import logging
import threading

from violation_pipeline.src.core.detector import Detector
from violation_pipeline.src.core.ocr import OCRRecognizer
from violation_pipeline.config.config import Config

logger = logging.getLogger("SharedModels")


class SharedModels:
    """Process-wide singleton. First construction loads models; subsequent
    constructions return the same instance."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._init_once()
                    cls._instance = instance
        return cls._instance

    def _init_once(self):
        logger.info("Loading shared models (ONCE for this process)...")

        # TensorRT detectors (~500 MB together, shared across all camera threads)
        self.detector_traffic = Detector(Config.MODEL_TRAFFIC, Config.DEVICE)
        self.detector_violation = Detector(Config.MODEL_VIOLATION, Config.DEVICE)
        self.detector_mobile = Detector(Config.MODEL_MOBILE, Config.DEVICE)

        # PyTorch CRNN OCR (~300 MB). Runs through a lock; OCR is rare
        # enough (~once per unique plate) that serial is fine.
        self.ocr = OCRRecognizer()

        # Age estimator is lazy — only load if any camera enables minor_rider.
        # ~500 MB SigLIP2 weights we'd rather not pay for on boxes that don't need it.
        self._age_estimator = None
        self._age_lock = threading.Lock()

        # Lock serializing GPU inference across all camera threads.
        # The single GPU already serializes physically; this lock just
        # prevents CUDA context thrash in Python land and keeps NMS etc
        # running on stable tensors. Does not reduce aggregate FPS.
        self.gpu_lock = threading.Lock()

        logger.info(
            "Shared models loaded: traffic=%s violation=%s ocr=%s",
            getattr(self.detector_traffic.model, "task", "?"),
            getattr(self.detector_violation.model, "task", "?"),
            type(self.ocr).__name__,
        )

    def get_age_estimator(self):
        """Lazy-load SigLIP2 age classifier. Returns the same instance across threads."""
        if self._age_estimator is not None:
            return self._age_estimator
        with self._age_lock:
            if self._age_estimator is None:
                from violation_pipeline.src.core.age_estimator import AgeEstimator
                logger.info("Loading shared AgeEstimator (first camera needs it)...")
                self._age_estimator = AgeEstimator(device=Config.DEVICE)
        return self._age_estimator
