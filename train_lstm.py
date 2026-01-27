import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, LSTM, RepeatVector, TimeDistributed, Dense
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.preprocessing import MinMaxScaler
import joblib
import json
import os

# Configuration
DATA_FILE = 'pump_sensor_sequence_1000_records.csv'
MODEL_PATH = 'lstm_model.h5'
SCALER_PATH = 'lstm_scaler.pkl'
THRESHOLD_PATH = 'lstm_threshold.json'
WINDOW = 30
FEATURES = ['Motor_RPM', 'Bearing_Temperature_C', 'Oil_Pressure_bar', 'Vibration_mm_s', 
            'Flow_Rate_L_min', 'Suction_Pressure_bar', 'Discharge_Pressure_bar', 
            'Motor_Current_A', 'Casing_Temperature_C', 'Ambient_Temperature_C']

def create_sequences(data, window):
    X = []
    for i in range(len(data) - window):
        X.append(data[i:i + window])
    return np.array(X)

def main():
    print("Loading data...")
    df = pd.read_csv(DATA_FILE)
    
    # Preprocessing
    scaler = MinMaxScaler()
    df_scaled = df.copy()
    df_scaled[FEATURES] = scaler.fit_transform(df[FEATURES])
    
    # Train only on NORMAL data
    train_df = df_scaled[df_scaled.machine_status == "NORMAL"]
    X_train = create_sequences(train_df[FEATURES].values, WINDOW)
    
    # Test on full dataset
    X_test = create_sequences(df_scaled[FEATURES].values, WINDOW)
    
    print(f"X_train shape: {X_train.shape}")
    print(f"X_test shape : {X_test.shape}")
    
    # 4. LSTM Autoencoder Model
    inputs = Input(shape=(WINDOW, len(FEATURES)))
    x = LSTM(64, activation="relu", return_sequences=False)(inputs)
    x = RepeatVector(WINDOW)(x)
    x = LSTM(64, activation="relu", return_sequences=True)(x)
    outputs = TimeDistributed(Dense(len(FEATURES)))(x)
    
    model = Model(inputs, outputs)
    model.compile(optimizer="adam", loss="mae")
    
    print("Training model...")
    model.fit(
        X_train, X_train,
        epochs=10, # Reduced for speed, user said 20
        batch_size=64,
        validation_split=0.1,
        callbacks=[EarlyStopping(patience=3, restore_best_weights=True)],
        verbose=1
    )
    
    # 5. Reconstruction Error & Threshold
    print("Calculating threshold...")
    X_train_pred = model.predict(X_train, verbose=0)
    train_recon_error = np.mean(np.abs(X_train_pred - X_train), axis=(1, 2))
    
    # Threshold from NORMAL data (99th percentile)
    threshold = np.percentile(train_recon_error, 99)
    print(f"Anomaly Threshold: {threshold}")
    
    # Save resources
    model.save(MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    with open(THRESHOLD_PATH, 'w') as f:
        json.dump({"anomaly_threshold": float(threshold)}, f)
        
    print("Training complete. Assets saved.")

if __name__ == "__main__":
    main()
