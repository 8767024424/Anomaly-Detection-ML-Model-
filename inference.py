import numpy as np
import pandas as pd
import joblib
import json
import os
import warnings
warnings.filterwarnings("ignore")
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' 

# Features used in the system
FEATURES = [
    'Motor_RPM', 'Bearing_Temperature_C', 'Oil_Pressure_bar', 'Vibration_mm_s', 
    'Flow_Rate_L_min', 'Suction_Pressure_bar', 'Discharge_Pressure_bar', 
    'Motor_Current_A', 'Casing_Temperature_C', 'Ambient_Temperature_C'
]

WINDOW_SIZE = 30

# Global State
BUFFER = []
PREVIOUS_SENSOR_STATES = {f: "NORMAL" for f in FEATURES}
SENSOR_ANOMALY_COUNTS = {f: 0 for f in FEATURES}
THRESHOLD = 0.0622 # Default from notebook

# Artifacts
MODEL = None
SCALER = None

def load_artifacts():
    global MODEL, SCALER, THRESHOLD
    
    # 1. Load Scaler
    scaler_paths = ['lstm_scaler.pkl', 'scaler.pkl']
    for p in scaler_paths:
        if os.path.exists(p):
            try:
                SCALER = joblib.load(p)
                print(f"Scaler loaded from {p}")
                break
            except: pass
            
    # 2. Load Model
    try:
        import tensorflow as tf
        model_paths = ['lstm_model.h5', 'model.pkl', 'lstm_model.pkl']
        for p in model_paths:
            if os.path.exists(p):
                try:
                    if p.endswith('.h5'):
                        MODEL = tf.keras.models.load_model(p)
                    else:
                        MODEL = joblib.load(p)
                    print(f"Model loaded from {p}")
                    break
                except: pass
    except ImportError:
        print("TensorFlow not found. Using fallback inference.")

    # 3. Load Threshold
    if os.path.exists('lstm_threshold.json'):
        try:
            with open('lstm_threshold.json', 'r') as f:
                THRESHOLD = json.load(f).get('anomaly_threshold', THRESHOLD)
        except: pass

# Initialize
load_artifacts()

def run_inference(row: dict) -> dict:
    """
    Production inference: Scale -> Window -> Predict -> Event-based Count.
    """
    global BUFFER, PREVIOUS_SENSOR_STATES, SENSOR_ANOMALY_COUNTS
    
    # 1. Prepare current sample
    current_values = [float(row.get(f, 0)) for f in FEATURES]
    BUFFER.append(current_values)
    
    # Warm-up phase
    if len(BUFFER) < WINDOW_SIZE:
        return {
            "system_status": "LEARNING",
            "sensor_values": {f: row.get(f, 0) for f in FEATURES},
            "sensor_states": {f: "NORMAL" for f in FEATURES},
            "sensor_anomaly_counts": SENSOR_ANOMALY_COUNTS,
            "total_anomalies": sum(SENSOR_ANOMALY_COUNTS.values()),
            "reconstruction_error": 0.0
        }
    
    if len(BUFFER) > WINDOW_SIZE:
        BUFFER.pop(0)
        
    # 2. Preprocessing
    sequence = np.array(BUFFER).reshape(1, WINDOW_SIZE, len(FEATURES))
    if SCALER:
        # Scaling requires flattening and reshaping back
        seq_flattened = sequence.reshape(-1, len(FEATURES))
        seq_scaled = SCALER.transform(seq_flattened)
        sequence = seq_scaled.reshape(1, WINDOW_SIZE, len(FEATURES))
    
    # 3. Predict & Reconstruction Error
    recon_error = 0.0
    sensor_errors = {f: 0.0 for f in FEATURES}
    
    if MODEL:
        try:
            pred = MODEL.predict(sequence, verbose=0)
            diff = np.abs(pred - sequence)
            recon_error = float(np.mean(diff))
            
            # Per-sensor error (average over window for specific sensor)
            sensor_diffs = np.mean(diff, axis=(0, 1))
            sensor_errors = {FEATURES[i]: float(sensor_diffs[i]) for i in range(len(FEATURES))}
        except:
            pass # Fallback to 0
    else:
        # Fallback: Rolling deviation
        win_arr = np.array(BUFFER)
        means = np.mean(win_arr, axis=0)
        stds = np.std(win_arr, axis=0) + 1e-6
        recon_error = float(np.mean(np.abs(current_values - means) / (stds * 10))) # Scale heuristic
        sensor_errors = {FEATURES[i]: float(np.abs(current_values[i] - means[i]) / (stds[i] * 10)) for i in range(len(FEATURES))}

    # 4. EVENT-BASED ANOMALY COUNT (Task 2)
    current_sensor_states = {}
    system_status = "NORMAL"
    if recon_error > THRESHOLD:
        system_status = "WARNING"
        if recon_error > THRESHOLD * 2: system_status = "CRITICAL"

    # Identify which sensors are in ANOMALY state
    # Sensort-wise threshold logic
    for f in FEATURES:
        # Heuristic: if sensor contribution > avg contribution expected at threshold
        is_anomalous = sensor_errors[f] > (THRESHOLD / len(FEATURES))
        current_state = "ANOMALY" if is_anomalous else "NORMAL"
        current_sensor_states[f] = current_state
        
        # LOGIC: NORMAL -> ANOMALY transition only
        if current_state == "ANOMALY" and PREVIOUS_SENSOR_STATES[f] == "NORMAL":
            SENSOR_ANOMALY_COUNTS[f] += 1
            
        PREVIOUS_SENSOR_STATES[f] = current_state

    return {
        "system_status": system_status,
        "sensor_values": {f: row.get(f, 0) for f in FEATURES},
        "sensor_states": current_sensor_states,
        "sensor_anomaly_counts": SENSOR_ANOMALY_COUNTS,
        "total_anomalies": sum(SENSOR_ANOMALY_COUNTS.values()),
        "reconstruction_error": round(recon_error, 5)
    }
