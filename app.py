"""
Advanced Anomaly Detection for Industrial Pumps
Phase 3: Backend API Layer (FastAPI Style but using Flask for Compatibility)

This server exposes REST endpoints for the industrial dashboard.
It simulates real-time data ingestion from a CSV file.
"""

from flask import Flask, jsonify, send_from_directory
import pandas as pd
import os
import time
from datetime import datetime
from inference_engine import engine

app = Flask(__name__, static_folder='.')

# --- Data Ingestion Layer ---
DATA_FILE = 'pump_sensor_data_2000_anomaly.csv'
if not os.path.exists(DATA_FILE):
    DATA_FILE = 'pump_sensor_sequence_1000_records.csv'

# Load dataset into memory for simulation
print(f"Loading data for ingestion simulation from {DATA_FILE}...")
df = pd.read_csv(DATA_FILE)
DATA_RECORDS = df.to_dict('records')
CURRENT_RECORD_INDEX = 0

# --- State Store ---
# Holds the last processed result for decoupled API access
LATEST_INFERENCE_RESULT = {
    "status": "INITIALIZING",
    "sensor_values": {},
    "reconstruction_loss": 0,
    "latency_ms": 0,
    "memory_mb": 0,
    "total_anomalies": 0,
    "recent_anomalies": 0,
    "sensor_states": {},
    "sensor_anomaly_counts": {},
    "timestamp": None
}

def get_next_sensor_reading():
    """Simulates 1 row per second stream."""
    global CURRENT_RECORD_INDEX
    if CURRENT_RECORD_INDEX >= len(DATA_RECORDS):
        return None
    
    row = DATA_RECORDS[CURRENT_RECORD_INDEX]
    CURRENT_RECORD_INDEX += 1
    return row

# --- API Endpoints ---

@app.route('/')
def home():
    """Serve the dashboard UI."""
    return send_from_directory('.', 'index.html')

@app.route('/api/live-data', methods=['GET'])
def get_live_data():
    """
    Simulates real-time sensor stream.
    Each call processes one new row from the dataset.
    """
    global LATEST_INFERENCE_RESULT
    # 1. Ingest next reading
    raw_row = get_next_sensor_reading()
    if raw_row is None:
        return jsonify({
            "status": "COMPLETED",
            "record_number": len(DATA_RECORDS),
            "total_records": len(DATA_RECORDS),
            "timestamp": datetime.now().strftime("%H:%M:%S")
        })
    
    # 2. Perform Inference
    inference_out = engine.run_inference(raw_row)
    
    # 3. Cache & Augment Result
    timestamp = datetime.now().strftime("%H:%M:%S")
    LATEST_INFERENCE_RESULT = {
        "timestamp": timestamp,
        "sensor_values": {k: raw_row[k] for k in engine.FEATURES},
        **inference_out
    }
    
    return jsonify({
        "timestamp": timestamp,
        "record_number": CURRENT_RECORD_INDEX,
        "total_records": len(DATA_RECORDS),
        "values": LATEST_INFERENCE_RESULT["sensor_values"],
        "status": LATEST_INFERENCE_RESULT["status"],
        "reconstruction_error": LATEST_INFERENCE_RESULT["reconstruction_loss"],
        "threshold": LATEST_INFERENCE_RESULT["threshold"],
        "sensor_states": LATEST_INFERENCE_RESULT["sensor_states"],
        "sensor_anomaly_counts": LATEST_INFERENCE_RESULT["sensor_anomaly_counts"]
    })

@app.route('/api/anomaly-status', methods=['GET'])
def get_anomaly_status():
    """Exposes current system state and reconstruction metrics."""
    return jsonify({
        "system_status": LATEST_INFERENCE_RESULT["status"],
        "reconstruction_loss": LATEST_INFERENCE_RESULT["reconstruction_loss"],
        "threshold": LATEST_INFERENCE_RESULT["threshold"],
        "is_anomaly": LATEST_INFERENCE_RESULT["is_anomaly"]
    })

@app.route('/api/anomaly-count', methods=['GET'])
def get_anomaly_count():
    """Exposes total and recent anomaly counts."""
    return jsonify({
        "total": LATEST_INFERENCE_RESULT["total_anomalies"],
        "last_hour": LATEST_INFERENCE_RESULT["recent_anomalies"],
        "per_sensor": LATEST_INFERENCE_RESULT["sensor_anomaly_counts"]
    })

@app.route('/api/system-health', methods=['GET'])
def get_system_health():
    """Exposes performance metrics (benchmarking)."""
    return jsonify({
        "inference_latency_ms": LATEST_INFERENCE_RESULT["latency_ms"],
        "memory_usage_mb": LATEST_INFERENCE_RESULT["memory_mb"],
        "data_stream": "ACTIVE",
        "model_status": "LOADED" if engine.model else "SIMULATED"
    })

# --- Static File Serving ---
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

if __name__ == "__main__":
    print(f"--- End-to-End Anomaly Detection Backend Active ---")
    print(f"API Endpoints available:")
    print(f" - GET /api/live-data")
    print(f" - GET /api/anomaly-status")
    print(f" - GET /api/anomaly-count")
    print(f" - GET /api/system-health")
    app.run(host='0.0.0.0', port=5000, debug=False)
