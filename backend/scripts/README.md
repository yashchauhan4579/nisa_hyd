# TensorRT Optimization - Quick Start Guide

## Phase 1: Export Models to TensorRT

### Step 1: Run Export Script (Inside Docker)
```bash
# Enter the violation-worker container
sudo docker exec -it violation-worker bash

# Run export script
cd /app
python3 scripts/export_to_tensorrt.py
```

**Expected output:**
```
✅ Traffic Detection exported to: weights/Vcc_best.engine
✅ Violation Detection exported to: weights/violation.engine
✅ OCR CRNN exported to: weights/ocr_crnn.onnx
```

### Step 2: Test Performance
```bash
# Inside Docker container
python3 scripts/test_tensorrt.py
```

**Expected results:**
- Traffic: 15ms → 3-5ms (3-5x faster)
- Violation: 15ms → 3-5ms (3-5x faster)

### Step 3: Verify Accuracy
Check that TensorRT models detect same objects as PyTorch models.

---

## Phase 2: Update Pipeline to Use TensorRT

The pipeline will automatically use `.engine` files if they exist.

## Phase 3: Multi-Camera Setup

See `implementation_plan.md` for docker-compose multi-camera configuration.

---

## Troubleshooting

**Export fails?**
- Ensure you're inside Docker container
- Check CUDA is available
- Verify model files exist in `weights/`

**Low speedup?**
- Ensure FP16 is enabled
- Check GPU utilization with `nvidia-smi`
- Verify TensorRT version

**Accuracy issues?**
- Compare detections side-by-side
- Consider using FP32 instead of FP16
- Calibrate with INT8

---

## Quick Test Command

```bash
# Single command to test everything
sudo docker exec -it violation-worker python3 /app/scripts/export_to_tensorrt.py
```
