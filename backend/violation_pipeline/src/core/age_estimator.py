"""
Age Group Classifier — uses open-age-detection (SigLIP2) for minor rider detection.
Works on full body crops (no face required). 98.6% recall on children.
Classes: Child 0-12, Teenager 13-20, Adult 21-44, Middle Age 45-64, Aged 65+
"""
import os
import cv2
import numpy as np
import logging
import torch
from PIL import Image

logger = logging.getLogger("AgeEstimator")

CHILD_LABEL = "Child 0-12"
TEEN_LABEL = "Teenager 13-20"
ADULT_LABELS = {"Adult 21-44", "Middle Age 45-64", "Aged 65+"}
MINOR_LABELS = {CHILD_LABEL, TEEN_LABEL}


class AgeEstimator:
    def __init__(self, model_path: str = None, device: str = "cuda"):
        self.device = device
        self.model = None
        self.processor = None
        self.labels = None
        self._load_model()

    def _load_model(self):
        logger.info("Loading open-age-detection (SigLIP2) model...")
        from transformers import AutoImageProcessor, AutoModelForImageClassification

        model_name = "prithivMLmods/open-age-detection"
        self.processor = AutoImageProcessor.from_pretrained(model_name, use_fast=False)
        self.model = AutoModelForImageClassification.from_pretrained(model_name)
        self.model = self.model.to(self.device).half().eval()
        self.labels = self.model.config.id2label
        logger.info(f"open-age-detection loaded. Classes: {list(self.labels.values())}")

    def classify(self, body_crop: np.ndarray) -> dict:
        """
        Full classification result with probabilities.
        
        Returns: {
            "label": str, "confidence": float,
            "is_minor": bool, "minor_prob": float,
        }
        """
        if body_crop is None or body_crop.size == 0:
            return None
        try:
            # Convert BGR to RGB PIL Image
            img_rgb = cv2.cvtColor(body_crop, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(img_rgb)

            inputs = self.processor(images=pil_img, return_tensors="pt")
            inputs = {k: v.to(self.device).half() for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model(**inputs)

            probs = torch.softmax(outputs.logits.float(), dim=-1)[0]

            # Build results
            all_probs = {self.labels[i]: probs[i].item() for i in range(len(self.labels))}
            predicted_label = self.labels[probs.argmax().item()]
            confidence = probs.max().item()

            child_prob = all_probs.get(CHILD_LABEL, 0.0)
            teen_prob = all_probs.get(TEEN_LABEL, 0.0)
            adult_prob = sum(all_probs.get(label, 0.0) for label in ADULT_LABELS)
            minor_prob = child_prob + teen_prob

            # Treat child+teen as the underage signal for minor-rider detection.
            is_minor = minor_prob >= 0.5

            return {
                "label": predicted_label,
                "confidence": confidence,
                "is_minor": is_minor,
                "minor_prob": minor_prob,
                "child_prob": child_prob,
                "teen_prob": teen_prob,
                "adult_prob": adult_prob,
            }
        except Exception as e:
            logger.error(f"Age classification failed: {e}")
            return None
