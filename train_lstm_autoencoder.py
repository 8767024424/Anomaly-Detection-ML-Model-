"""
Advanced Anomaly Detection for Industrial Pumps
Phase 1: LSTM Autoencoder Training Pipeline

This script implements a semi-supervised learning approach using an LSTM Autoencoder.
It learns to reconstruct 'NORMAL' sensor data. During inference, data that cannot 
be reconstructed accurately (high MAE) is flagged as an anomaly.
"""

import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, LSTM, RepeatVector, TimeDistributed, Dense
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.preprocessing import MinMaxScaler
import joblib
import json
import os

# --- Configuration ---
DATA_FILE = 'pump_sensor_data_2000_anomaly.csv'
MODEL_PATH = 'lstm_model.h5'
SCALER_PATH = 'scaler.pkl'
THRESHOLD_PATH = 'threshold.json'
WINDOW_SIZE = 30
FEATURES = [
    'Motor_RPM', 'Bearing_Temperature_C', 'Oil_Pressure_bar', 'Vibration_mm_s', 
    'Flow_Rate_L_min', 'Suction_Pressure_bar', 'Discharge_Pressure_bar', 
    'Motor_Current_A', 'Casing_Temperature_C', 'Ambient_Temperature_C'
]

def create_windows(data, window_size):
    """
    Converts continuous sensor stream into overlapping windows.
    Required shape for LSTM: (samples, time_steps, features)
    """
    X = []
    for i in range(len(data) - window_size + 1):
        X.append(data[i:i + window_size])
    return np.array(X)

def main():
    print("--- Phase 1: Training LSTM Autoencoder ---")
    
    if not os.path.exists(DATA_FILE):
        print(f"Error: {DATA_FILE} not found.")
        return

    # 1. Load Data
    print(f"Reading {DATA_FILE}...")
    df = pd.read_csv(DATA_FILE)
    
    # 2. Preprocessing Layer
    # Handle missing values (forward-fill)
    df = df.ffill()
    
    # Normalize sensor values using MinMaxScaler
    # IMPORTANT: We only fit the scaler on NORMAL data to define the 'normal' range
    scaler = MinMaxScaler()
    normal_data_raw = df[df.machine_status == "NORMAL"][FEATURES]
    
    print(f"Fitting scaler on {len(normal_data_raw)} normal samples...")
    scaler.fit(normal_data_raw)
    
    # Transform full dataset
    scaled_values = scaler.transform(df[FEATURES])
    df_scaled = pd.DataFrame(scaled_values, columns=FEATURES)
    df_scaled['machine_status'] = df['machine_status']
    
    # 3. Sliding Window Generator
    # Train ONLY on NORMAL behavior
    train_data = df_scaled[df_scaled.machine_status == "NORMAL"][FEATURES].values
    X_train = create_windows(train_data, WINDOW_SIZE)
    
    print(f"Training sequences generated: {X_train.shape}")
    
    # 4. Machine Learning Layer: LSTM Autoencoder
    # Input -> [Encoder] -> Bottleneck -> [Decoder] -> Output
    inputs = Input(shape=(WINDOW_SIZE, len(FEATURES)))
    
    # Encoder
    x = LSTM(64, activation='relu', return_sequences=False)(inputs)
    
    # Bottleneck (RepeatVector adapts the compressed state back to window size)
    x = RepeatVector(WINDOW_SIZE)(x)
    
    # Decoder
    x = LSTM(64, activation='relu', return_sequences=True)(x)
    outputs = TimeDistributed(Dense(len(FEATURES)))(x)
    
    model = Model(inputs, outputs)
    model.compile(optimizer='adam', loss='mae') # Mean Absolute Error for reconstruction
    
    print("Model Summary:")
    model.summary()
    
    # Training
    print("Starting training...")
    callbacks = [
        EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=2)
    ]
    
    model.fit(
        X_train, X_train,
        epochs=20,
        batch_size=32,
        validation_split=0.1,
        callbacks=callbacks,
        verbose=1
    )
    
    # 5. Anomaly Detection Logic: Threshold Calculation
    # Calculate reconstruction error on training data (Normal only)
    print("Calculating anomaly threshold...")
    X_train_pred = model.predict(X_train, verbose=0)
    train_mae = np.mean(np.abs(X_train_pred - X_train), axis=(1, 2))
    
    # Threshold = 99th percentile of normal reconstruction error
    # This means 99% of normal data is below this threshold.
    threshold = np.percentile(train_mae, 99)
    print(f"Optimal Threshold (99th percentile): {threshold:.5f}")
    
    # 6. Save Assets
    print("Saving model, scaler, and threshold...")
    model.save(MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    with open(THRESHOLD_PATH, 'w') as f:
        json.dump({"anomaly_threshold": float(threshold)}, f)
    
    print("Phase 1 Complete. Assets saved to disk.")

if __name__ == "__main__":
    main()
