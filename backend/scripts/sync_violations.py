
import os
import argparse
import json
from datetime import datetime
import sys

# Add project root to path
sys.path.append('/home/jetson/Violation_Pipeline_New')

# Import the client function
from violation_pipeline.central_server_client import send_violation_to_central_server

OUTPUT_DIR = "/home/jetson/Violation_Pipeline_New/output"

def parse_timestamp_from_dirname(dirname):
    # dirname format: rider_{id}_{YYYYMMDD}_{HHMMSS}_{microseconds}
    # Example: rider_101_20260131_064358_266417
    parts = dirname.split('_')
    if len(parts) >= 4:
        date_str = parts[-3] # 20260131
        time_str = parts[-2] # 064358
        micro_str = parts[-1] # 266417
        
        dt_str = f"{date_str}{time_str}.{micro_str}"
        try:
            return datetime.strptime(dt_str, "%Y%m%d%H%M%S.%f")
        except ValueError:
            return None
    return None

def main():
    parser = argparse.ArgumentParser(description="Sync local violations to dashboard")
    parser.add_argument("--sync", action="store_true", help="Actually perform sync (default is dry-run/count)")
    args = parser.parse_args()

    total_count = 0
    sync_count = 0
    failed_count = 0

    print(f"Scanning {OUTPUT_DIR}...")
    
    # Iterate over violation types
    for viol_type in os.listdir(OUTPUT_DIR):
        type_path = os.path.join(OUTPUT_DIR, viol_type)
        if not os.path.isdir(type_path):
            continue
            
        print(f"\nProcessing violation type: {viol_type}")
        
        # Iterate over violation instances
        instances = os.listdir(type_path)
        instances.sort() # Process in order
        
        for instance_dir in instances:
            instance_path = os.path.join(type_path, instance_dir)
            if not os.path.isdir(instance_path):
                continue
            
            total_count += 1
            
            # 1. Parse Timestamp
            timestamp = parse_timestamp_from_dirname(instance_dir)
            if not timestamp:
                print(f"  [SKIP] Could not parse timestamp from {instance_dir}")
                continue
                
            # 2. Check for metadata and images
            metadata_path = os.path.join(instance_path, "metadata.json")
            snapshot_path = os.path.join(instance_path, "violation_snapshot.jpg")
            vehicle_path = os.path.join(instance_path, "vehicle_crop.jpg")
            plate_path = os.path.join(instance_path, "plate_crop.jpg") # Assuming name
            video_path = os.path.join(instance_path, "violation_video.mp4") # Assuming name
            
            if not os.path.exists(metadata_path):
                print(f"  [SKIP] No metadata.json in {instance_dir}")
                continue
                
            plate_text = "UNKNOWN"
            plate_conf = 0.0
            rider_conf = 0.0
            speed = 0.0
            metadata = {}
            
            # Try to load metadata.json
            valid_metadata = False
            if os.path.exists(metadata_path):
                with open(metadata_path, 'r') as f:
                    try:
                        metadata = json.load(f)
                        valid_metadata = True
                        plate_text = metadata.get('plate_text', 'UNKNOWN')
                        plate_conf = metadata.get('plate_conf', 0.0)
                        rider_conf = metadata.get('rider_conf', 0.0)
                        speed = metadata.get('speed', 0.0)
                    except:
                        # Corrupted JSON
                        pass
            
            # Fallback to license_number.txt if metadata is missing or invalid
            license_path = os.path.join(instance_path, "license_number.txt")
            if not valid_metadata and os.path.exists(license_path):
                print(f"  [RECOVER] Using license_number.txt for {instance_dir}")
                try:
                    with open(license_path, 'r') as f:
                        for line in f:
                            if "License Plate Number:" in line:
                                plate_text = line.split(":")[1].strip()
                            elif "Detection Confidence:" in line:
                                try:
                                    plate_conf = float(line.split(":")[1].strip())
                                except: pass
                            elif "Speed:" in line:
                                try:
                                    speed = float(line.split(":")[1].strip().split()[0])
                                except: pass
                    # Since we recovered, treat as valid enough to sync
                    valid_metadata = True 
                except Exception as e:
                    print(f"  [FAIL] Could not parse license_number.txt: {e}")

            if not valid_metadata:
                print(f"  [SKIP] No valid metadata found for {instance_dir}")
                continue

            if args.sync:
                print(f"  Syncing {instance_dir}...", end="", flush=True)
                
                # Construct arguments for send_violation_to_central_server
                # Note: mapped names in client are: 
                # snapshot_image_path, plate_image_path, vehicle_image_path, video_image_path
                
                success = send_violation_to_central_server(
                    camera_id=1, 
                    camera_name="MAIN_GATE", 
                    violation_type=viol_type,
                    plate_number=plate_text,
                    plate_confidence=plate_conf,
                    plate_image_path=plate_path if os.path.exists(plate_path) else None,
                    snapshot_image_path=snapshot_path if os.path.exists(snapshot_path) else None,
                    vehicle_image_path=vehicle_path if os.path.exists(vehicle_path) else None,
                    video_image_path=video_path if os.path.exists(video_path) else None,
                    confidence=rider_conf,
                    speed=speed,
                    timestamp=timestamp,
                    metadata=metadata 
                )
                
                if success:
                    print(" DONE")
                    sync_count += 1
                else:
                    print(" FAILED")
                    failed_count += 1
            else:
                # Dry run - just list
                # print(f"  Found: {instance_dir} ({timestamp})")
                pass

    print(f"\n========================================")
    print(f"Total Violations Found: {total_count}")
    if args.sync:
        print(f"Successfully Synced:    {sync_count}")
        print(f"Failed to Sync:         {failed_count}")
    else:
        print(f"Run with --sync to upload these violations.")
    print(f"========================================")

if __name__ == "__main__":
    main()
