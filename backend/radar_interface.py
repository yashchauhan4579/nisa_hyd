#!/usr/bin/env python3
"""
TSC224 Speed Radar Interface Module
Protocol Version: V5.0.8

This module provides a production-grade interface to the TSC224 multi-target
Doppler radar for vehicle speed detection.

Author: Traffic Analytics System
Date: December 2024

IMPORTANT: This is a standalone module. It does NOT modify existing code.
"""

import socket
import struct
import threading
import time
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Callable, Dict
from collections import deque
from enum import Enum
import queue

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("TSC224_Radar")


class RadarDirection(Enum):
    """Vehicle direction relative to radar."""
    APPROACHING = "approaching"  # Positive speed value
    RECEDING = "receding"        # Negative speed value
    STATIONARY = "stationary"    # Zero speed


@dataclass
class RadarTarget:
    """
    Represents a single target detected by the TSC224 radar.
    
    All measurements are converted to standard units (km/h, meters).
    """
    target_id: int                    # Unique target ID from radar (persistent across frames)
    speed_kmh: float                  # Speed in km/h (absolute value)
    direction: RadarDirection         # Approaching or receding
    horizontal_distance_m: float      # Distance left/right from radar center (meters)
    vertical_distance_m: float        # Distance from radar along road (meters)
    echo_energy: int                  # Signal strength (higher = stronger reflection)
    timestamp: float = field(default_factory=time.time)  # When this reading was received
    raw_speed: int = 0                # Raw speed value from radar (for debugging)
    
    @property
    def is_approaching(self) -> bool:
        return self.direction == RadarDirection.APPROACHING
    
    @property
    def is_receding(self) -> bool:
        return self.direction == RadarDirection.RECEDING
    
    @property
    def lane_position(self) -> str:
        """Estimate lane position based on horizontal distance."""
        if self.horizontal_distance_m < -3:
            return "far_left"
        elif self.horizontal_distance_m < -1:
            return "left"
        elif self.horizontal_distance_m < 1:
            return "center"
        elif self.horizontal_distance_m < 3:
            return "right"
        else:
            return "far_right"
    
    def __repr__(self):
        dir_symbol = "→" if self.is_approaching else "←" if self.is_receding else "○"
        return (f"Target[ID:{self.target_id}] {dir_symbol} {self.speed_kmh:.1f} km/h | "
                f"H:{self.horizontal_distance_m:+.1f}m V:{self.vertical_distance_m:.1f}m | "
                f"Energy:{self.echo_energy}")


@dataclass
class RadarFrame:
    """Represents a complete radar data frame with all detected targets."""
    frame_number: int
    targets: List[RadarTarget]
    timestamp: float = field(default_factory=time.time)
    checksum_valid: bool = True
    
    @property
    def target_count(self) -> int:
        return len(self.targets)
    
    @property
    def approaching_targets(self) -> List[RadarTarget]:
        return [t for t in self.targets if t.is_approaching]
    
    @property
    def receding_targets(self) -> List[RadarTarget]:
        return [t for t in self.targets if t.is_receding]
    
    def get_target_by_id(self, target_id: int) -> Optional[RadarTarget]:
        for target in self.targets:
            if target.target_id == target_id:
                return target
        return None


