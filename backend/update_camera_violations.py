#!/usr/bin/env python3
"""
Script to update camera violations configuration
"""
import sqlite3
import json
import sys
import os

def update_camera_violations(camera_id, violations):
    """Update the enabled violations for a camera"""
    db_path = 'data/violation_pipeline.db'
    
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get current camera configuration
        cursor.execute('SELECT id, name, enabled_violations FROM cameras WHERE id = ?', (camera_id,))
        camera = cursor.fetchone()
        
        if not camera:
            print(f"Error: Camera with ID {camera_id} not found")
            conn.close()
            return False
        
        cam_id, name, current_violations_str = camera
        print(f'Camera: {name} (ID: {cam_id})')
        print(f'Current violations: {current_violations_str}')
        
        # Update violations
        new_violations_json = json.dumps(violations)
        
        cursor.execute('UPDATE cameras SET enabled_violations = ? WHERE id = ?', 
                       (new_violations_json, cam_id))
        conn.commit()
        conn.close()
        
        print(f'Updated violations: {new_violations_json}')
        print('✓ Camera configuration updated successfully!')
        return True
        
    except sqlite3.OperationalError as e:
        print(f"Database error: {e}")
        print("\nThe database file needs write permissions.")
        print("Run this command to fix permissions:")
        print(f"  sudo chown jetson:jetson {db_path}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    # Update camera 5 to include seatbelt detection
    violations = ['helmet', 'triple_riding', 'seatbelt']
    success = update_camera_violations(5, violations)
    sys.exit(0 if success else 1)







