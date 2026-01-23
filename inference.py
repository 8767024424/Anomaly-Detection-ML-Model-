
import pandas as pd
import numpy as np
import joblib
import json
from sklearn.metrics import classification_report, confusion_matrix
from load_data import load_pump_data

# Configuration
OUTPUT_FILE = "inference_results.csv"
MODEL_PATH = "model.pkl"
SCALER_PATH = "scaler.pkl"
THRESHOLD_PATH = "threshold.json"
FEATURES = ['Motor_RPM', 'Bearing_Temperature_C', 'Oil_Pressure_bar', 'Vibration_mm_s', 
            'Flow_Rate_L_min', 'Suction_Pressure_bar', 'Discharge_Pressure_bar', 
            'Motor_Current_A', 'Casing_Temperature_C', 'Ambient_Temperature_C']

def main():
    print("Loading resources...")
    df = load_pump_data()
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    
    with open(THRESHOLD_PATH, 'r') as f:
        config = json.load(f)
        threshold = config['anomaly_threshold']
        
    print(f"Loaded model and threshold: {threshold}")
    
    # Preprocess
    X = df[FEATURES]
    X_scaled = scaler.transform(X)
    
    # Inference
    print("Running inference...")
    scores = model.score_samples(X_scaled)
    # Isolation Forest: Lower score = more anomalous
    
    # Add columns
    df['anomaly_score'] = scores
    # If score < threshold, it is an anomaly (since threshold is 1st percentile of normal -> low value)
    # Wait, usually score_samples yields negative values? 
    # Yes, typically -0.5 to -0.8 for outliers.
    # threshold was -0.54 (approx).
    # So if score < -0.54 -> Anomaly.
    
    df['is_anomaly'] = df['anomaly_score'] < threshold
    
    # Validate against Ground Truth (machine_status)
    # Treat BROKEN as Anomaly, RECOVERING as Anomaly? Or just BROKEN?
    # Let's say BROKEN is definitely anomaly.
    y_true = df['machine_status'].isin(['BROKEN']).astype(int)
    y_pred = df['is_anomaly'].astype(int)
    
    print("\nEvaluation Metrics:")
    print(classification_report(y_true, y_pred, target_names=['Normal', 'Anomaly']))
    print("Confusion Matrix:")
    print(confusion_matrix(y_true, y_pred))
    
    # Save enriched data
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved inference results to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
