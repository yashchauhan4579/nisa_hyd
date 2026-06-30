#!/usr/bin/env bash
# VMS self-heal (node 219): ensure cam13/14/15/16 paths exist + always-on on MediaMTX.
API="http://127.0.0.1:9997"
NVR="rtsp://admin:REDACTED@10.10.9.254:554/cam/realmonitor"
NAMES="cam13 cam14 cam15 cam16"
src_for() { ch="${1#cam}"; echo "$NVR?channel=$ch&subtype=1"; }
while true; do
  for n in $NAMES; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API/v3/paths/get/$n")
    if [ "$code" != "200" ]; then
      curl -s -o /dev/null -X POST "$API/v3/config/paths/add/$n" -H "Content-Type: application/json" \
        -d "{\"source\":\"$(src_for "$n")\",\"sourceOnDemand\":false}"
      echo "[$(date +%F\ %H:%M:%S)] re-added $n (was $code)"
    fi
  done
  sleep 30
done
