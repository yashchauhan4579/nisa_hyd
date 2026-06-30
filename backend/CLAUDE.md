# CLAUDE.md — Violation Analytics

Deployment-aware notes for Claude Code (claude.ai/code) when working in this
directory. Pair with [`README.md`](README.md) and [`INSTALL.md`](INSTALL.md)
for prose deployment guides.

## What this is

A self-contained traffic-violation detection platform: YOLO + CRNN + MiVOLO
(age estimation) inference behind a FastAPI server, fronted by a React/Vite
dashboard, packaged as two Docker services. Designed for edge deployment on
Jetson Orin and laptops/x86 servers (same compose, different `Dockerfile`
base image). Reports violations to a central server.

**Independent of the Rust ITMS pipeline** in `../rust_anpr_violation/`. Uses
different models (`Vcc_best.pt`, `best_small.pt` vs `new_v1.onnx`), different
deployment story. Both can coexist on the same host but they share nothing
except optionally the same central-server endpoint.

## Architecture (from `docker-compose.yml`)

| Service | Container | Where | Port | Role |
|---|---|---|---:|---|
| **API Server** | `violation-pipeline` (Docker) | `RUN_MODE=api` | `8001` | FastAPI: camera CRUD, violations, MJPEG, JWT auth |
| **AI Worker** | `violation-worker` (Docker) | `RUN_MODE=worker` | – | Headless inference loop; polls DB for active cameras |
| **Frontend** | `violation-frontend` (PM2 / Vite) | host | `5173` | React 19 dashboard |
| **DB** | SQLite at `/app/data/violation_pipeline.db` | host volume | – | Cameras, violations, fines, users |

Both Docker services use `network_mode: host`, share the same image, and
gate behaviour on `RUN_MODE` (`docker-entrypoint.sh`). Legacy
`RTSP_URL` env var still triggers a direct-stream mode that bypasses the DB.

## Top-level layout

```
Violation_Analytics/
├── docker-compose.yml + Dockerfile + docker-entrypoint.sh
├── violation_pipeline/         ← Python package (the API + worker live here)
│   ├── api_server.py             FastAPI app — endpoints listed below
│   ├── violation_worker.py       headless DB-polling worker
│   ├── pipeline.py               UnifiedPipeline (detector→tracker→OCR→violations)
│   ├── run.py                    direct-stream entry (called when RTSP_URL set)
│   ├── database.py               SQLAlchemy models
│   ├── central_server_client.py  POST violations to CENTRAL_SERVER_URL
│   ├── age_service.py            MiVOLO minor-rider classifier
│   ├── web_viewer.py + verify_radar_fusion.py  diagnostics
│   ├── config/config.py          Config dataclass — single source of tuning
│   └── src/{core,logic,results_io,utils}/  detector, tracker, ocr, violation
│                                            consensus, visualizer, savers
├── frontend/                   ← React 19 + Vite 7 + Tailwind 4 + Recharts
├── weights/                    ← Vcc_best.{pt,engine}, best_small.{pt,engine},
│                                 stage_2.pth, new_st2.pth
├── scripts/
│   ├── download_mivolo.py        fetch MiVOLO weights from HuggingFace
│   ├── optimize_jetson.sh        nvpmodel + jetson_clocks tuning
│   └── sync_violations.py        bulk-push violations to central server
├── radar_calibration.json + radar_interface.py + radar_camera_fusion.py
├── export_yolo_to_tensorrt.py    one-shot YOLO .pt → .engine builder
├── run.py / run_anpr_vcc.py      CLI demo runners (outside Docker)
├── update_camera_violations.py   one-off DB migration helper
├── INSTALL.md / README.md
├── server.pid                    pid file written by some entry (do not commit)
└── debug_output/                 test snapshots (gitignored, safe to wipe)
```

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Inference | PyTorch + Ultralytics YOLO + TensorRT (`.engine` auto-built from `.pt`) | `Detector` falls back to `.pt` if `.engine` missing |
| OCR | CRNN (PyTorch) | input 192×48, 36 classes, see `Config.CRNN_*` |
| Age (minor riders) | MiVOLO via `age_service.py` / `age_client.py` | weights NOT in git — run `scripts/download_mivolo.py` first |
| Tracking | `supervision` ByteTrack (in `src/core/tracker.py`) | per-class trackers |
| Web API | FastAPI + uvicorn + JWT (passlib OAuth2) | port 8001 |
| Persistence | SQLAlchemy + SQLite | DB path from `DB_PATH` env (default `/app/data/violation_pipeline.db`) |
| Frontend | React 19 + Vite 7 + Tailwind 4 + Recharts + jsPDF + axios | `package.json` |
| Container | `ultralytics/ultralytics:latest` (x86) or `…-jetson-jetpack6` (ARM64) | base swap is in `Dockerfile`, not env |
| Process supervision | Docker for backend, PM2 for frontend | frontend `pm2 start npm --name violation-frontend -- run dev` |

## API surface (from `violation_pipeline/api_server.py`)

