#!/usr/bin/env bash
# IRIS ANPR/ITMS API (ported from 220). Self-contained on 219. Port 8003.
cd /home/jetson/Violation_Analytics || exit 1
export DB_PATH=/home/jetson/Violation_Analytics/data/violation_pipeline.db
export CENTRAL_SERVER_ENABLED=false
export OUTPUT_DIR=/home/jetson/Violation_Analytics/output
export PYTHONUNBUFFERED=1
export PYTHONPATH=/home/jetson/trt107/py
export LD_LIBRARY_PATH=/home/jetson/trt107/lib:${LD_LIBRARY_PATH}
exec /home/jetson/anpr-venv/bin/python -m violation_pipeline.api_server
