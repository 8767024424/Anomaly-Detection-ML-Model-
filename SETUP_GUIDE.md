# Industrial Pump Monitoring System - Setup Guide

## Overview
This system implements real-time anomaly detection for industrial pumps using LSTM Autoencoder ML model. It streams sensor data continuously, analyzes patterns, and displays insights on a multi-role dashboard.

## Architecture

```
Industrial Pump → Data Stream → Backend (Flask) → ML Inference → Database (Supabase) → Dashboard
```

### Components:
1. **Data Ingestion**: REST API endpoint for continuous sensor data
2. **Stream Processor**: Background thread processing incoming data
3. **ML Engine**: LSTM Autoencoder for anomaly detection
4. **Database**: Supabase for persistent storage
5. **Dashboard**: Multi-role UI (Engineer, Plant Head, Management, Admin)

## Prerequisites

- Python 3.8+
- Supabase account (free tier works)
- 2GB RAM minimum
- Modern web browser

## Installation

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Setup Supabase

1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Copy your project URL and anon key
4. Database tables are created automatically via migrations

### 3. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 4. Train ML Model (First Time Only)

```bash
python train_lstm_autoencoder.py
```

This creates:
- `lstm_model.h5` - Trained LSTM Autoencoder
- `scaler.pkl` - MinMax scaler for normalization
- `threshold.json` - Anomaly detection threshold

## Running the System

### Start Backend

```bash
python app.py
```

You should see:

```
🏭 INDUSTRIAL PUMP MONITORING SYSTEM
✅ Stream Processor: Active
✅ ML Engine: Loaded
✅ Database: Connected
🌐 Dashboard: http://localhost:5000
```

### Access Dashboard

Open browser: `http://localhost:5000`

## Data Ingestion Methods

### Method 1: Simulation Mode (Demo)

Use built-in CSV simulation:

1. Open dashboard
2. Switch to Admin view
3. Click "Start Simulation"

This will stream 2000 records at 1 record/second.

### Method 2: Real-Time API (Production)

Send sensor data via POST request:

```bash
curl -X POST http://localhost:5000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "Motor_RPM": 1480,
    "Bearing_Temperature_C": 72.5,
    "Oil_Pressure_bar": 4.2,
    "Vibration_mm_s": 2.8,
    "Flow_Rate_L_min": 145.3,
    "Suction_Pressure_bar": 1.8,
    "Discharge_Pressure_bar": 6.5,
    "Motor_Current_A": 28.4,
    "Casing_Temperature_C": 58.2,
    "Ambient_Temperature_C": 25.1
  }'
```

### Method 3: IoT Integration

Configure your PLC/IoT device to POST to `/api/ingest` every 1-5 seconds.

## Dashboard Views

### Plant Engineer
- Sensor health table with real-time status
- Historical anomaly distribution
- Sensor reliability scores
- Predictive maintenance timeline

### Plant Head
- Operational KPIs
- Risk composition analysis
- Remaining useful life (RUL) estimates
- Action recommendations

### Management
- Financial risk assessment
- Cost impact analysis
- Decision support metrics
- ROI calculations

### Admin
- System health monitoring
- Data flow verification
- Control panel for operations
- Trust indicators

## ML Model Details

### LSTM Autoencoder Architecture

```
Input (30 timesteps, 10 sensors)
  ↓
LSTM Encoder (64 units) → Bottleneck
  ↓
LSTM Decoder (64 units) → Reconstructed Output
```

### Anomaly Detection Logic

1. **Training**: Model learns to reconstruct NORMAL sensor patterns
2. **Inference**: New data is reconstructed
3. **Decision**: If reconstruction error > threshold → ANOMALY

Threshold is set at 99th percentile of training errors.

### Sliding Window

- Window size: 30 seconds
- 10 sensors per timestep
- Input shape: (1, 30, 10)

## API Reference

### POST /api/ingest
Ingest new sensor data

**Body:**
```json
{
  "Motor_RPM": float,
  "Bearing_Temperature_C": float,
  "Oil_Pressure_bar": float,
  "Vibration_mm_s": float,
  "Flow_Rate_L_min": float,
  "Suction_Pressure_bar": float,
  "Discharge_Pressure_bar": float,
  "Motor_Current_A": float,
  "Casing_Temperature_C": float,
  "Ambient_Temperature_C": float
}
```

### GET /api/live-data
Get latest processed data

**Response:**
```json
{
  "timestamp": "14:32:15",
  "values": {...},
  "status": "NORMAL|ANOMALY",
  "reconstruction_error": 0.045,
  "sensor_states": {...},
  "total_anomalies": 15
}
```

### GET /api/sensor-history?hours=1&limit=100
Get historical sensor readings

### GET /api/anomaly-history?hours=24
Get anomaly log

### GET /api/maintenance-events
Get maintenance events

## Troubleshooting

### Model not loading
- Ensure `lstm_model.h5` exists
- Run `python train_lstm_autoencoder.py`
- Check TensorFlow installation

### Database connection failed
- Verify `.env` credentials
- Check Supabase project status
- System will fallback to in-memory mode

### No data on dashboard
- Start simulation via Admin panel
- Or send data to `/api/ingest` endpoint
- Check browser console for errors

## Production Deployment

1. Use production-grade WSGI server:
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:5000 app:app
   ```

2. Enable HTTPS
3. Set up reverse proxy (Nginx)
4. Configure database backups
5. Set up monitoring alerts

## License

MIT License - See LICENSE file
