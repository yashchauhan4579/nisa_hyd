#!/usr/bin/env python3
"""
Export YOLO models to TensorRT for optimized inference.
This script converts .pt models to .engine format using Ultralytics' built-in TensorRT export.
"""

import os
import sys
from pathlib import Path
from ultralytics import YOLO

# Model paths
MODELS = {
    
    'vcc': 'weights/Vcc_best.pt',
    'helmet': 'weights/best_small.pt',
}

def export_to_tensorrt(model_path, force=False):
    """
    Export a YOLO model to TensorRT format.
    
    Args:
        model_path: Path to .pt model file
        force: Force re-export even if .engine exists
    """
    model_path = Path(model_path)
    engine_path = model_path.with_suffix('.engine')
    
    if not model_path.exists():
        print(f"❌ Model not found: {model_path}")
        return False
    
    if engine_path.exists() and not force:
        print(f"⏭️  TensorRT engine already exists: {engine_path}")
        return True
    
    try:
        print(f"\n🚀 Exporting {model_path.name} to TensorRT...")
        print(f"   Source: {model_path}")
        print(f"   Target: {engine_path}")
        
        # Load PyTorch model
        model = YOLO(str(model_path))
        
        # Export to TensorRT
        # Parameters:
        # - half=True: Use FP16 precision for 2x speedup (if GPU supports it)
        # - device=0: Use GPU 0
        # - workspace=4: 4GB workspace for optimization
        # - verbose=True: Show export progress
        model.export(
            format='engine',
            half=True,  # FP16 for speed
            device=0,   # GPU 0
            workspace=4,  # 4GB workspace
            simplify=True,  # Simplify ONNX graph
            verbose=True
        )
        
        if engine_path.exists():
            size_mb = engine_path.stat().st_size / (1024 * 1024)
            print(f"✅ Successfully exported to TensorRT!")
            print(f"   Engine size: {size_mb:.2f} MB")
            return True
        else:
            print(f"❌ Export failed - engine file not created")
            return False
            
    except Exception as e:
        print(f"❌ Export failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

def verify_engine(engine_path):
    """
    Verify TensorRT engine by running test inference.
    """
    import numpy as np
    import cv2
    
    try:
        print(f"\n🔍 Verifying engine: {engine_path}")
        
        # Load engine
        model = YOLO(str(engine_path))
        
        # Create dummy input (640x640 RGB image)
        dummy_img = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
        
        # Run inference
        results = model(dummy_img, verbose=False)
        
        print(f"✅ Engine verification passed!")
        print(f"   Output shape: {len(results[0].boxes)} detections")
        return True
        
    except Exception as e:
        print(f"❌ Engine verification failed: {e}")
        return False

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Export YOLO models to TensorRT')
    parser.add_argument('--force', action='store_true', help='Force re-export even if engine exists')
    parser.add_argument('--verify', action='store_true', help='Verify engines after export')
    parser.add_argument('--model', type=str, help='Export specific model only (violation, vcc, helmet, seatbelt)')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("YOLO to TensorRT Export Utility")
    print("=" * 60)
    
    # Filter models if specific one requested
    models_to_export = MODELS
    if args.model:
        if args.model in MODELS:
            models_to_export = {args.model: MODELS[args.model]}
        else:
            print(f"❌ Unknown model: {args.model}")
            print(f"   Available: {', '.join(MODELS.keys())}")
            return 1
    
    # Export models
    results = {}
    for name, path in models_to_export.items():
        print(f"\n{'='*60}")
        print(f"Model: {name}")
        print(f"{'='*60}")
        success = export_to_tensorrt(path, force=args.force)
        results[name] = success
        
        # Verify if requested
        if success and args.verify:
            engine_path = Path(path).with_suffix('.engine')
            verify_engine(engine_path)
    
    # Summary
    print("\n" + "=" * 60)
    print("EXPORT SUMMARY")
    print("=" * 60)
    for name, success in results.items():
        status = "✅ Success" if success else "❌ Failed"
        print(f"{name:15s}: {status}")
    
    # Return exit code
    all_success = all(results.values())
    return 0 if all_success else 1

if __name__ == "__main__":
    sys.exit(main())
