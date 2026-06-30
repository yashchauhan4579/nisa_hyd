#!/bin/bash
set -e

echo "🚀 Starting Violation Pipeline Container..."

# Check CUDA availability
echo "🔍 Checking CUDA availability..."
python3 -c "import torch; print(f'CUDA Available: {torch.cuda.is_available()}'); print(f'CUDA Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"

# Create necessary directories
echo "📁 Creating output directories..."
mkdir -p /app/output /app/uploads /app/data
mkdir -p /app/output/helmet /app/output/triple_riding /app/output/speed /app/output/wrong_side

# Check model weights
echo "🔍 Checking model weights..."
if [ ! -f "/app/weights/Vcc_best.pt" ]; then
    echo "⚠️  Warning: Vcc_best.pt not found in /app/weights/"
fi
if [ ! -f "/app/weights/violation.pt" ]; then
    echo "⚠️  Warning: violation.pt not found in /app/weights/"
fi
if [ ! -f "/app/weights/stage_2.pth" ]; then
    echo "⚠️  Warning: stage_2.pth (CRNN) not found in /app/weights/"
fi

# Set permissions
chmod -R 755 /app/output

echo "✅ Initialization complete!"

# Start mode selection
# Start mode selection
if [ "$RUN_MODE" = "worker" ]; then
    # Worker Mode
    echo "👷 Starting Violation Worker (AI Processing)..."
    exec python3 violation_pipeline/violation_worker.py
elif [ "$RUN_MODE" = "api" ]; then
    # API Server mode
    echo "🌐 Starting API Server on port 8001..."
    echo "   Add cameras via: POST /api/cameras {name, rtsp_url}"
    exec python3 -m violation_pipeline.api_server
elif [ -n "$RTSP_URL" ]; then
    # Direct RTSP mode (legacy)
    echo "📹 Starting RTSP stream processing..."
    echo "   Camera ID: ${CAMERA_ID:-1}"
    echo "   RTSP URL: $RTSP_URL"
    exec python3 /app/violation_pipeline/run.py --source "$RTSP_URL" --camera-id "${CAMERA_ID:-1}"
else
    # Default to API if nothing specified
    echo "🌐 No mode specified. Defaulting to API Server..."
    exec python3 -m violation_pipeline.api_server
fi