```
POST   /login                            JWT issue (OAuth2PasswordRequestForm)
GET    /me                               current user

GET    /health                           liveness
GET    /uptime                           process uptime
GET    /api/counts                       summary counters (cameras, violations, etc.)

GET    /api/cameras                      list (CameraResponse)
POST   /api/cameras                      add — {name, rtsp_url, …}
PATCH  /api/cameras/{camera_id}          edit
DELETE /api/cameras/{camera_id}          remove
POST   /api/cameras/{camera_id}/start    flag active (worker picks up)
POST   /api/cameras/{camera_id}/stop     flag inactive
GET    /api/cameras/{camera_id}/frame    last MJPEG frame snapshot

GET    /api/violations                   list with filters
PATCH  /api/violations/{violation_id}    edit (e.g. confirm/dismiss)
GET    /api/violations/stats             aggregations for dashboard charts
GET    /api/fines                        derived from violations

GET    /stream/{camera_id}               MJPEG live stream
```

Cite the line numbers via `grep -n "^@app\." violation_pipeline/api_server.py`
when extending — they're stable handles for diff-friendly edits.

## Models on disk (`weights/`)

| File | Size | Purpose |
|---|---:|---|
| `Vcc_best.pt` / `Vcc_best.engine` | ~19 MB | Traffic / vehicle classification (auto, bus, car, motorcycle, truck, plate) |
| `best_small.pt` / `best_small.engine` | ~22 MB | Violation classes — `0:rider, 1:with_helmet, 2:without_helmet, 3:person-seatbelt, 4:person-noseatbelt` |
| `stage_2.pth` | ~33 MB | CRNN OCR for plates |
| `new_st2.pth` | ~33 MB | Secondary OCR fallback |

`.engine` files are GPU+TRT-version-specific. The `Detector` class auto-falls
back to `.pt` if `.engine` is missing; first-run on a new host generates the
engines via `export_yolo_to_tensorrt.py`. Don't copy `.engine` between
Jetson and x86, or between different Jetson SoCs.

**Stale reference**: `docker-entrypoint.sh` checks for `violation.pt` which
doesn't exist — the actual file is `best_small.pt`. The warning is harmless
but worth fixing if you touch that script.

## Configuration (`violation_pipeline/config/config.py`)

Everything tuneable lives in the `Config` class. Key knobs:

```python
WEIGHTS_DIR = "/app/weights" or <repo>/weights      # auto-detected
MODEL_TRAFFIC   = WEIGHTS_DIR/Vcc_best.engine
MODEL_VIOLATION = WEIGHTS_DIR/best_small.engine
MODEL_OCR       = WEIGHTS_DIR/stage_2.pth

CONF_TRAFFIC_DEFAULT = 0.30
CONF_PLATE = 0.45
CONF_RIDER = 0.30
CONF_HELMET = 0.50; CONF_NO_HELMET = 0.53
CONF_SEATBELT = 0.65    # high to suppress false positives

ENABLED_VIOLATIONS = ['helmet','triple_riding','speed','wrong_side','seatbelt']
ENABLED_DETECTION_MODES = ['vcc','anpr','violation']

# Speed (radar)
SPEED_LIMIT = 40.0       # km/h
RADAR_IP = "192.168.150.12"; RADAR_PORT = 50000
RADAR_ENABLED = True

# ANPR throttling
ANPR_DEDUPE_WINDOW = 300        # seconds — same plate not re-sent within window
ANPR_MIN_PLATE_CONFIDENCE = 0.45
VCC_SEND_INTERVAL_FRAMES = 30   # send VCC summary every ~5 sec @ 6 fps

# Tracking + association
MIN_DETECTION_FRAMES = 5
MAX_FRAME_GAP = 30
MAX_PLATE_DISTANCE = 50         # tightened from 100 for crowded scenes

# Snapshot quality
BLUR_THRESHOLD = 100.0          # Laplacian variance
MIN_SNAPSHOT_QUALITY = 0.3

# RTSP
RECONNECT_DELAY = 5
STREAM_BUFFER_SIZE = 3
FRAME_SKIP = 0                  # set > 0 on Jetson if input > 25 fps
```

Per-camera config (RTSP URL, name, geofence, etc.) lives in the SQLite DB
and is managed via the `/api/cameras` endpoints.

## Environment variables (from `docker-compose.yml`)

| Var | Default | Purpose |
|---|---|---|
| `RUN_MODE` | `api` | `api` / `worker` / unset+`RTSP_URL` for legacy direct mode |
| `RTSP_URL` | – | Triggers legacy direct-stream entry in entrypoint |
| `CAMERA_ID` | `1` | Used only with `RTSP_URL` |
| `DB_PATH` | `/app/data/violation_pipeline.db` | SQLite location |
| `CENTRAL_SERVER_URL` | `http://10.10.0.135:3001` | Where violations are POSTed |
| `CENTRAL_SERVER_ENABLED` | `true` | Toggle central-server reporting |
| `NVIDIA_VISIBLE_DEVICES` | `all` | GPU passthrough |
| `CUDA_VISIBLE_DEVICES` | `0` | Pin to first GPU |
| `TZ` | `Asia/Kolkata` | Timestamps in violations |

