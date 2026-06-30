"""
Live Web Viewer for Violation Detection Pipeline
Streams annotated video with real-time detections, OCR, and violations
Access via browser at http://IP:PORT
"""

import cv2
import time
import threading
import argparse
from flask import Flask, Response, render_template_string
from collections import deque
import numpy as np

app = Flask(__name__)

# Global frame buffer (thread-safe)
frame_buffer = deque(maxlen=1)
frame_lock = threading.Lock()
stats_buffer = {'fps': 0, 'detections': 0, 'violations': 0, 'timestamp': ''}

# HTML Template with live video and stats
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Violation Analytics | Live Monitor</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0f1115;
            --panel-bg: #1a1d21;
            --border-color: #2d3136;
            --text-primary: #e1e3e5;
            --text-secondary: #9ca3af;
            --accent-color: #3b82f6;
            --success-color: #10b981;
            --warning-color: #f59e0b;
            --danger-color: #ef4444;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            height: 100vh;
            overflow: hidden; /* Prevent scrolling, full app feel */
            display: flex;
            flex-direction: column;
        }

        /* Header */
        header {
            height: 60px;
            background-color: var(--panel-bg);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            padding: 0 24px;
            justify-content: space-between;
        }

        .brand {
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .brand-icon {
            width: 8px;
            height: 8px;
            background-color: var(--success-color);
            border-radius: 50%;
            box-shadow: 0 0 12px var(--success-color);
        }

        .system-time {
            font-family: 'Monaco', monospace;
            color: var(--text-secondary);
            font-size: 14px;
        }

        /* Main Layout */
        .main-container {
            display: flex;
            height: calc(100vh - 60px);
            width: 100%;
        }

        /* Left Side: Video (70%) */
        .video-section {
            flex: 7;
            background-color: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
            border-right: 1px solid var(--border-color);
            padding: 20px;
        }

        #videoStream {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            border-radius: 4px; /* Subtle radius */
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
        }

        .live-badge {
            position: absolute;
            top: 24px;
            left: 24px;
            background-color: rgba(220, 38, 38, 0.9);
            color: white;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            z-index: 10;
        }

        /* Right Side: Info Panel (30%) */
        .info-section {
            flex: 3;
            background-color: var(--panel-bg);
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 24px;
            min-width: 350px;
            overflow-y: auto;
        }

        /* Card Styles */
        .card {
            background-color: #23272e;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
        }

        .card-header {
            color: var(--text-secondary);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 16px;
            font-weight: 600;
        }

        /* KPI Grid */
        .kpi-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .kpi-item {
            background-color: rgba(255, 255, 255, 0.03);
            border-radius: 6px;
            padding: 12px;
        }

        .kpi-label {
            color: var(--text-secondary);
            font-size: 13px;
            margin-bottom: 4px;
        }

        .kpi-value {
            font-size: 24px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .text-accent { color: var(--accent-color); }
        .text-danger { color: var(--danger-color); }
        .text-success { color: var(--success-color); }

        /* Violation Stats List */
        .stats-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .bg-flat { background: transparent; padding: 0; border: none; }

        .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid var(--border-color);
        }
        .stat-row:last-child { border-bottom: none; }

        .stat-name {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 14px;
        }

        .stat-count {
            font-family: 'Monaco', monospace;
            font-size: 16px;
            font-weight: 600;
        }

        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        /* Camera Details */
        .camera-details table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        
        .camera-details td {
            padding: 8px 0;
            color: var(--text-secondary);
        }
        
        .camera-details td:last-child {
            text-align: right;
            color: var(--text-primary);
            font-family: 'Monaco', monospace;
        }

    </style>