class TSC224Radar:
    """
    TSC224 Multi-Target Doppler Radar Interface.
    
    Features:
    - TCP connection with automatic reconnection
    - Protocol parsing according to V5.0.8 specification
    - Thread-safe target data access
    - Callback support for real-time processing
    - Connection health monitoring
    
    Usage:
        radar = TSC224Radar(ip="192.168.150.111", port=50000)
        radar.connect()
        
        # Get latest targets
        targets = radar.get_current_targets()
        
        # Or use callback
        radar.set_callback(my_handler_function)
    """
    
    # Protocol constants
    FRAME_START = 0xDB
    FRAME_END = 0xDC
    DATA_FRAME_TYPE = 0x01
    TARGET_SIZE = 10  # bytes per target
    MAX_TARGETS = 32
    
    def __init__(self, 
                 ip: str = "192.168.150.11",
                 port: int = 8080,
                 timeout: float = 10.0,  # Increased timeout to wait longer for data
                 reconnect_interval: float = 5.0,  # Longer reconnect interval
                 speed_limit: float = 60.0,
                 min_speed_threshold: float = 5.0):
        """
        Initialize radar interface.
        
        Args:
            ip: Radar IP address
            port: TCP port (default 50000)
            timeout: Socket timeout in seconds
            reconnect_interval: Time between reconnection attempts
            speed_limit: Speed limit for violation detection (km/h)
            min_speed_threshold: Minimum speed to consider (filters noise)
        """
        self.ip = ip
        self.port = port
        self.timeout = timeout
        self.reconnect_interval = reconnect_interval
        self.speed_limit = speed_limit
        self.min_speed_threshold = min_speed_threshold
        
        # Warning for common configuration mistake
        if self.ip.endswith(".11") and self.port == 8080:
             logger.warning(f"⚠️  CONFIG WARNING: Connecting to {self.ip}:{self.port} which is likely the MagicBox Dashboard, not the Radar!")
        
        # Connection state
        self._socket: Optional[socket.socket] = None
        self._connected = False
        self._running = False
        self._lock = threading.Lock()
        
        # Data storage
        self._current_frame: Optional[RadarFrame] = None
        self._target_history: Dict[int, deque] = {}  # target_id -> history of readings
        self._history_size = 10  # Keep last N readings per target
        
        # Threading
        self._receive_thread: Optional[threading.Thread] = None
        self._callback: Optional[Callable[[RadarFrame], None]] = None
        
        # Statistics
        self._frames_received = 0
        self._frames_errors = 0
        self._last_frame_time = 0
        self._connection_attempts = 0
        
        # Buffer for receiving data
        self._buffer = bytearray()
        
        logger.info(f"TSC224 Radar initialized: {ip}:{port}")
        logger.info(f"Speed limit: {speed_limit} km/h | Min threshold: {min_speed_threshold} km/h")
    
    def connect(self) -> bool:
        """
        Establish TCP connection to the radar.
        
        Returns:
            True if connection successful, False otherwise
        """
        with self._lock:
            if self._connected:
                logger.warning("Already connected to radar")
                return True
            
            try:
                self._connection_attempts += 1
                logger.info(f"Connecting to radar at {self.ip}:{self.port}...")
                
                self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self._socket.settimeout(self.timeout)
                self._socket.connect((self.ip, self.port))
                
                # Set socket options for better performance
                self._socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
                
                self._connected = True
                self._buffer.clear()
                
                # Try to send initialization/start command
                # TSC224 may need a start command to begin sending data
                self._send_start_command()
                
                logger.info(f"✅ Connected to radar successfully!")
                return True
                
            except socket.timeout:
                logger.error(f"❌ Connection timeout - radar not responding at {self.ip}:{self.port}")
                return False
            except ConnectionRefusedError:
                logger.error(f"❌ Connection refused - check if radar is online and port {self.port} is correct")
                return False
            except OSError as e:
                logger.error(f"❌ Connection error: {e}")
                return False
    
    def _send_start_command(self):
        """
        Send initialization commands to radar according to TSC224 Protocol V5.0.8.
        
        Key commands:
        - 0x94: Enable target output on TCP port (REQUIRED!)
        - 0x04: Query radar parameters
        """
        try:
            # Command 94(H): Enable TCP target output
            # Frame: DB + 94 + 00 07 + enable_byte + checksum + DC
            # enable_byte: bit0=TCP, bit1=RS485, bit2=WIFI
            # Set to 0x01 to enable TCP output only, or 0x07 for all
            enable_byte = 0x01  # Enable TCP only (stable)
            checksum = (0x94 + 0x00 + 0x07 + enable_byte) % 256
            
            enable_cmd = bytes([
                0xDB,           # Start marker
                0x94,           # Command: Target output interface enable
                0x00, 0x07,     # Length (7 bytes total)
                enable_byte,    # Enable TCP output (bit0=1)
                checksum,       # Checksum
                0xDC            # End marker
            ])
            self._socket.send(enable_cmd)
            logger.info(f"📡 Sent radar enable command (0x94) - enable_byte=0x{enable_byte:02X}")
            
            # Wait briefly for radar to process
            import time
            time.sleep(0.5)
            
            # Command 04(H): Query radar parameters (triggers radar to respond)
            # Frame: DB + 04 + 00 06 + checksum + DC
            query_checksum = (0x04 + 0x00 + 0x06) % 256
            query_cmd = bytes([
                0xDB,           # Start marker
                0x04,           # Command: Query parameters
                0x00, 0x06,     # Length (6 bytes total)
                query_checksum, # Checksum
                0xDC            # End marker
            ])
            self._socket.send(query_cmd)
            logger.info("📡 Sent radar query command (0x04)")
            
        except Exception as e:
            logger.warning(f"Failed to send start commands: {e}")
    
    def disconnect(self):
        """Disconnect from the radar."""
        with self._lock:
            self._running = False
            self._connected = False
            
            if self._socket:
                try:
                    self._socket.close()
                except:
                    pass
                self._socket = None
            
            logger.info("Disconnected from radar")
    
    def start(self):
        """Start receiving data from the radar in a background thread."""
        if not self._connected:
            if not self.connect():
                logger.error("Cannot start - connection failed")
                return False
        
        self._running = True
        self._receive_thread = threading.Thread(target=self._receive_loop, daemon=True)
        self._receive_thread.start()
        
        # Start heartbeat thread (Keep-Alive)
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        
        logger.info("🚀 Radar data reception started")
        return True
    
    def stop(self):
        """Stop receiving data and disconnect."""
        self._running = False
        if self._receive_thread:
            self._receive_thread.join(timeout=2.0)
        self.disconnect()
        logger.info("Radar stopped")

    def _heartbeat_loop(self):
        """Periodically send query command to keep connection alive."""
        while self._running:
            if self._connected:
                try:
                    # Send periodic query (0x04) every 2 seconds
                    # This acts as a heartbeat
                    query_checksum = (0x04 + 0x00 + 0x06) % 256
                    query_cmd = bytes([
                        0xDB, 0x04, 0x00, 0x06, query_checksum, 0xDC
                    ])
                    self._socket.send(query_cmd)
                    # logger.debug("💓 Sent heartbeat")
                except Exception:
                    # Error will be caught by receive loop
                    pass
            time.sleep(2.0)
    
    def _receive_loop(self):
        """Main loop for receiving and parsing radar data."""
        while self._running:
            try:
                if not self._connected:
                    logger.debug("Connection lost, attempting reconnect...")
                    time.sleep(self.reconnect_interval)
                    if not self.connect():
                        continue
                
                # Receive data
                try:
                    # Set a longer timeout for receiving data
                    self._socket.settimeout(30.0)  # Wait up to 30 seconds for data
                    data = self._socket.recv(4096)
                    if not data:
                        # Empty data means connection was closed by peer
                        logger.debug("No data received - connection closed by radar")
                        self._connected = False
                        continue
                    
                    # Log when we receive data (for debugging)
                    if len(data) > 0:
                        logger.debug(f"Received {len(data)} bytes from radar")
                    
                    
                    self._buffer.extend(data)
                    self._process_buffer()
                    
                except socket.timeout:
                    # Timeout is normal if no vehicles detected
                    continue
                except (ConnectionResetError, BrokenPipeError):
                    logger.warning("Connection reset by radar")
                    self._connected = False
                    continue
                    
            except Exception as e:
                logger.error(f"Error in receive loop: {e}")
                self._connected = False
                time.sleep(1)
    
    def _process_buffer(self):
        """Process the receive buffer and extract complete frames."""
        while True:
            # Find frame start marker
            try:
                start_idx = self._buffer.index(self.FRAME_START)
                # Discard any garbage before start marker
                if start_idx > 0:
                    self._buffer = self._buffer[start_idx:]
            except ValueError:
                # No start marker found
                self._buffer.clear()
                return
            
            # Need at least 7 bytes for minimum frame (empty frame)
            if len(self._buffer) < 7:
                return
            
            # Check frame type
            # Accept both 0x01 (standard) and 0x05 (observed) as data frames
            is_data_frame = (self._buffer[1] == self.DATA_FRAME_TYPE) or (self._buffer[1] == 0x05)
            
            if not is_data_frame:
                # Log non-data frames
                if self._buffer[1] == 0xB5:
                     logger.info("Received Info Packet (0xB5) - Radar ALIVE")
                     # We can discard 0xB5 packets (usually 4-12 bytes)
                     # Let's find end marker DC to skip safely
                     try:
                         next_dc = self._buffer.index(0xDC)
                         self._buffer = self._buffer[next_dc+1:]
                         continue
                     except ValueError:
                         self._buffer = self._buffer[1:] # Risky skip
                         continue
                else:
                     logger.warning(f"Unknown frame type: 0x{self._buffer[1]:02X}")
                     self._buffer = self._buffer[1:]
                continue
            
            # Get frame length
            frame_length = (self._buffer[2] << 8) | self._buffer[3]
            
            # Validate frame length
            if frame_length < 7 or frame_length > (7 + self.MAX_TARGETS * self.TARGET_SIZE):
                logger.warning(f"Invalid frame length: {frame_length}")
                self._buffer = self._buffer[1:]
                continue
            
            # Check if we have the complete frame
            # Frame structure: DB + type + len_h + len_l + data + checksum + DC
            # The length includes DB, type byte, and DC
            total_frame_size = frame_length
            
            if len(self._buffer) < total_frame_size:
                # Wait for more data
                return
            
            # Extract frame
            frame_data = self._buffer[:total_frame_size]
            
            # Verify end marker
            if frame_data[-1] != self.FRAME_END:
                logger.warning("Frame end marker not found")
                self._buffer = self._buffer[1:]
                continue
            
            # Verify checksum
            checksum_valid = self._verify_checksum(frame_data)
            if not checksum_valid:
                logger.warning("Checksum mismatch")
                self._frames_errors += 1
            
            # Parse the frame
            try:
                radar_frame = self._parse_data_frame(frame_data, checksum_valid)
                if radar_frame:
                    self._frames_received += 1
                    self._last_frame_time = time.time()
                    
                    with self._lock:
                        self._current_frame = radar_frame
                        
                        # Update target history
                        for target in radar_frame.targets:
                            if target.target_id not in self._target_history:
                                self._target_history[target.target_id] = deque(maxlen=self._history_size)
                            self._target_history[target.target_id].append(target)
                    
                    # Call callback if set
                    if self._callback:
                        try:
                            self._callback(radar_frame)
                        except Exception as e:
                            logger.error(f"Callback error: {e}")
                            
            except Exception as e:
                logger.error(f"Frame parse error: {e}")
                self._frames_errors += 1
            
            # Remove processed frame from buffer
            self._buffer = self._buffer[total_frame_size:]
    
    def _verify_checksum(self, frame_data: bytes) -> bool:
        """Verify frame checksum (sum of all bytes except DB and DC, mod 256)."""
        if len(frame_data) < 7:
            return False
        
        # Checksum is second-to-last byte
        received_checksum = frame_data[-2]
        
        # Calculate checksum: sum of all bytes except DB (first) and DC (last)
        calculated_checksum = sum(frame_data[1:-2]) % 256
        
        return received_checksum == calculated_checksum
    
    def _parse_data_frame(self, frame_data: bytes, checksum_valid: bool) -> Optional[RadarFrame]:
        """
        Parse a data frame (type 0x01) according to TSC224 protocol.
        
        Frame structure:
        - DB (1 byte): Start marker
        - 01 (1 byte): Frame type
        - Length high (1 byte)
        - Length low (1 byte)
        - Frame number (1 byte): 0-255
        - Target data (10 bytes per target)
        - Checksum (1 byte)
        - DC (1 byte): End marker
        """
        if len(frame_data) < 7:
            return None
        
        frame_number = frame_data[4]
        targets = []
        
        # Calculate number of targets
        # Frame length includes DB, type, len_h, len_l, frame_num, checksum, DC = 7 bytes overhead
        # Plus 10 bytes per target
        data_length = len(frame_data) - 7  # Subtract overhead
        num_targets = data_length // self.TARGET_SIZE
        
        # Parse each target
        for i in range(num_targets):
            offset = 5 + (i * self.TARGET_SIZE)  # Start after header (5 bytes)
            
            if offset + self.TARGET_SIZE > len(frame_data) - 2:  # Don't go past checksum+DC
                break
            
            target_data = frame_data[offset:offset + self.TARGET_SIZE]
            target = self._parse_target(target_data)
            
            if target:
                # Filter out noise (very slow or stationary targets if needed)
                if target.speed_kmh >= self.min_speed_threshold:
                    targets.append(target)
        
        return RadarFrame(
            frame_number=frame_number,
            targets=targets,
            timestamp=time.time(),
            checksum_valid=checksum_valid
        )
    
    def _parse_target(self, data: bytes) -> Optional[RadarTarget]:
        """
        Parse a single target from 10 bytes of data.
        
        Structure (10 bytes):
        - Speed: 2 bytes (signed short, 0.1 km/h, positive=approaching)
        - Horizontal distance: 2 bytes (signed short, 0.1m, negative=left)
        - Vertical distance: 2 bytes (unsigned short, 0.1m)
        - Echo energy: 2 bytes (unsigned short)
        - Target ID: 2 bytes (unsigned short)
        """
        if len(data) != 10:
            return None
        
        try:
            # Unpack data (big-endian)
            speed_raw = struct.unpack('>h', data[0:2])[0]  # Signed short
            horiz_raw = struct.unpack('>h', data[2:4])[0]  # Signed short
            vert_raw = struct.unpack('>H', data[4:6])[0]   # Unsigned short
            energy = struct.unpack('>H', data[6:8])[0]     # Unsigned short
            target_id = struct.unpack('>H', data[8:10])[0] # Unsigned short
            
            # Convert to standard units
            speed_kmh = abs(speed_raw) / 10.0  # 0.1 km/h -> km/h
            
            horiz_m = horiz_raw / 10.0         # 0.1m -> m
            vert_m = vert_raw / 10.0           # 0.1m -> m
            
            # Determine direction
            if speed_raw > 0:
                direction = RadarDirection.APPROACHING
            elif speed_raw < 0:
                direction = RadarDirection.RECEDING
            else:
                direction = RadarDirection.STATIONARY
            
            return RadarTarget(
                target_id=target_id,
                speed_kmh=speed_kmh,
                direction=direction,
                horizontal_distance_m=horiz_m,
                vertical_distance_m=vert_m,
                echo_energy=energy,
                raw_speed=speed_raw
            )
            
        except struct.error as e:
            logger.error(f"Target parse error: {e}")
            return None
    
    def set_callback(self, callback: Callable[[RadarFrame], None]):
        """Set callback function to be called on each new frame."""
        self._callback = callback
    
    def get_current_targets(self, max_age: float = 0.5) -> List[RadarTarget]:
        """
        Get recent targets within the specified time window.
        
        Since radar frames often have no targets, this method returns
        targets from recent frames (within max_age seconds) to improve
        matching with camera detections.
        
        Args:
            max_age: Maximum age in seconds for targets to be included
            
        Returns:
            List of recent targets, deduplicated by target_id (most recent wins)
        """
        with self._lock:
            current_time = time.time()
            recent_targets = {}
            
            # Check current frame
            if self._current_frame and self._current_frame.targets:
                frame_age = current_time - self._current_frame.timestamp
                if frame_age <= max_age:
                    for target in self._current_frame.targets:
                        recent_targets[target.target_id] = target
            
            # Also check target history for recent detections
            for target_id, history in self._target_history.items():
                if history:
                    latest = history[-1]
                    target_age = current_time - latest.timestamp
                    if target_age <= max_age:
                        # Only add if not already present or if this is more recent
                        if target_id not in recent_targets:
                            recent_targets[target_id] = latest
            
            return list(recent_targets.values())
    
    def get_current_frame(self) -> Optional[RadarFrame]:
        """Get the most recent complete frame."""
        with self._lock:
            return self._current_frame
    
    def get_recent_targets_with_history(self, max_age: float = 1.0) -> List[RadarTarget]:
        """
        Get all targets seen in the last max_age seconds.
        
        This is useful for fusion when radar detections are sparse.
        """
        with self._lock:
            current_time = time.time()
            recent = []
            
            for target_id, history in self._target_history.items():
                for target in history:
                    if current_time - target.timestamp <= max_age:
                        recent.append(target)
            
            return recent
    
    def get_target_history(self, target_id: int) -> List[RadarTarget]:
        """Get historical readings for a specific target."""
        with self._lock:
            if target_id in self._target_history:
                return list(self._target_history[target_id])
            return []
    
    def get_average_speed(self, target_id: int) -> Optional[float]:
        """Get average speed for a target from recent history."""
        history = self.get_target_history(target_id)
        if not history:
            return None
        return sum(t.speed_kmh for t in history) / len(history)
    
    def get_violations(self) -> List[RadarTarget]:
        """Get all current targets exceeding the speed limit."""
        targets = self.get_current_targets()
        return [t for t in targets if t.speed_kmh > self.speed_limit]
    
    def get_statistics(self) -> dict:
        """Get connection and processing statistics."""
        return {
            "connected": self._connected,
            "ip": self.ip,
            "port": self.port,
            "frames_received": self._frames_received,
            "frames_errors": self._frames_errors,
            "error_rate": self._frames_errors / max(1, self._frames_received),
            "connection_attempts": self._connection_attempts,
            "last_frame_age": time.time() - self._last_frame_time if self._last_frame_time else None,
            "tracked_targets": len(self._target_history),
            "speed_limit": self.speed_limit
        }
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    @property
    def is_running(self) -> bool:
        return self._running


