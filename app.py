import pandas as pd
from flask import Flask, jsonify, send_from_directory
from datetime import datetime
from inference import run_inference
import os

app = Flask(__name__, static_folder='.')

# --- Production Data Loading ---
DATA_FILE = 'pump_sensor_data_2000_anomaly.csv'
if not os.path.exists(DATA_FILE):
    # Fallback to previous name if user didn't rename
    DATA_FILE = 'pump_sensor_sequence_1000_records.csv'

print(f"Loading ingestion buffer from {DATA_FILE}...")
df = pd.read_csv(DATA_FILE)
DATA = df.to_dict("records")
TOTAL_RECORDS = len(DATA)
CURRENT_INDEX = 0

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/live', methods=['GET'])
def get_live():
    """
    TASK 3: Real-Time Stream Simulator
    Processes one record per call to emulate industrial telemetry.
    """
    global CURRENT_INDEX
    
    if CURRENT_INDEX >= TOTAL_RECORDS:
        return jsonify({
            "status": "COMPLETED",
            "message": "Dataset stream exhausted.",
            "record_number": TOTAL_RECORDS,
            "total_records": TOTAL_RECORDS
        })
        
    # 1. Simulate Live Reading
    row = DATA[CURRENT_INDEX]
    CURRENT_INDEX += 1
    
    # 2. Invoke ML pipeline
    results = run_inference(row)
    
    # 3. Construct Payload (Task 3 Requirement)
    payload = {
        "record_number": CURRENT_INDEX,
        "total_records": TOTAL_RECORDS,
        "timestamp": row.get('timestamp', datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        "sensor_values": results["sensor_values"],
        "sensor_states": results["sensor_states"],
        "sensor_anomaly_counts": results["sensor_anomaly_counts"],
        "total_anomalies": results["total_anomalies"],
        "system_status": results["system_status"],
        "reconstruction_error": results["reconstruction_error"]
    }
    
    return jsonify(payload)

@app.route('/api/admin/reset', methods=['POST'])
def reset_stream():
    global CURRENT_INDEX
    CURRENT_INDEX = 0
    return jsonify({"status": "Stream Reset Successful"})

if __name__ == '__main__':
    print(f"Production Monitor Active: {TOTAL_RECORDS} records ready.")
    app.run(host='0.0.0.0', port=5000, debug=False)
