"""
Advanced Anomaly Detection for Industrial Pumps
Phase 3: Real-Time Backend API with Database Integration

This server handles:
1. Continuous sensor data ingestion (REST endpoint for external systems)
2. Real-time ML inference using LSTM Autoencoder
3. Database persistence (Supabase)
4. Dashboard API endpoints
"""

from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import pandas as pd
import os
import threading
import time
from datetime import datetime, timedelta
from inference_engine import engine
from stream_processor import stream_processor

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("Warning: Supabase not available, using in-memory mode")

app = Flask(__name__, static_folder='.')
CORS(app)

# Initialize Supabase
supabase = None
if SUPABASE_AVAILABLE:
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_ANON_KEY')
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
        print("✅ Supabase connected")

# Start stream processor
stream_processor.start()

# --- CSV Simulation Mode (for demo) ---
DATA_FILE = 'pump_sensor_data_2000_anomaly.csv'
if not os.path.exists(DATA_FILE):
    DATA_FILE = 'pump_sensor_sequence_1000_records.csv'

df = pd.read_csv(DATA_FILE) if os.path.exists(DATA_FILE) else pd.DataFrame()
DATA_RECORDS = df.to_dict('records') if not df.empty else []
CURRENT_RECORD_INDEX = 0
SIMULATION_RUNNING = False

def simulate_data_stream():
    """Background thread to simulate continuous data stream"""
    global CURRENT_RECORD_INDEX, SIMULATION_RUNNING
    print("🔄 Starting data simulation thread...")

    while SIMULATION_RUNNING and CURRENT_RECORD_INDEX < len(DATA_RECORDS):
        row = DATA_RECORDS[CURRENT_RECORD_INDEX]
        stream_processor.ingest(row)
        CURRENT_RECORD_INDEX += 1
        time.sleep(1)  # 1 second per reading

    print("✅ Simulation complete")
    SIMULATION_RUNNING = False

# --- API Endpoints ---

@app.route('/')
def home():
    """Serve the dashboard UI."""
    return send_from_directory('.', 'index.html')

@app.route('/api/ingest', methods=['POST'])
def ingest_sensor_data():
    """
    External endpoint for real-time sensor data ingestion
    IoT devices/PLCs can POST data here
    """
    try:
        sensor_data = request.json
        success = stream_processor.ingest(sensor_data)

        return jsonify({
            "success": success,
            "message": "Data queued for processing" if success else "Queue full"
        }), 200 if success else 503

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route('/api/live-data', methods=['GET'])
def get_live_data():
    """Get latest processed sensor data and inference results"""
    stats = stream_processor.get_statistics()

    if not stats['last_reading'] or not stats['last_inference']:
        return jsonify({
            "status": "INITIALIZING",
            "message": "Waiting for first data point",
            "total_processed": stats['total_processed']
        })

    sensor_values = {k: stats['last_reading'].get(k, 0) for k in engine.FEATURES}

    return jsonify({
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "record_number": stats['total_processed'],
        "total_records": stats['total_processed'],
        "values": sensor_values,
        "status": stats['last_inference'].get('status', 'NORMAL'),
        "reconstruction_error": stats['last_inference'].get('reconstruction_loss', 0),
        "threshold": stats['last_inference'].get('threshold', 0.05),
        "sensor_states": stats['last_inference'].get('sensor_states', {}),
        "sensor_anomaly_counts": stats['last_inference'].get('sensor_anomaly_counts', {}),
        "is_anomaly": stats['last_inference'].get('is_anomaly', False),
        "total_anomalies": stats['total_anomalies']
    })