class RadarVisualizer:
    """Simple console visualizer for radar data."""
    
    @staticmethod
    def print_targets(frame: RadarFrame):
        """Print targets in a formatted table."""
        if not frame.targets:
            print(f"Frame {frame.frame_number:03d} | No targets detected")
            return
        
        print(f"\n{'='*80}")
        print(f"Frame {frame.frame_number:03d} | {len(frame.targets)} targets | "
              f"Approaching: {len(frame.approaching_targets)} | "
              f"Receding: {len(frame.receding_targets)}")
        print(f"{'='*80}")
        print(f"{'ID':>6} | {'Dir':^6} | {'Speed':>10} | {'H-Dist':>10} | {'V-Dist':>10} | {'Energy':>8} | {'Lane':^10}")
        print(f"{'-'*80}")
        
        for t in sorted(frame.targets, key=lambda x: x.vertical_distance_m):
            dir_str = "→ IN" if t.is_approaching else "← OUT"
            violation = " ⚠️" if t.speed_kmh > 60 else ""
            print(f"{t.target_id:>6} | {dir_str:^6} | {t.speed_kmh:>7.1f} km/h | "
                  f"{t.horizontal_distance_m:>+8.1f}m | {t.vertical_distance_m:>8.1f}m | "
                  f"{t.echo_energy:>8} | {t.lane_position:^10}{violation}")


