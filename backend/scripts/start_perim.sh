#!/usr/bin/env bash
# IRIS Perimeter live-inference launcher. Source = /home/jetson/cam_source.txt
# (RTSP for a real camera; falls back to looped recording). Plug-and-play:
# change cam_source.txt and restart the tmux session.
cd /home/jetson/perimeter-live || exit 1
export HOME=/home/jetson
export PYTHONPATH=/home/jetson/.local/lib/python3.10/site-packages
export VIDEO_SOURCE="$(cat /home/jetson/cam_source.txt 2>/dev/null || echo /home/jetson/iris-edge/recordings/ch3_2026-06-10_1000-1010_IST.mp4)"
exec python3 /home/jetson/perimeter-live/perimeter_service.py >/tmp/perim.log 2>&1
