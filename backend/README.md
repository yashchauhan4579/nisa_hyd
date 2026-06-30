# Violation Analytics V2

A complete AI-powered traffic violation detection system featuring Radar-Camera Fusion, a persistent React Dashboard, and optimized edge deployment for Jetson Orin.

## 🌟 Key Features
- **Split Architecture**: 
  - `violation-pipeline`: Lightweight API Server for streaming.
  - `violation-worker`: Heavy AI inference worker (GPU).
- **Persistent Dashboard**: React + Vite frontend managed by PM2.
- **AI Optimizations**: 
  - 80% reduced OCR load via smart throttling.
  - Frame skipping support for Jetson.
  - Forced TCP transport for stable RTSP.
- **Radar Fusion**: Accurate speed detection via TSC224 Radar integration.

## 🚀 Installation

For detailed deployment instructions on **Laptop (x86)** or **Jetson (ARM64)**, please refer to:
👉 [**INSTALL.md**](./INSTALL.md)

## 🏗️ Architecture Overview

| Service | Technology | Port | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | React / Vite | `5173` | Main User Interface (Dashboard, Settings) |
| **API Server** | FastAPI | `8001` | REST API, Camera Management, MJPEG Streaming |
| **AI Worker** | PyTorch / YOLO | - | Headless worker for processing video streams |
| **Database** | SQLite + PostGIS | - | Persistent storage for configurations & results |

## 🛠️ Quick Maintenance

**Start All Services:**
```bash
sudo docker-compose up -d  # Backend
pm2 start violation-frontend # Frontend
```

**View Logs:**
```bash
sudo docker logs -f violation-worker
```
