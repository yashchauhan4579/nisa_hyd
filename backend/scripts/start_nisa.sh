#!/usr/bin/env bash
# NISA frontend launcher (vite dev on :1112, proxying to 206/221).
cd /home/jetson/nisa-frontend || exit 1
export PATH=/home/jetson/node20:$PATH
export HOME=/home/jetson
exec /home/jetson/node20/node node_modules/vite/bin/vite.js preview --host 0.0.0.0 --port 1112 >/tmp/nisa-vite.log 2>&1
