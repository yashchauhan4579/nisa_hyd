#!/usr/bin/env bash
# IRIS ANPR/ITMS AI worker. Processes cameras added via the API (plug-and-play).
cd /home/jetson/Violation_Analytics || exit 1
export DB_PATH=/home/jetson/Violation_Analytics/data/violation_pipeline.db
export CENTRAL_SERVER_ENABLED=false
export PYTHONUNBUFFERED=1
export PYTHONPATH=/home/jetson/trt107/py
export LD_LIBRARY_PATH=/home/jetson/trt107/lib:${LD_LIBRARY_PATH}
exec /home/jetson/anpr-venv/bin/python violation_pipeline/violation_worker.py
