"""
Database models and session management for Violation Pipeline.
"""
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Boolean, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Database path from environment or default
DB_PATH = os.environ.get("DB_PATH", "/home/oem/Voilation_radar/Violation_Analytics/data/violation_pipeline.db")

# Ensure directory exists
db_dir = os.path.dirname(os.path.abspath(DB_PATH))
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.abspath(DB_PATH)}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    rtsp_url = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    speed_limit = Column(Integer, default=60)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # New fields
    enabled_violations = Column(String, default='["helmet", "triple_riding"]')
    mpp = Column(Float, nullable=True)
    wrong_side_zone = Column(String, nullable=True)
    wrong_side_direction = Column(String, nullable=True)
    camera_angle = Column(Float, nullable=True)
    camera_height_meters = Column(Float, nullable=True)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)


class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, index=True)
    violation_type = Column(String, index=True)  # helmet, speed, triple_riding, wrong_side
    plate_number = Column(String, nullable=True)
    plate_confidence = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    snapshot_path = Column(String, nullable=True)
    plate_image_path = Column(String, nullable=True)
    vehicle_image_path = Column(String, nullable=True)
    video_path = Column(String, nullable=True)  # Added video path
    synced_to_central = Column(Boolean, default=False)
    status = Column(String, default="pending")  # pending, verified, rejected
    timestamp = Column(DateTime, default=datetime.utcnow)


def init_db():
    """Create all database tables and perform migrations."""
    Base.metadata.create_all(bind=engine)
    migrate_schema()


def migrate_schema():
    """Add missing columns to existing tables."""
    try:
        with engine.connect() as conn:
            # Check cameras table for created_at
            result = conn.execute(text("PRAGMA table_info(cameras)"))
            columns = [row[1] for row in result]
            
            if "created_at" not in columns:
                print("---------- MIGRATION START ----------")
                print("⚠️  Adding missing 'created_at' column to cameras table...")
                conn.execute(text("ALTER TABLE cameras ADD COLUMN created_at DATETIME"))
                conn.commit()
                print("✅ Migration successful!")
                print("-------------------------------------")

            # Check for new camera fields
            result = conn.execute(text("PRAGMA table_info(cameras)"))
            columns = [row[1] for row in result]
            
            new_fields = {
                "enabled_violations": "TEXT DEFAULT '[\"helmet\", \"triple_riding\"]'",
                "mpp": "FLOAT",
                "wrong_side_zone": "TEXT",
                "wrong_side_direction": "TEXT",
                "camera_angle": "FLOAT",
                "camera_height_meters": "FLOAT"
            }
            
            for field, type_ in new_fields.items():
                if field not in columns:
                    print(f"⚠️  Adding missing '{field}' column to cameras table...")
                    conn.execute(text(f"ALTER TABLE cameras ADD COLUMN {field} {type_}"))
                    conn.commit()

            # Create users table if not exists (handled by create_all, but just in case)
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR,
                hashed_password VARCHAR
            )
            """))

            # Check violations table columns
            result = conn.execute(text("PRAGMA table_info(violations)"))
            columns = [row[1] for row in result]

            if "status" not in columns:
                print("---------- MIGRATION STATUS ----------")
                print("⚠️  Adding missing 'status' column to violations table...")
                conn.execute(text("ALTER TABLE violations ADD COLUMN status TEXT DEFAULT 'pending'"))
                conn.commit()
                print("✅ Status column added!")
                print("-------------------------------------")

            if "vehicle_image_path" not in columns:
                print("⚠️  Adding missing 'vehicle_image_path' column to violations table...")
                conn.execute(text("ALTER TABLE violations ADD COLUMN vehicle_image_path TEXT"))
                conn.commit()

            if "video_path" not in columns:
                print("⚠️  Adding missing 'video_path' column to violations table...")
                conn.execute(text("ALTER TABLE violations ADD COLUMN video_path TEXT"))
                conn.commit()
                
    except Exception as e:
        print(f"Migration check failed (may be harmless if table absent): {e}")


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
