
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
import json
from load_data import load_pump_data

# Configuration
MODEL_PATH = "model.pkl"
SCALER_PATH = "scaler.pkl"
THRESHOLD_PATH = "threshold.json"
FEATURES = ['Motor_RPM', 'Bearing_Temperature_C', 'Oil_Pressure_bar', 'Vibration_mm_s', 
            'Flow_Rate_L_min', 'Suction_Pressure_bar', 'Discharge_Pressure_bar', 
            'Motor_Current_A', 'Casing_Temperature_C', 'Ambient_Temperature_C']

def main():
    print("Loading data via load_data.py...")
    df = load_pump_data()
    
    # For Isolation Forest, we can train on "mostly normal" data.
    # We'll select the 'NORMAL' subset to be pure.
    normal_df = df[df['machine_status'] == 'NORMAL']
    print(f"Training on {len(normal_df)} normal records.")
    
    X_train = normal_df[FEATURES]
    
    # Scaling
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    joblib.dump(scaler, SCALER_PATH)
    
    # Train Isolation Forest
    # contamination 'auto' or low value since we are training on normal data
    # but IF fits a boundary. 
    model = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    model.fit(X_train_scaled)
    
    # Save Model
    joblib.dump(model, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")
    
    # Calculate Scores
    scores = model.score_samples(X_train_scaled)
    # Lower score = more anomalous. High score = normal.
    # We want a threshold.
    # limit = percentile
    thresh = np.percentile(scores, 1) # 1st percentile as cutoff?
    
    print(f"Anomaly Score Threshold (1st percentile): {thresh}")
    
    with open(THRESHOLD_PATH, 'w') as f:
        json.dump({"anomaly_threshold": float(thresh)}, f)

if __name__ == "__main__":
    main()
