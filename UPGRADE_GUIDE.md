# Dashboard Upgrade Guide v2.0

## What's New

### 🎨 UI/UX Improvements

1. **Fully Responsive Design**
   - Mobile-first approach
   - Optimized for tablets and desktops
   - Touch-friendly controls
   - Adaptive layouts based on screen size

2. **Modern Visual Design**
   - Cleaner card-based interface
   - Better color contrast for readability
   - Improved chart visualizations
   - Smoother animations and transitions

### 🏭 Plant Engineer View Changes

#### ✅ Kept (with improvements):
- **A. Sensor Health Table** - Now with better mobile scrolling and clearer status indicators
- **B. Historical Anomaly Distribution** - Enhanced bar chart with better labeling
- **C. Sensor Reliability Score** - Now shows real-time reconstruction loss vs threshold

#### 🆕 New:
- **D. Predictive Maintenance Timeline** (Replaced old D. Historical Reliability & Risk Console)
  - Shows active maintenance events from database
  - Displays estimated costs
  - Severity-based color coding
  - Real-time updates

### 🏭 Plant Head View Enhancements

**New Features:**
- Operational KPIs in easy-to-read cards
- Risk composition visualization
- Remaining Useful Life (RUL) bars for critical sensors
- Three-tier action recommendations (Immediate/24h/Planned)
- Enhanced executive summary

**Better Decision Support:**
- Visual risk composition bar
- Doughnut chart for risk distribution
- Color-coded priority levels
- Mobile-optimized layout

### 💼 Management View Improvements

**Financial Focus:**
- Cost impact visualization
- Risk vs Action comparison chart
- Cost driver breakdown with progress bars
- ROI calculations
- Decision support metrics

**Business Intelligence:**
- Clear financial impact (₹ format)
- Preventive maintenance savings calculation
- Risk-based decision making
- Time-sensitive action triggers

### 🛠️ Admin View Enhancements

**System Monitoring:**
- Visual system health checks
- Data flow verification
- Trust indicators with timestamps
- Real-time activity log

**Control Panel:**
- Data reload capability
- ML engine refresh
- UI resync controls
- One-click simulation start

## Architecture Changes

### Backend (app.py)

**New Capabilities:**
```
OLD: CSV Simulation Only
NEW: Real-time Data Ingestion + CSV Simulation + Database Storage
```

**New Endpoints:**
- `POST /api/ingest` - Accept real-time sensor data
- `GET /api/sensor-history` - Historical readings from database
- `GET /api/anomaly-history` - Anomaly log with filtering
- `GET /api/maintenance-events` - Maintenance event tracking
- `POST /api/start-simulation` - Control simulation
- `POST /api/stop-simulation` - Stop simulation

### Database Integration (Supabase)

**New Tables:**
1. `sensor_readings` - Raw sensor data with timestamps
2. `anomaly_detections` - ML inference results
3. `system_metrics` - Performance tracking
4. `maintenance_events` - Predictive maintenance tracking

**Benefits:**
- Persistent data storage
- Historical analysis
- Audit trail
- Scalable architecture

### Stream Processor (stream_processor.py)

**New Component:**
- Background thread for data processing
- Queue-based architecture (1000 item buffer)
- Automatic maintenance event creation
- Real-time statistics tracking

**Features:**
- Handles continuous data streams
- Decouples ingestion from inference
- Automatic anomaly triggering
- Cost estimation for maintenance

## Migration Steps

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Setup Database

Create `.env` file:
```
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
```

Database tables are auto-created on first run.

### 3. Train Model (if not done)

```bash
python train_lstm_autoencoder.py
```

### 4. Start Backend

```bash
python app.py
```

### 5. Choose Files to Use

**Option A: Use New Files (Recommended)**
1. Rename `index.html` → `index-old.html`
2. Rename `index-improved.html` → `index.html`
3. Rename `dashboard.js` → `dashboard-old.js`
4. Rename `dashboard-improved.js` → `dashboard.js`
5. Rename `styles.css` → `styles-old.css`
6. Rename `styles-responsive.css` → `styles.css`

**Option B: Keep Both**
- Access new version: `http://localhost:5000/index-improved.html`
- Access old version: `http://localhost:5000/index.html`

## Testing Checklist

### Mobile (< 768px)
- [ ] Sidebar is horizontal
- [ ] Cards stack vertically
- [ ] Tables scroll horizontally
- [ ] Charts are readable
- [ ] Buttons are touch-friendly

### Tablet (768px - 1024px)
- [ ] Sidebar is vertical
- [ ] 2-column grid layouts work
- [ ] Charts have proper spacing
- [ ] Navigation is accessible

### Desktop (> 1024px)
- [ ] Sidebar + Main + Copilot visible
- [ ] 3-4 column grids work
- [ ] All charts render properly
- [ ] Live updates work

### Functionality
- [ ] Role switching works
- [ ] Live data updates every 2 seconds
- [ ] Charts update with new data
- [ ] Sensor table updates in real-time
- [ ] Maintenance events load
- [ ] Admin controls work
- [ ] Chat interface responds

## Real-Time Data Flow

### Simulation Mode (Demo)

```
CSV File → simulate_data_stream() → stream_processor.ingest()
         ↓
Background Thread (stream_processor._process_stream)
         ↓
ML Inference (inference_engine.run_inference)
         ↓
Database Storage (Supabase)
         ↓
API Endpoints → Dashboard (2-second polling)
```

### Production Mode

```
Industrial Pump → POST /api/ingest → stream_processor.ingest()
                ↓
        Background Thread
                ↓
        ML Inference
                ↓
        Database Storage
                ↓
        API Endpoints → Dashboard
```

## Performance Considerations

### Backend
- **Queue Size:** 1000 items (configurable in stream_processor.py)
- **Processing Rate:** ~100-500 inferences/second (depends on hardware)
- **Memory Usage:** ~200-400 MB (with TensorFlow loaded)

### Frontend
- **Update Frequency:** 2 seconds (configurable in dashboard.js)
- **Chart Updates:** Optimized with `update('none')` mode
- **Memory:** Minimal, old data is garbage collected

### Database
- **Write Rate:** 1-2 rows/second per reading
- **Query Optimization:** Indexed on timestamps and status fields
- **Storage:** ~50KB per 1000 readings

## Troubleshooting

### Dashboard not updating
1. Check browser console for errors
2. Verify `/api/live-data` endpoint returns data
3. Check if simulation is started (Admin panel)

### Charts not rendering
1. Ensure Chart.js is loaded (check browser console)
2. Verify canvas elements exist in DOM
3. Check for JavaScript errors

### Database connection failed
1. Verify `.env` credentials
2. Check Supabase project status
3. System will fallback to in-memory mode automatically

### Mobile layout broken
1. Clear browser cache
2. Check viewport meta tag is present
3. Verify `styles-responsive.css` is loaded

## Future Enhancements

### Planned Features
- [ ] WebSocket support for true real-time updates (no polling)
- [ ] Export data to CSV/Excel
- [ ] Historical data replay
- [ ] Custom alert rules
- [ ] Multi-pump monitoring
- [ ] Email notifications
- [ ] Mobile app (PWA)

### ML Improvements
- [ ] Model retraining capability
- [ ] Adaptive thresholds
- [ ] Sensor-specific models
- [ ] Failure prediction (time-to-failure)
- [ ] Root cause analysis AI

## Support

For issues or questions:
1. Check `SETUP_GUIDE.md` for installation help
2. Review browser console for errors
3. Check backend logs for API errors
4. Verify database connectivity

## License

MIT License - See LICENSE file