</head>
<body>
    <header>
        <div class="brand">
            <div class="brand-icon"></div>
            VIOLATION ANALYTICS
        </div>
        <div class="system-time" id="clock">00:00:00</div>
    </header>

    <div class="main-container">
        <!-- VIDEO PLAYER (70%) -->
        <div class="video-section">
            <span class="live-badge">Live Feed</span>
            <img id="videoStream" src="{{ url_for('video_feed') }}" alt="Camera Stream">
        </div>

        <!-- INFO PANEL (30%) -->
        <div class="info-section">
            
            <!-- Real-time KPIs -->
            <div class="card">
                <div class="card-header">Real-time Metrics</div>
                <div class="kpi-grid">
                    <div class="kpi-item">
                        <div class="kpi-label">Processing FPS</div>
                        <div class="kpi-value text-success" id="fps">--</div>
                    </div>
                    <div class="kpi-item">
                        <div class="kpi-label">Active Objects</div>
                        <div class="kpi-value text-accent" id="detections">--</div>
                    </div>
                </div>
            </div>

            <!-- Active Violations Breakdown -->
            <div class="card bg-flat">
                <div class="card-header">Active Violations</div>
                <div class="stats-list">
                    <div class="stat-row">
                        <div class="stat-name">
                            <span class="dot" style="background: #ef4444;"></span>
                            Total Active
                        </div>
                        <div class="stat-count text-danger" id="violations">--</div>
                    </div>
                    <!-- Placeholders for specific types if backend sent them, 
                         currently we just have total count in stats_buffer -->
                    <div class="stat-row">
                        <div class="stat-name" style="opacity: 0.5;">
                            Monitoring: Speed, Helmet, Triple, Wrong Side
                        </div>
                    </div>
                </div>
            </div>

            <!-- Camera Info -->
            <div class="card">
                <div class="card-header">Camera Information</div>
                <div class="camera-details">
                    <table>
                        <tr>
                            <td>Camera Name</td>
                            <td id="cam-name">Main Gate</td>
                        </tr>
                        <tr>
                            <td>ID</td>
                            <td id="cam-id">CAM_01</td>
                        </tr>
                        <tr>
                            <td>Status</td>
                            <td class="text-success">ONLINE</td>
                        </tr>
                        <tr>
                            <td>Resolution</td>
                            <td>3072x2048</td>
                        </tr>
                        <tr>
                            <td>Last Update</td>
                            <td id="timestamp">--</td>
                        </tr>
                    </table>
                </div>
            </div>

        </div>
    </div>

    <script>
        // Update Clock
        setInterval(() => {
            const now = new Date();
            document.getElementById('clock').textContent = now.toLocaleTimeString();
        }, 1000);

        // Update Stats
        setInterval(function() {
            fetch('/stats')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('fps').textContent = data.fps;
                    document.getElementById('detections').textContent = data.detections;
                    document.getElementById('violations').textContent = data.violations;
                    document.getElementById('timestamp').textContent = data.timestamp;
                })
                .catch(error => console.log('Stats error:', error));
        }, 1000);
    </script>
</body>
</html>
"""

# Global frame state
frame_lock = threading.Condition()
current_frame = None
stats_buffer = {'fps': 0, 'detections': 0, 'violations': 0, 'timestamp': ''}

# HTML_TEMPLATE remains unchanged... (skipping for brevity)

def update_frame(frame, fps=0, detections=0, violations=0):
    """
    Update the global frame buffer and notify clients.
    """
    global current_frame
    with frame_lock:
        current_frame = frame  # No need to copy if we encode immediately, but copy is safer for concurrency
        stats_buffer['fps'] = f"{fps:.1f}"
        stats_buffer['detections'] = detections
        stats_buffer['violations'] = violations
        stats_buffer['timestamp'] = time.strftime('%H:%M:%S')
        frame_lock.notify_all()  # Wake up all streaming threads!

def generate_frames():
    """
    Generator function for MJPEG streaming.
    Waits for new frames using Condition variable (Zero latency).
    """
    while True:
        with frame_lock:
            frame_lock.wait()  # Wait here until update_frame is called
            if current_frame is None:
                continue
            frame = current_frame
        
        # Resize to max width 1920, maintaining aspect ratio
        if frame.shape[1] > 1920:
            aspect_ratio = frame.shape[1] / frame.shape[0]
            new_height = int(1920 / aspect_ratio)
            frame = cv2.resize(frame, (1920, new_height), interpolation=cv2.INTER_AREA)
            
        # Encode as JPEG
        # Use lower quality (70) slightly for faster transmission if network is bottleneck
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        
        if ret:
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    """Serve the main HTML page."""
    return render_template_string(HTML_TEMPLATE)

@app.route('/video_feed')
def video_feed():
    """Video streaming route."""
    return Response(generate_frames(),
                   mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/stats')
def stats():
    """Stats API endpoint."""
    return stats_buffer

def run_server(host='0.0.0.0', port=5000):
    """
    Start the Flask web server.
    
    Args:
        host: Host IP (0.0.0.0 for all interfaces)
        port: Port number
    """
    print(f"\n{'='*80}")
    print(f"🌐 Live Web Viewer Started!")
    print(f"{'='*80}")
    print(f"📺 Access the live stream at:")
    print(f"   → http://localhost:{port}")
    print(f"   → http://127.0.0.1:{port}")
    print(f"   → http://<your-server-ip>:{port}")
    print(f"\n💡 Tip: Find your server IP with: hostname -I")
    print(f"{'='*80}\n")
    
    app.run(host=host, port=port, debug=False, threaded=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Live Web Viewer for Violation Detection')
    parser.add_argument('--host', type=str, default='0.0.0.0',
                       help='Host IP (default: 0.0.0.0 for all interfaces)')
    parser.add_argument('--port', type=int, default=5000,
                       help='Port number (default: 5000)')
    
    args = parser.parse_args()
    
    # Start in test mode (just server, no pipeline)
    print("Starting in standalone mode (test)...")
    print("Normally, this is called by the pipeline automatically.")
    
    run_server(host=args.host, port=args.port)
