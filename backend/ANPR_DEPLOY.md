# IRIS · ITMS ANPR / VCC backend — deploy on a Jetson Orin (219)

Self-contained ANPR + VCC engine, ported from the proven `Violation_Analytics`
V2 stack. Runs natively on the Jetson (no Docker) in an isolated venv, reusing
the box's system torch / CUDA / TensorRT. Plug-and-play cameras via the API.

## What runs

- **API** — `python3 -m violation_pipeline.api_server` → FastAPI on **:8003**
  (login, cameras CRUD/start/stop, `/api/violations`, `/api/counts`, static `/output`).
- **Worker** — `python3 violation_pipeline/violation_worker.py` → the AI pipeline
  (detection + tracking + OCR) for every active camera.
- DB: SQLite at `data/violation_pipeline.db` (created on first run).
- Default login: `admin` / `admin`.

Launch scripts: `start_anpr_api.sh`, `start_anpr_worker.sh` (run under tmux
sessions `anprapi` / `anprworker`).

## The TensorRT-version gotcha (important)

The model engines were built with **TensorRT 10.7**, but the target Jetson's
*system* TRT is **10.3** → engines fail to deserialize
(`Serialization assertion ... Version tag does not match`). Same GPU (Orin Nano
Super), so the fix is to give **only the ANPR process** an isolated TRT 10.7,
leaving the system 10.3 untouched (so other GPU modules keep working):

1. Copy the TRT 10.7 runtime libs + python bindings from a box that has them
   (e.g. the source container) into `~/trt107/`:
   - `~/trt107/lib/` → `libnvinfer.so.10.7.0`, `libnvinfer_plugin.so.10.7.0`
     (+ `libnvonnxparser.so.10.7.0`), with `.so.10` symlinks.
   - `~/trt107/py/tensorrt/` → the python bindings (`tensorrt.so`, `__init__.py`, `plugin/`).
2. Both launch scripts export:
   ```sh
   export PYTHONPATH=/home/jetson/trt107/py
   export LD_LIBRARY_PATH=/home/jetson/trt107/lib:${LD_LIBRARY_PATH}
   ```
   This makes the OCR engine `best_model_match_v3.engine` load (no `.pt` source
   exists for it). torch + TRT 10.7 coexist fine in one process.

## Model weights (not in this repo)

The `weights/` dir (`.pt` / `.engine` / `.pth`, ~207 MB) is **excluded** — it is
model binary, not source. Provide it out-of-band:

- `new_v1.pt` — traffic/plate detector. Config points `MODEL_TRAFFIC` /
  `MODEL_VIOLATION` at the **`.pt`** (the `new_v1.engine` is TRT-incompatible on
  10.3 *and* 10.7; PyTorch/CUDA `.pt` is used instead).
- `best_model_match_v3.engine` — CRNN OCR (TRT 10.7 only; runs via `~/trt107`).
- `mobile_best.pt`, `Vcc_best.pt`, `stage_2.pth` — supporting models.

Drop them in `backend/weights/` before launching.

## Local persistence patch

The stock pipeline only sends ANPR/VCC to a central server and needs a tracked
vehicle. For a self-contained box, `pipeline.py::_process_anpr` was extended with
a **plate-only path**: OCR any clearly-detected plate and save it to the local DB
as `violation_type='anpr'` (deduped by text). Thresholds lowered for hard footage
(`CONF_PLATE`, `CONF_VEHICLE`, `ANPR_MIN_PLATE_CONFIDENCE=0.10`).

## Venv setup

```sh
python3 -m venv --system-site-packages --without-pip ~/anpr-venv
curl -sS https://bootstrap.pypa.io/get-pip.py | ~/anpr-venv/bin/python
~/anpr-venv/bin/pip install fastapi "uvicorn[standard]" "python-jose[cryptography]" \
    "passlib[bcrypt]" python-multipart sqlalchemy
# supervision: copy the working 0.28.0 package + its `deprecate` from a box that
# has it (PyPI build mismatches the `deprecated()` signature).
```

## Frontend

The operator UI is the `nisa-frontend` app (repo root). Its ANPR/VCC page lives at
`/itms/anpr-vcc` (`src/components/itms/AnprVcc.tsx`), wired straight to this engine
via the `/itmsapi` Vite proxy → `127.0.0.1:8003`. Reads are public; mutations use
the `admin/admin` bearer token.
