from flask import Flask, jsonify, request, send_from_directory
import csv
import os
import json

app = Flask(__name__, static_folder='.')

# Configuration
DATA_FILE = 'pump_sensor_data_2000_anomaly.csv'
ALERTS_FILE = 'dynamic_alerts.json'

def load_data():
    results = []
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Convert numeric values
                for k, v in row.items():
                    if k != 'timestamp' and k != 'machine_status':
                        try:
                            row[k] = float(v)
                        except ValueError:
                            pass
                results.append(row)
    return results

def load_alerts():
    if os.path.exists(ALERTS_FILE):
        try:
            with open(ALERTS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_alerts(alerts):
    with open(ALERTS_FILE, 'w') as f:
        json.dump(alerts, f, indent=2)

# --- Routes ---

@app.route('/')
def index():
    print(">>> Serving index.html from:", os.path.abspath('index.html'))
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# 1. Exposed API for "Any Role"
@app.route('/api/v1/data', methods=['GET'])
def get_sensor_data():
    """
    Public API endpoint exposed for external access.
    Returns the full sensor dataset.
    """
    data = load_data()
    return jsonify({
        "status": "success",
        "count": len(data),
        "data": data
    })

# 2. Dynamic Alerts API
@app.route('/api/v1/alerts', methods=['GET', 'POST'])
def manage_alerts():
    """
    API to Manage User-Created Alerts
    """
    if request.method == 'POST':
        # New Alert
        new_alert = request.json
        alerts = load_alerts()
        alerts.append(new_alert)
        save_alerts(alerts)
        return jsonify({"status": "created", "alert": new_alert})
    
    # List Alerts
    return jsonify(load_alerts())

if __name__ == '__main__':
    print("Industrial Dashboard Backend Running on http://localhost:5000")
    print("API Access: http://localhost:5000/api/v1/data")
    app.run(port=5000, debug=True)
