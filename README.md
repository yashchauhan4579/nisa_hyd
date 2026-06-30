# IRIS @ NISA — Hyderabad

AI video-intelligence platform deployed for **NISA**, built by **WiredLeap**.
**IRIS** is the product/platform; this repo holds the operator dashboard plus the
backend service for every module. It runs on-premise on a compact **MagicBox**
edge node (Jetson Orin) — no cloud, no data egress.

> Live operator UI: `http://10.10.0.219:1112/`

## Modules

| Module | What it does | Backend (this repo) | Host · Port | UI route |
|--------|--------------|---------------------|-------------|----------|
| **Crowd** | People counting, density & footfall | `backend/edge/crowd_runner.py` | 219 → 206 | `/analytics/crowd` |
| **FRS** | Face detection, recognition, watchlist | `backend/edge/frs_runner.py` | 219 → 206 | `/analytics/frs` |
| **IRIS Observer** | Vision-language behavioural / risk reads (Qwen2.5-VL) | `backend/observer/` | 206 · 8080 | `/forensics` |
| **Perimeter** | ROI intrusion detection + auto event clips | `backend/perimeter/perimeter_service.py` | 219 · 7300 | `/perimeter` |
| **VMS** | Unified multi-NVR live wall, self-healing | `backend/vms/` + MediaMTX | 219/221 · 8888 | `/vms/liveview` |
| **ITMS · ANPR/VCC** | Number-plate recognition + vehicle counts | `backend/` (violation_pipeline) | 219 · 8003 | `/itms/anpr-vcc` |

## Architecture

```
        NISA NVRs (RTSP)                 MagicBox edge node (Jetson Orin · 219)
   10.10.9.254 / 10.10.10.19   ──▶   Crowd · FRS · Perimeter · ANPR/VCC · VMS
                                              │                 │
                                              ▼                 ▼
                                   IRIS dashboard (:1112)   on-site reasoning
                                   (this repo, Vite/React)   server (206): IRIS
                                                             Observer / Qwen2.5-VL
```

The dashboard is a thin client; each module is its own service, reached through
Vite proxies (see `vite.config.ts`): `/api`→206, `/forensicsapi`→206:8080,
`/perimeterapi`→219:7300, `/itmsapi`→219:8003, `/hls219` `/hls221`→MediaMTX.

## Run the dashboard (frontend)

```sh
npm install
npm run dev          # dev server on :1112
# or
npm run build && npm run preview   # production build, served on :1112
```

## Run the backends

Each module runs as its own process under a tmux session via the launch scripts
in `backend/scripts/` (`start_nisa.sh`, `start_perim.sh`, `start_frs.sh`,
`start_crowd.sh`, `start_anpr_api.sh`, `start_anpr_worker.sh`). tmux sessions:
`nisa · perim · frslive · crowdlive · anprapi · anprworker · vmsheal`.

The **ANPR/VCC** engine is fully self-contained on 219 — see
[`backend/ANPR_DEPLOY.md`](backend/ANPR_DEPLOY.md) for the venv setup, the
TensorRT-10.7 runtime trick, and the model-weights layout. Module map:
[`backend/MODULES.md`](backend/MODULES.md).

## Not in this repo (by design)

- **Model weights / engines** (`*.pt`, `*.engine`, `*.pth`, ~207 MB) — binaries,
  not source. Place them in `backend/weights/` (see `ANPR_DEPLOY.md`).
- `node_modules`, `dist`, runtime DB / clips / recordings.
- **Secrets are redacted** — RTSP/NVR credentials, central-server `AUTH_TOKEN`
  and JWT `SECRET_KEY` appear as `REDACTED`. Supply your own when deploying.

## Stack

React 19 + TypeScript + Vite · FastAPI · SQLite · YOLOv8 · InsightFace ·
ByteTrack · CRNN OCR (TensorRT) · Qwen2.5-VL · MediaMTX · Jetson Orin (ARM64).

---
© WiredLeap · IRIS — deployed for NISA. On-premise; no cloud dependency.
