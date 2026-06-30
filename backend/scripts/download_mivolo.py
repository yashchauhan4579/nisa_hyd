#!/usr/bin/env python3
"""
Download and export MiVOLO age estimation model to ONNX format.

Run this ONCE on the Jetson (inside the container or on host with torch):
    python3 scripts/download_mivolo.py

This downloads the pre-trained MiVOLO checkpoint from HuggingFace,
then exports it to ONNX for efficient inference via ONNX Runtime + TensorRT.
"""

import os
import sys
import argparse
import subprocess
import urllib.request

# MiVOLO model URLs (HuggingFace)
MIVOLO_URLS = {
    # Body-only age estimation model (no face required) — ideal for traffic CCTV
    "mivolo_d1_224": "https://huggingface.co/iitolstykh/mivolo/resolve/main/model_imdb_cross_person_4.22_99.46.pth.tar",
}

WEIGHTS_DIR = os.environ.get("WEIGHTS_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "weights"))
ONNX_OUTPUT = os.path.join(WEIGHTS_DIR, "mivolo_age.onnx")


def download_checkpoint(url: str, dest: str):
    """Download model checkpoint."""
    if os.path.exists(dest):
        print(f"Checkpoint already exists: {dest}")
        return dest

    print(f"Downloading MiVOLO checkpoint...")
    print(f"  URL: {url}")
    print(f"  Dest: {dest}")

    os.makedirs(os.path.dirname(dest), exist_ok=True)

    def progress_hook(count, block_size, total_size):
        pct = count * block_size * 100 / total_size
        sys.stdout.write(f"\r  Progress: {pct:.1f}%")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, reporthook=progress_hook)
    print(f"\n  Downloaded: {os.path.getsize(dest) / 1024**2:.1f} MB")
    return dest


def export_to_onnx(checkpoint_path: str, output_path: str, input_size: int = 224):
    """
    Export MiVOLO age model to ONNX.

    The model uses a VOLO backbone with cross-attention for age estimation.
    For body-only mode, we create a single-input ONNX graph.
    """
    import torch
    import torch.nn as nn

    print(f"\nExporting to ONNX: {output_path}")

    # Load checkpoint
    checkpoint = torch.load(checkpoint_path, map_location="cpu")

    # MiVOLO checkpoint contains 'state_dict' with model weights
    state_dict = checkpoint.get("state_dict", checkpoint)

    # Try to detect model architecture from state_dict keys
    # MiVOLO uses a custom VIT-based architecture
    has_cross_attn = any("cross" in k for k in state_dict.keys())
    print(f"  Cross-attention layers: {has_cross_attn}")
    print(f"  Total parameters: {sum(v.numel() for v in state_dict.values()) / 1e6:.1f}M")

    # Instead of reconstructing the full MiVOLO architecture (which requires
    # the mivolo package), we'll create a compatible wrapper.
    # For production, we use timm's VOLO model as the backbone.
    try:
        import timm

        # Create VOLO-D1 backbone (same as MiVOLO uses)
        backbone = timm.create_model("volo_d1_224", pretrained=False, num_classes=101)

        # Try to load matching weights (backbone only)
        # MiVOLO state_dict has keys like 'model.person_model.xxx'
        # We need to extract and remap
        new_sd = {}
        prefix_options = ["model.person_model.", "person_model.", "model.", ""]

        for prefix in prefix_options:
            matched = 0
            new_sd = {}
            for k, v in state_dict.items():
                if k.startswith(prefix):
                    new_key = k[len(prefix):]
                    if new_key in backbone.state_dict():
                        new_sd[new_key] = v
                        matched += 1
            if matched > 10:
                print(f"  Matched {matched} params with prefix '{prefix}'")
                break

        if new_sd:
            missing, unexpected = backbone.load_state_dict(new_sd, strict=False)
            print(f"  Loaded: {len(new_sd)} params, Missing: {len(missing)}, Unexpected: {len(unexpected)}")
        else:
            print("  Warning: Could not map checkpoint to VOLO backbone. Using random init.")
            print("  The model will need fine-tuning or a different checkpoint format.")

        backbone.eval()

        # Export to ONNX
        dummy_input = torch.randn(1, 3, input_size, input_size)

        torch.onnx.export(
            backbone,
            dummy_input,
            output_path,
            opset_version=17,
            input_names=["input"],
            output_names=["age_logits"],
            dynamic_axes={
                "input": {0: "batch_size"},
                "age_logits": {0: "batch_size"},
            },
        )

        print(f"  ONNX model saved: {output_path}")
        print(f"  Size: {os.path.getsize(output_path) / 1024**2:.1f} MB")

        # Verify ONNX model
        import onnx
        model = onnx.load(output_path)
        onnx.checker.check_model(model)
        print("  ONNX model verified OK")

    except ImportError as e:
        print(f"\n  Error: Missing dependency: {e}")
        print("  Install with: pip3 install timm onnx")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Download and export MiVOLO to ONNX")
    parser.add_argument("--model", default="mivolo_d1_224", choices=MIVOLO_URLS.keys())
    parser.add_argument("--output", default=ONNX_OUTPUT)
    parser.add_argument("--skip-download", action="store_true", help="Skip download, use existing checkpoint")
    args = parser.parse_args()

    os.makedirs(WEIGHTS_DIR, exist_ok=True)

    # Step 1: Download
    checkpoint_name = os.path.basename(MIVOLO_URLS[args.model])
    checkpoint_path = os.path.join(WEIGHTS_DIR, checkpoint_name)

    if not args.skip_download:
        download_checkpoint(MIVOLO_URLS[args.model], checkpoint_path)

    # Step 2: Export to ONNX
    export_to_onnx(checkpoint_path, args.output)

    print(f"\n✅ MiVOLO ONNX model ready: {args.output}")
    print(f"   Place in weights/ directory and restart the container.")


if __name__ == "__main__":
    main()
