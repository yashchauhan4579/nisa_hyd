# Violation Pipeline - Standalone Docker Image
# NOTE: For Jetson deployment, use: ultralytics/ultralytics:latest-jetson-jetpack6
# For local x86 server testing, use: ultralytics/ultralytics:latest
FROM ultralytics/ultralytics:latest-jetson-jetpack6
# FROM ultralytics/ultralytics:latest

# Set working directory
WORKDIR /app

# Install system dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-dev \
    libopencv-dev \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p /app/output /app/uploads /app/weights

# Copy violation pipeline
COPY violation_pipeline/ /app/violation_pipeline/

# Copy radar modules and calibration
COPY radar_interface.py /app/
COPY radar_camera_fusion.py /app/
COPY radar_calibration.json /app/

# Copy model weights
COPY weights/ /app/weights/

# Copy entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Create volume mount points
VOLUME ["/app/output", "/app/uploads", "/app/weights"]

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CUDA_VISIBLE_DEVICES=0

# Use entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bash"]
