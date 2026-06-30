#!/usr/bin/env bash
# IRIS Crowd + Observer(forensics) launcher, auto-restart loop. Source = cam_source.txt.
# crowd_runner with CROWD=1 FORENSICS=1 feeds both the Crowd dashboard and the
# IRIS Observer (Qwen) pipeline on 206.
cd /home/jetson/iris-edge || exit 1
export HOME=/home/jetson
export PYTHONPATH=/home/jetson/.local/lib/python3.10/site-packages
SRC="$(cat /home/jetson/cam_source.txt 2>/dev/null)"
export RTSP_SUB="$SRC"
export RTSP_MAIN="$SRC"
export CH="${CH:-1}"
export CROWD=1
export FORENSICS=1
export SKIP="${SKIP:-4}"
export BEH_EVERY="${BEH_EVERY:-2}"
export RUN_SECONDS=0
while true; do
  echo "[wrapper $(date +%H:%M:%S)] starting crowd+forensics src=$SRC" >> /tmp/crowdlive.log
  python3 /home/jetson/iris-edge/crowd_runner.py >> /tmp/crowdlive.log 2>&1
  echo "[wrapper $(date +%H:%M:%S)] crowd exited rc=$?, restart 3s" >> /tmp/crowdlive.log
  sleep 3
done
