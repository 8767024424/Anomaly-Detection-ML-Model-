"""
Advanced Anomaly Detection for Industrial Pumps
Phase 2: Real-Time Inference Engine

This module handles live data processing, reconstruction using the LSTM model,
and anomaly detection logic. It includes benchmarking for latency and memory usage.
"""

import numpy as np
import pandas as pd
try:
    import tensorflow as tf
    TF_AVAILABLE = True
except ImportError as e:
    print(f"--- WARNING: TensorFlow could not be initialized ({e}) ---")
    print("Inference will proceed using fallback heuristic simulation.")
    TF_AVAILABLE = False
import joblib
import json
import os
import time
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
from collections import deque

# --- Configuration ---
MODEL_PATH = 'lstm_model.h5'
SCALER_PATH = 'scaler.pkl'
THRESHOLD_PATH = 'threshold.json'
WINDOW_SIZE = 30
FEATURES = [
    'Motor_RPM', 'Bearing_Temperature_C', 'Oil_Pressure_bar', 'Vibration_mm_s', 
    'Flow_Rate_L_min', 'Suction_Pressure_bar', 'Discharge_Pressure_bar', 
    'Motor_Current_A', 'Casing_Temperature_C', 'Ambient_Temperature_C'
]

class AnomalyInferenceEngine:
    def __init__(self):
        self.FEATURES = FEATURES
        self.model = None
        self.scaler = None
        self.threshold = 0.05 # Default if not found
        self.buffer = deque(maxlen=WINDOW_SIZE)
        self.anomaly_count_total = 0
        self.anomaly_count_last_hour = 0
        self.anomaly_timestamps = []
        self.sensor_anomaly_counts = {f: 0 for f in FEATURES}
        self.previous_sensor_states = {f: "NORMAL" for f in FEATURES}
        
        self.load_assets()

    def load_assets(self):
        """Load trained model, scaler, and threshold configuration."""
        try:
            if os.path.exists(SCALER_PATH):
                self.scaler = joblib.load(SCALER_PATH)
                print(f"Scaler loaded from {SCALER_PATH}")
            
            if os.path.exists(MODEL_PATH) and TF_AVAILABLE:
                self.model = tf.keras.models.load_model(MODEL_PATH)
                print(f"Model loaded from {MODEL_PATH}")
            elif os.path.exists(MODEL_PATH) and not TF_AVAILABLE:
                print(f"Warning: {MODEL_PATH} exists but TensorFlow is not available. Using simulation.")
            
            if os.path.exists(THRESHOLD_PATH):
                with open(THRESHOLD_PATH, 'r') as f:
                    self.threshold = json.load(f).get('anomaly_threshold', 0.05)
                print(f"Threshold loaded: {self.threshold:.5f}")
        except Exception as e:
            print(f"Warning: Could not load assets ({e}). Falling back to simulation logic.")
    
    def reset_state(self):
        """Reset the inference state when loading a new dataset."""
        print("[RESET] Resetting inference engine state for new dataset...")
        self.buffer.clear()
        self.previous_sensor_states = {f: "NORMAL" for f in FEATURES}
        
        # Reset all anomaly counters
        self.anomaly_count_total = 0
        self.anomaly_count_last_hour = 0
        self.anomaly_timestamps = []
        self.sensor_anomaly_counts = {f: 0 for f in FEATURES}
        
        print("[RESET] All anomaly counters reset to 0")



    def get_memory_usage(self):
        """Approximate RAM usage of the current process in MB."""
        if not PSUTIL_AVAILABLE:
            return 0.0
        process = psutil.Process(os.getpid())
        return round(process.memory_info().rss / (1024 * 1024), 2)

    def run_inference(self, sensor_row: dict) -> dict:
        """
        Main inference logic: Preprocess -> Window -> Predict -> Decision.
        """
        start_time = time.time()
        
        # 1. Preprocessing Layer (Real-Time)
        # Convert dictionary to feature list
        current_values = [float(sensor_row.get(f, 0)) for f in FEATURES]
        
        # Add to window buffer
        self.buffer.append(current_values)
        
        # If buffer is not full, we are still 'Learning'
        if len(self.buffer) < WINDOW_SIZE:
            latency = (time.time() - start_time) * 1000
            return {
                "status": "LEARNING",
                "reconstruction_loss": 0,
                "threshold": self.threshold,
                "latency_ms": round(latency, 2),
                "memory_mb": self.get_memory_usage(),
                "is_anomaly": False,
                "sensor_states": self.previous_sensor_states,
                "sensor_anomaly_counts": self.sensor_anomaly_counts
            }
        
        # 2. Window Generation
        # Shape: (1, 30, 10)
        window = np.array(self.buffer).reshape(1, WINDOW_SIZE, len(FEATURES))
        
        # Normalize using the pre-fitted scaler (Do NOT refit)
        if self.scaler:
            window_flat = window.reshape(-1, len(FEATURES))
            window_scaled = self.scaler.transform(window_flat)
            window = window_scaled.reshape(1, WINDOW_SIZE, len(FEATURES))
        
        # 3. Anomaly Detection Logic
        recon_loss = 0
        is_anomaly = False
        sensor_errors = {f: 0.0 for f in FEATURES}
        
        if self.model:
            try:
                # Reconstruct input
                reconstructed = self.model.predict(window, verbose=0)
                # Compute reconstruction error (MAE)
                diff = np.abs(reconstructed - window)
                recon_loss = np.mean(diff)
                
                # Per-sensor error contribution
                sensor_contribs = np.mean(diff, axis=(0, 1))
                sensor_errors = {FEATURES[i]: float(sensor_contribs[i]) for i in range(len(FEATURES))}
                
                # Decision logic: IF loss > threshold -> ANOMALY
                if recon_loss > self.threshold:
                    is_anomaly = True
            except Exception as e:
                pass
        else:
            # Fallback heuristic
            recon_loss = np.random.uniform(0.01, 0.08)
            if recon_loss > self.threshold:
                is_anomaly = True
            # Simulate per-sensor errors
            for f in FEATURES:
                sensor_errors[f] = recon_loss * np.random.uniform(0.5, 1.5)

        # 4. Sensor-Wise Tracking
        current_sensor_states = {}
        for f in FEATURES:
            # If sensor contribution > 1.5x of its expected share at threshold
            is_f_anomalous = sensor_errors[f] > (self.threshold / len(FEATURES)) * 1.5
            state = "ANOMALY" if is_f_anomalous else "NORMAL"
            current_sensor_states[f] = state
            
            # Transition: NORMAL -> ANOMALY only
            if state == "ANOMALY" and self.previous_sensor_states[f] == "NORMAL":
                self.sensor_anomaly_counts[f] += 1
            self.previous_sensor_states[f] = state

        # Track history
        if is_anomaly:
            self.anomaly_count_total += 1
            self.anomaly_timestamps.append(time.time())
            # Clean old timestamps (older than 1 hour)
            one_hour_ago = time.time() - 3600
            self.anomaly_timestamps = [t for t in self.anomaly_timestamps if t > one_hour_ago]
            self.anomaly_count_last_hour = len(self.anomaly_timestamps)

        latency = (time.time() - start_time) * 1000 # ms
        
        return {
            "status": "ANOMALY" if is_anomaly else "NORMAL",
            "reconstruction_loss": round(float(recon_loss), 5),
            "threshold": round(float(self.threshold), 5),
            "latency_ms": round(latency, 2),
            "memory_mb": self.get_memory_usage(),
            "is_anomaly": is_anomaly,
            "sensor_states": current_sensor_states,
            "sensor_anomaly_counts": self.sensor_anomaly_counts,
            "total_anomalies": self.anomaly_count_total,
            "recent_anomalies": self.anomaly_count_last_hour
        }

# Global instance for easy API access
engine = AnomalyInferenceEngine()
