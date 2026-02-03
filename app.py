"""
Advanced Anomaly Detection for Industrial Pumps
Phase 3: Backend API Layer (FastAPI Style but using Flask for Compatibility)

This server exposes REST endpoints for the industrial dashboard.
It simulates real-time data ingestion from a CSV file.
"""

from flask import Flask, jsonify, send_from_directory, request
from werkzeug.utils import secure_filename
import pandas as pd
import os
import time
from datetime import datetime
from inference_engine import engine

app = Flask(__name__, static_folder='.')

# File upload configuration
UPLOAD_FOLDER = '.'
ALLOWED_EXTENSIONS = {'csv'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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
    
    # Stop at the end - do not loop
    if CURRENT_RECORD_INDEX >= len(DATA_RECORDS):
        return None
    
    row = DATA_RECORDS[CURRENT_RECORD_INDEX]
    CURRENT_RECORD_INDEX += 1
    return row

def reload_data_from_file(filepath):
    """Reload data from a new CSV file and reset all state."""
    global DATA_FILE, df, DATA_RECORDS, CURRENT_RECORD_INDEX, LATEST_INFERENCE_RESULT
    
    print(f"[RELOAD] Reloading data from {filepath}...")
    
    # Load new dataset
    DATA_FILE = filepath
    df = pd.read_csv(DATA_FILE)
    DATA_RECORDS = df.to_dict('records')
    CURRENT_RECORD_INDEX = 0
    
    # Reset ML state
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
        "timestamp": None,
        "threshold": 0.05,
        "is_anomaly": False
    }
    
    # Reset inference engine state
    if hasattr(engine, 'reset_state'):
        engine.reset_state()
    
    print(f"[SUCCESS] Data reloaded: {len(DATA_RECORDS)} records from {os.path.basename(filepath)}")
    return len(DATA_RECORDS)


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
    Stops when reaching the end.
    """
    global LATEST_INFERENCE_RESULT
    
    # 1. Ingest next reading
    raw_row = get_next_sensor_reading()
    
    # Handle completion - dataset finished
    if raw_row is None:
        return jsonify({
            "status": "COMPLETED",
            "record_number": len(DATA_RECORDS),
            "total_records": len(DATA_RECORDS),
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "values": LATEST_INFERENCE_RESULT.get("sensor_values", {}),
            "reconstruction_error": LATEST_INFERENCE_RESULT.get("reconstruction_loss", 0),
            "sensor_states": LATEST_INFERENCE_RESULT.get("sensor_states", {}),
            "sensor_anomaly_counts": LATEST_INFERENCE_RESULT.get("sensor_anomaly_counts", {}),
            "threshold": LATEST_INFERENCE_RESULT.get("threshold", 0.05),
            "total_anomalies": LATEST_INFERENCE_RESULT.get("total_anomalies", 0)
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

@app.route('/api/admin/upload-data', methods=['POST'])
def upload_data():
    """Admin endpoint to upload and reload a new CSV dataset."""
    try:
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Validate file type
        if not allowed_file(file.filename):
            return jsonify({"error": "Invalid file type. Only CSV files are allowed."}), 400
        
        # Secure the filename
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Save the file
        file.save(filepath)
        print(f"[UPLOAD] File saved: {filepath}")
        
        # Reload data into memory
        total_records = reload_data_from_file(filepath)
        
        return jsonify({
            "success": True,
            "message": f"Data reloaded successfully",
            "filename": filename,
            "total_records": total_records,
            "filepath": filepath
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Upload error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/reset-counters', methods=['POST'])
def reset_counters():
    """Reset anomaly counters and ML state."""
    global CURRENT_RECORD_INDEX, LATEST_INFERENCE_RESULT
    
    CURRENT_RECORD_INDEX = 0
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
        "timestamp": None,
        "threshold": 0.05,
        "is_anomaly": False
    }
    
    if hasattr(engine, 'reset_state'):
        engine.reset_state()
    
    return jsonify({"success": True, "message": "Counters reset successfully"}), 200


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
    app.run(host='0.0.0.0', port=5002, debug=False)