## Common operations

| Goal | Command |
|---|---|
| Build + start backend | `sudo docker-compose up -d --build` |
| Stop backend | `sudo docker-compose down` |
| Tail API logs | `sudo docker logs -f violation-pipeline` |
| Tail worker logs (FPS, model perf) | `sudo docker logs -f violation-worker` |
| Restart API | `sudo docker restart violation-pipeline` |
| Frontend dev (PM2) | `cd frontend && npm install && pm2 start npm --name violation-frontend -- run dev` |
| Frontend stop / restart | `pm2 stop violation-frontend` / `pm2 restart violation-frontend` |
| End-to-end demo on a video file | `python3 run.py --video <path>` |
| Standalone ANPR | `python3 run_anpr_vcc.py --video <path>` |
| Force TRT engine rebuild | `rm weights/*.engine` then restart `violation-worker` |
| Push backlog to central server | `python3 scripts/sync_violations.py` |
| Download MiVOLO age model | `python3 scripts/download_mivolo.py` |
| Apply Jetson tuning | `bash scripts/optimize_jetson.sh` |
| Add a camera via API | `curl -X POST http://localhost:8001/api/cameras -H 'content-type: application/json' -d '{"name":"cam-1","rtsp_url":"rtsp://..."}'` |

The full deployment walkthrough lives in [`INSTALL.md`](INSTALL.md) — refer
to it for the Dockerfile base-image swap step (x86 vs Jetson) which **must**
be done before `docker-compose up --build`.

## Pitfalls

1. **Dockerfile base image is hard-coded, not env-driven** — for x86 dev,
   you must comment out the Jetson `FROM` line and uncomment the
   `ultralytics/ultralytics:latest` line. See INSTALL.md §1.2. Forgetting
   this on x86 makes the build hang or fail.

2. **First build is ~15 min** — the Ultralytics base image is ~6 GB.
   Subsequent builds with cache are seconds.

3. **TRT `.engine` files are GPU+TRT-version specific** — never `git push`
   them, never copy between hosts. `.gitignore` already excludes them.
   Delete and let the worker rebuild on first run.

4. **MiVOLO age model is not in the repo** — `scripts/download_mivolo.py`
   must run before the worker starts, or the minor-rider detection silently
   no-ops. Confirm by `ls -la /app/weights/mivolo*` inside the container.

5. **PM2 is not under Docker** — restart-on-reboot needs `pm2 startup` and
   `pm2 save` (one-time). A host reboot without that drops the dashboard.

6. **Radar features are camera-1 only** — `radar_interface.py` is
   single-instance. Adding a second radar means refactoring it to keyed
   instances.

7. **`docker-entrypoint.sh` checks for `violation.pt`** — that file doesn't
   exist; the actual model is `best_small.pt`. The warning is harmless but
   misleading. Fix the check to `best_small.pt` if touching that file.

8. **`scripts/README.md` references `scripts/export_to_tensorrt.py` and
   `scripts/test_tensorrt.py`** which don't exist in the current tree — the
   working exporter is `export_yolo_to_tensorrt.py` at the project root.
   Update README if you touch it.

9. **`server.pid` at the project root** is generated at runtime by some
   entry path; treat as gitignore noise.

10. **`debug_output/`** is regenerated by tests/runs — safe to wipe.

11. **Network mode is `host`** — no port mappings in compose. Service ports
    (`8001`, `5173`) bind directly to the host. Conflicts with anything
    else listening on those ports break the stack silently in some
    configurations.

## Source-of-truth files (re-read before editing)

When extending or debugging, prefer these as ground truth over this doc:

- `README.md` — top-line architecture + maintenance
- `INSTALL.md` — exact step-by-step for new hosts
- `docker-compose.yml` — service shape, env vars, volumes
- `docker-entrypoint.sh` — which entry maps to which `RUN_MODE`
- `violation_pipeline/config/config.py` — tunable knobs
- `violation_pipeline/api_server.py` — REST surface (line refs above)
- `violation_pipeline/pipeline.py` — UnifiedPipeline orchestration
- `violation_pipeline/src/logic/violations.py` — frame-consensus logic
- `frontend/package.json` — frontend deps + scripts
- `scripts/README.md` — TRT export procedure (note caveats above)

## Relationship to `../rust_anpr_violation/`

Sister project, no shared code. Both run on the same host without conflict
because:
- Different model files (no clobbering in `weights/`).
- Different ports (Rust supervisor `:8080`, this API `:8001`).
- Both can be GPU concurrent with NVIDIA MPS enabled (see
  `../rust_anpr_violation/CLAUDE.md` § "NVIDIA MPS"). Without MPS the
  GPU time-slices between them.

If you find yourself wanting to share inference between them, don't —
the model schemas are different (`Vcc_best` 6 classes vs `new_v1` 10
classes; `best_small` separates rider/helmet/seatbelt as distinct heads
vs the Rust pipeline's single 10-class model).
