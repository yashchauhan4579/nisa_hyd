#!/usr/bin/env bash
# IRIS FRS launcher (CUDA EP / GPU), auto-restart loop. Source = cam_source.txt.
cd /home/jetson/iris-edge || exit 1
export HOME=/home/jetson
export PYTHONPATH=/home/jetson/.local/lib/python3.10/site-packages
export FRS_SOURCE="$(cat /home/jetson/cam_source.txt 2>/dev/null || echo /home/jetson/iris-edge/recordings/ch3_2026-06-10_1000-1010_IST.mp4)"
export SKIP="${SKIP:-3}"
while true; do
  echo "[wrapper $(date +%H:%M:%S)] starting frs (CUDA EP) src=$FRS_SOURCE" >> /tmp/frs.log
  python3 /home/jetson/iris-edge/frs_runner.py >> /tmp/frs.log 2>&1
  echo "[wrapper $(date +%H:%M:%S)] frs exited rc=$?, restart 3s" >> /tmp/frs.log
  sleep 3
done
