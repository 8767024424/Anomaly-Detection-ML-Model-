import pandas as pd

DATA_PATH = r"C:\Users\UTG-Windows-User-03\Downloads\pump_sensor_data_2000_anomaly.csv"

def load_pump_data():
    df = pd.read_csv(DATA_PATH, parse_dates=['timestamp'])

    REQUIRED_COLUMNS = [
        'timestamp',
        'Motor_RPM',
        'Bearing_Temperature_C',
        'Oil_Pressure_bar',
        'Vibration_mm_s',
        'Flow_Rate_L_min',
        'Suction_Pressure_bar',
        'Discharge_Pressure_bar',
        'Motor_Current_A',
        'Casing_Temperature_C',
        'Ambient_Temperature_C',
        'machine_status'
    ]

    missing = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"❌ Missing columns in CSV: {missing}")

    print("✅ Static historical dataset loaded")
    print(f"✅ Total records: {len(df)}")
    print("✅ Machine status distribution:")
    print(df['machine_status'].value_counts())

    return df


if __name__ == "__main__":
    df = load_pump_data()
