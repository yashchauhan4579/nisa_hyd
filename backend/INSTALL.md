# 🚀 Installation Guide (Violation Analytics)

This guide covers setting up the **Violation Analytics** platform on both Development (x86 Laptop) and Production (NVIDIA Jetson) environments.

---

## 🏗️ Architecture
The system consists of three persistent services:
1.  **Frontend**: React UI (Port 5173/5000) - Running via **PM2**.
2.  **API Server**: FastAPI (Port 8001) - Running in **Docker** (`violation-pipeline`).
3.  **AI Worker**: Inference Engine - Running in **Docker** (`violation-worker`).

---

## 1️⃣ Quick Setup (All Platforms)

### 1. Repository Setup
```bash
git clone https://github.com/Nikhilkaushik23/Violation_Analytics.git
cd Violation_Analytics
git checkout unified-pipeline-v2
```

### 2. Configure Environment (Critical)
**Before building**, you must select the correct Base Image in `Dockerfile`.

*   **For Development (Laptop/Server)**:
    Open `Dockerfile` and ensure the x86 line is active:
    ```dockerfile
    # FROM ultralytics/ultralytics:latest-jetson-jetpack6  <-- COMMENT THIS OUT
    FROM ultralytics/ultralytics:latest                    <-- USE THIS
    ```

*   **For Production (Jetson Orin/Nano)**:
    Open `Dockerfile` and switch to the Jetson line:
    ```dockerfile
    FROM ultralytics/ultralytics:latest-jetson-jetpack6    <-- USE THIS
    # FROM ultralytics/ultralytics:latest                  <-- COMMENT THIS OUT
    ```

---

## 2️⃣ Backend Installation (Docker)

We use **Docker Compose** to manage both the API and the AI Worker.

### 1. Build and Start
```bash
# Go to project root
cd ~/Violation_Analytics

# Build and Start (This takes ~15 mins on first run)
# Note: On Jetson, this MUST be done on the device itself
sudo docker-compose up -d --build
```

### 2. Verify Backend
Check if containers are running:
```bash
sudo docker ps
```
You should see:
*   `violation-pipeline` (API Server)
*   `violation-worker` (AI Processing)

**Check Logs:**
```bash
# API Logs
sudo docker logs -f violation-pipeline

# Worker Logs (Check AI speeds here)
sudo docker logs -f violation-worker
```

---

## 3️⃣ Frontend Installation (PM2)

We use **PM2** to keep the React frontend running forever.

### 1. Install Dependencies
```bash
cd frontend
npm install
# Install PM2 globally if not already installed
sudo npm install -g pm2
```

### 2. Start Persistent Service
```bash
# Start the dev server in background
pm2 start npm --name "violation-frontend" -- run dev

# Save list so it restarts on reboot
pm2 save
pm2 startup
```

**Access the Dashboard:**
Open `http://YOUR_DEVICE_IP:5173` (or `http://localhost:5173`)

---

## 🛠️ Maintenance & Common Tasks

### Stop Everything
```bash
sudo docker-compose down
pm2 stop violation-frontend
```

### Update Code
```bash
git pull origin main

# Rebuild Docker containers (Backend)
sudo docker-compose up -d --build

# Restart Frontend
pm2 restart violation-frontend
```

### Jetson Performance Tuning
On Jetson Orin/NX, perform these once:
```bash
# Maximize Power
sudo nvpmodel -m 0
sudo jetson_clocks
```

### Debugging "Connecting..." Loops
If camera stream says "Connecting..." forever:
1.  Check if `violation-pipeline` is running.
2.  Restart the API:
    ```bash
    sudo docker restart violation-pipeline
    ```