# =============================================================================
# Standalone Test Script
# =============================================================================

def test_radar_connection():
    """Test radar connectivity and data reception."""
    print("\n" + "="*80)
    print("TSC224 RADAR CONNECTION TEST")
    print("="*80)
    print(f"Target: 192.168.150.12:50000")
    print("="*80 + "\n")
    
    radar = TSC224Radar(
        ip="192.168.150.12",
        port=50000,
        timeout=5.0,
        speed_limit=60.0,
        min_speed_threshold=3.0
    )
    
    # Set up visualizer callback
    def on_frame(frame: RadarFrame):
        RadarVisualizer.print_targets(frame)
        
        # Check for violations
        violations = [t for t in frame.targets if t.speed_kmh > 60]
        if violations:
            print(f"\n🚨 SPEED VIOLATIONS DETECTED: {len(violations)}")
            for v in violations:
                print(f"   Target {v.target_id}: {v.speed_kmh:.1f} km/h ({v.direction.value})")
    
    radar.set_callback(on_frame)
    
    # Try to connect and start
    if radar.start():
        print("\n✅ Radar started successfully!")
        print("📡 Listening for traffic data...")
        print("Press Ctrl+C to stop\n")
        
        try:
            # Run for a while, printing statistics periodically
            start_time = time.time()
            while True:
                time.sleep(5)
                stats = radar.get_statistics()
                elapsed = time.time() - start_time
                fps = stats['frames_received'] / elapsed if elapsed > 0 else 0
                
                print(f"\n📊 Stats: {stats['frames_received']} frames | "
                      f"{fps:.1f} FPS | Errors: {stats['frames_errors']} | "
                      f"Targets tracked: {stats['tracked_targets']}")
                
        except KeyboardInterrupt:
            print("\n\n⏹️  Stopping radar...")
        
        finally:
            radar.stop()
            
            # Print final statistics
            stats = radar.get_statistics()
            print("\n" + "="*80)
            print("FINAL STATISTICS")
            print("="*80)
            print(f"Frames received: {stats['frames_received']}")
            print(f"Frame errors: {stats['frames_errors']}")
            print(f"Error rate: {stats['error_rate']*100:.2f}%")
            print(f"Connection attempts: {stats['connection_attempts']}")
            print(f"Unique targets tracked: {stats['tracked_targets']}")
            print("="*80)
    else:
        print("\n❌ Failed to connect to radar!")
        print("Please check:")
        print("  1. Radar is powered on")
        print("  2. Network cable is connected")
        print("  3. IP address 192.168.150.111 is reachable")
        print("  4. No other application is using port 50000")
        print("\nTry: ping 192.168.150.111")


if __name__ == "__main__":
    test_radar_connection()