@app.route('/api/sensor-history', methods=['GET'])
def get_sensor_history():
    """Get historical sensor readings from database"""
    if not supabase:
        return jsonify({"error": "Database not available"}), 503

    try:
        hours = int(request.args.get('hours', 1))
        limit = int(request.args.get('limit', 100))

        cutoff = datetime.now() - timedelta(hours=hours)

        result = supabase.table('sensor_readings')\
            .select('*')\
            .gte('timestamp', cutoff.isoformat())\
            .order('timestamp', desc=True)\
            .limit(limit)\
            .execute()

        return jsonify({
            "data": result.data,
            "count": len(result.data)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/anomaly-history', methods=['GET'])
def get_anomaly_history():
    """Get historical anomaly detections"""
    if not supabase:
        return jsonify({"error": "Database not available"}), 503

    try:
        hours = int(request.args.get('hours', 24))
        limit = int(request.args.get('limit', 100))

        cutoff = datetime.now() - timedelta(hours=hours)

        result = supabase.table('anomaly_detections')\
            .select('*')\
            .eq('is_anomaly', True)\
            .gte('timestamp', cutoff.isoformat())\
            .order('timestamp', desc=True)\
            .limit(limit)\
            .execute()

        return jsonify({
            "data": result.data,
            "count": len(result.data)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/maintenance-events', methods=['GET'])
def get_maintenance_events():
    """Get maintenance events"""
    if not supabase:
        return jsonify({"error": "Database not available"}), 503

    try:
        resolved = request.args.get('resolved', 'false').lower() == 'true'

        result = supabase.table('maintenance_events')\
            .select('*')\
            .eq('resolved', resolved)\
            .order('timestamp', desc=True)\
            .limit(50)\
            .execute()

        return jsonify({
            "data": result.data,
            "count": len(result.data)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/anomaly-status', methods=['GET'])
def get_anomaly_status():
    """Get current system anomaly status"""
    stats = stream_processor.get_statistics()

    if not stats['last_inference']:
        return jsonify({
            "system_status": "INITIALIZING",
            "reconstruction_loss": 0,
            "threshold": 0.05,
            "is_anomaly": False
        })

    return jsonify({
        "system_status": stats['last_inference'].get('status', 'NORMAL'),
        "reconstruction_loss": stats['last_inference'].get('reconstruction_loss', 0),
        "threshold": stats['last_inference'].get('threshold', 0.05),
        "is_anomaly": stats['last_inference'].get('is_anomaly', False)
    })

@app.route('/api/system-health', methods=['GET'])
def get_system_health():
    """Get system health metrics"""
    stats = stream_processor.get_statistics()

    return jsonify({
        "inference_latency_ms": stats['last_inference'].get('latency_ms', 0) if stats['last_inference'] else 0,
        "memory_usage_mb": stats['last_inference'].get('memory_mb', 0) if stats['last_inference'] else 0,
        "data_stream": "ACTIVE" if stats['is_running'] else "STOPPED",
        "model_status": "LOADED" if engine.model else "SIMULATED",
        "queue_size": stats['queue_size'],
        "total_processed": stats['total_processed']
    })

@app.route('/api/start-simulation', methods=['POST'])
def start_simulation():
    """Start CSV data simulation (for demo)"""
    global SIMULATION_RUNNING, CURRENT_RECORD_INDEX

    if SIMULATION_RUNNING:
        return jsonify({"message": "Simulation already running"}), 200

    if not DATA_RECORDS:
        return jsonify({"error": "No data file loaded"}), 400

    CURRENT_RECORD_INDEX = 0
    SIMULATION_RUNNING = True

    simulation_thread = threading.Thread(target=simulate_data_stream, daemon=True)
    simulation_thread.start()

    return jsonify({
        "message": "Simulation started",
        "total_records": len(DATA_RECORDS)
    })

@app.route('/api/stop-simulation', methods=['POST'])
def stop_simulation():
    """Stop CSV data simulation"""
    global SIMULATION_RUNNING
    SIMULATION_RUNNING = False
    return jsonify({"message": "Simulation stopped"})

# --- Static File Serving ---
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

if __name__ == "__main__":
    print("=" * 60)
    print("🏭 INDUSTRIAL PUMP MONITORING SYSTEM")
    print("=" * 60)
    print(f"✅ Stream Processor: Active")
    print(f"✅ ML Engine: {'Loaded' if engine.model else 'Simulated'}")
    print(f"✅ Database: {'Connected' if supabase else 'In-Memory Mode'}")
    print()
    print("📡 API Endpoints:")
    print("  POST /api/ingest              - Ingest sensor data")
    print("  GET  /api/live-data           - Latest processed data")
    print("  GET  /api/sensor-history      - Historical readings")
    print("  GET  /api/anomaly-history     - Anomaly log")
    print("  GET  /api/maintenance-events  - Maintenance events")
    print("  POST /api/start-simulation    - Start demo simulation")
    print("  POST /api/stop-simulation     - Stop demo simulation")
    print()
    print("🌐 Dashboard: http://localhost:5000")
    print("=" * 60)

    app.run(host='0.0.0.0', port=5000, debug=False)
