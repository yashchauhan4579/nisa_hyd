#!/bin/bash
# Jetson Performance Optimization Script
# Based on Ultralytics official recommendations

echo "🚀 Optimizing Jetson for Maximum Performance"
echo "============================================"

# 1. Enable MAX Power Mode
echo "📊 Setting MAX Power Mode..."
sudo nvpmodel -m 0
echo "✅ MAX Power Mode enabled (all CPU/GPU cores ON)"

# 2. Enable Jetson Clocks
echo "⚡ Enabling Jetson Clocks..."
sudo jetson_clocks
echo "✅ Jetson Clocks enabled (max frequency)"

# 3. Install Jetson Stats (if not installed)
echo "📈 Installing Jetson Stats..."
if ! command -v jtop &> /dev/null; then
    sudo apt update
    sudo pip install jetson-stats
    echo "✅ Jetson Stats installed"
    echo "⚠️  Reboot required to use 'jtop' command"
else
    echo "✅ Jetson Stats already installed"
fi

echo ""
echo "============================================"
echo "✅ Jetson Optimization Complete!"
echo "============================================"
echo ""
echo "📋 Next Steps:"
echo "1. Run 'jtop' to monitor system performance"
echo "2. Convert models to TensorRT: python3 scripts/export_to_tensorrt.py"
echo "3. Test performance: python3 scripts/test_tensorrt.py"
echo ""
echo "💡 TIP: Keep 'jtop' running to monitor GPU/CPU usage during inference"
