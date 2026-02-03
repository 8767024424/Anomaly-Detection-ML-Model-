# Industrial Pump Monitoring System v2.0

AI-Powered Real-Time Anomaly Detection with Predictive Maintenance

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Setup environment (optional - works without Supabase)
cp .env.example .env
# Edit .env and add your Supabase credentials

# 3. Train ML model (first time only)
python train_lstm_autoencoder.py

# 4. Start the system
python app.py

# 5. Open browser
http://localhost:5000/index-improved.html
```

## What's New in v2.0

### Real-Time Data Streaming
- Accept live sensor data from industrial pumps via REST API
- Background processing with queue-based architecture
- Handles up to 1000 readings/second burst capacity

### Database Integration
- Persistent storage with Supabase
- Historical analysis and audit trail
- Automatic maintenance event tracking
- Cost estimation for repairs

### Responsive Design
- Mobile-first UI that works on phones, tablets, desktops
- Touch-friendly controls
- Adaptive layouts based on screen size
- Modern card-based interface

### Enhanced Views

**Plant Engineer:**
- Real-time sensor health table
- Historical anomaly distribution
- Reliability trend analysis
- Predictive maintenance timeline (NEW)

**Plant Head:**
- Operational KPIs
- Risk composition analysis
- Remaining Useful Life (RUL) estimates
- Three-tier action recommendations

**Management:**
- Financial risk assessment
- Cost impact analysis
- ROI calculations
- Decision support metrics

**Admin:**
- System health monitoring
- Data flow verification
- Control panel for operations
- Trust indicators

## Architecture

```
Industrial Pump → REST API → Stream Processor → ML Inference → Database → Dashboard
```

### Components

1. **Data Ingestion:** POST endpoint for real-time sensor data
2. **Stream Processor:** Background thread with queue-based processing
3. **ML Engine:** LSTM Autoencoder for anomaly detection
4. **Database:** Supabase for persistent storage
5. **Dashboard:** Responsive multi-role UI

## LSTM Autoencoder Explained

### How It Works

1. **Training Phase:**
   - Model learns to compress and reconstruct NORMAL sensor patterns
   - Input: 30-second windows (30 timesteps × 10 sensors)
   - Architecture: LSTM Encoder (64 units) → Bottleneck → LSTM Decoder (64 units)
   - Loss function: Mean Absolute Error (MAE)

2. **Inference Phase:**
   - New data is reconstructed by the model
   - Reconstruction error is calculated
   - If error > threshold (99th percentile) → ANOMALY
   - If error ≤ threshold → NORMAL

3. **Why LSTM?**
   - Captures temporal patterns in time-series sensor data
   - Learns long-term dependencies
   - Better than simple statistical methods

4. **Why Autoencoder?**
   - Unsupervised learning (no need for labeled anomalies)
   - Learns normal behavior compression
   - Deviation from normal = high reconstruction error

## API Reference

### POST /api/ingest
Ingest real-time sensor data

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

### GET /api/live-data
Get latest processed data

### GET /api/sensor-history
Retrieve historical readings

Parameters:
- `hours` - Number of hours to look back (default: 1)
- `limit` - Maximum records to return (default: 100)

### GET /api/anomaly-history
Get anomaly log

Parameters:
- `hours` - Number of hours to look back (default: 24)
- `limit` - Maximum records to return (default: 100)

### GET /api/maintenance-events
Fetch maintenance events

Parameters:
- `resolved` - Filter by resolution status (default: false)

### POST /api/start-simulation
Start CSV data simulation (demo mode)

### POST /api/stop-simulation
Stop CSV data simulation

## Database Schema

### sensor_readings
Raw sensor data with timestamps

### anomaly_detections
ML inference results with per-sensor analysis

### system_metrics
Performance tracking (latency, memory, CPU)

### maintenance_events
Predictive maintenance with cost estimates

## File Structure

```
project/
├── app.py                      # Flask backend with API endpoints
├── stream_processor.py         # Real-time data processing engine
├── inference_engine.py         # ML inference engine (LSTM)
├── train_lstm_autoencoder.py  # Model training script
│
├── index-improved.html         # New responsive dashboard
├── dashboard-improved.js       # New JavaScript with API integration
├── styles-responsive.css       # Mobile-first CSS
│
├── index.html                  # Original dashboard (backup)
├── dashboard.js                # Original JavaScript (backup)
├── styles.css                  # Original styles (backup)
│
├── requirements.txt            # Python dependencies
├── .env.example                # Environment template
│
├── README.md                   # This file
├── SETUP_GUIDE.md              # Detailed installation guide
├── UPGRADE_GUIDE.md            # Migration instructions
├── ARCHITECTURE.md             # Technical architecture
├── IMPLEMENTATION_SUMMARY.md  # What was built
│
├── test_system.py              # System health check script
├── quickstart.sh               # Linux/Mac setup script
└── quickstart.bat              # Windows setup script
```

## Testing

### Run System Health Check

```bash
python test_system.py
```

This will verify:
- Python version
- Dependencies installed
- Required files present
- ML model files
- Environment configuration

### Demo Mode

1. Start the backend: `python app.py`
2. Open: `http://localhost:5000/index-improved.html`
3. Switch to Admin view
4. Click "Reload Data" to start simulation
5. System will stream 2000 records at 1 record/second

### Production Mode

Configure your industrial pump to POST sensor data to `/api/ingest` every 1-5 seconds.

## Mobile Testing

1. Find your computer's IP address
2. On mobile device: `http://YOUR_IP:5000/index-improved.html`
3. Test touch interactions and responsive layout

## Performance

- **Inference Latency:** 20-50ms per reading
- **Memory Usage:** 200-400 MB (TensorFlow loaded)
- **Processing Rate:** 20-50 readings/second
- **End-to-End Latency:** 2-3 seconds (sensor to dashboard)

## Requirements

- Python 3.8+
- 2GB RAM minimum
- Modern web browser
- Supabase account (optional - works without it)

## Documentation

- **SETUP_GUIDE.md** - Detailed installation and configuration
- **UPGRADE_GUIDE.md** - Migration from v1 to v2
- **ARCHITECTURE.md** - Technical architecture and data flow
- **IMPLEMENTATION_SUMMARY.md** - Complete feature overview

## Troubleshooting

### Dependencies not installed
```bash
pip install -r requirements.txt
```

### Model not found
```bash
python train_lstm_autoencoder.py
```

### Database connection failed
System will automatically fall back to in-memory mode. To use database:
1. Create Supabase account
2. Add credentials to `.env`
3. Restart backend

### Dashboard not updating
1. Check browser console for errors
2. Verify backend is running
3. Try starting simulation (Admin panel)

## Support

For detailed help, see:
- Installation: `SETUP_GUIDE.md`
- Architecture: `ARCHITECTURE.md`
- Troubleshooting: `UPGRADE_GUIDE.md`

## License

MIT License

## Version History

**v2.0** (Current)
- Real-time data streaming
- Database integration (Supabase)
- Responsive mobile-first design
- Enhanced all 4 role views
- Predictive maintenance timeline
- Cost estimation
- Background processing

**v1.0**
- CSV simulation mode
- LSTM Autoencoder
- Basic dashboard
- 4 role views

---

Built with Flask, TensorFlow, Supabase, and Chart.js
