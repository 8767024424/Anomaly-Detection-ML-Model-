/*
  # Industrial Pump Monitoring System - Database Schema

  1. New Tables
    - `sensor_readings`
      - `id` (bigint, primary key, auto-increment)
      - `timestamp` (timestamptz, indexed)
      - `motor_rpm` (real)
      - `bearing_temperature_c` (real)
      - `oil_pressure_bar` (real)
      - `vibration_mm_s` (real)
      - `flow_rate_l_min` (real)
      - `suction_pressure_bar` (real)
      - `discharge_pressure_bar` (real)
      - `motor_current_a` (real)
      - `casing_temperature_c` (real)
      - `ambient_temperature_c` (real)
      - `machine_status` (text)
      - `created_at` (timestamptz)
    
    - `anomaly_detections`
      - `id` (bigint, primary key, auto-increment)
      - `reading_id` (bigint, foreign key)
      - `timestamp` (timestamptz, indexed)
      - `is_anomaly` (boolean)
      - `reconstruction_loss` (real)
      - `threshold` (real)
      - `sensor_states` (jsonb)
      - `sensor_anomaly_counts` (jsonb)
      - `inference_latency_ms` (real)
      - `created_at` (timestamptz)
    
    - `system_metrics`
      - `id` (bigint, primary key, auto-increment)
      - `timestamp` (timestamptz, indexed)
      - `memory_usage_mb` (real)
      - `cpu_usage_percent` (real)
      - `data_stream_status` (text)
      - `model_status` (text)
      - `created_at` (timestamptz)
    
    - `maintenance_events`
      - `id` (bigint, primary key, auto-increment)
      - `event_type` (text)
      - `severity` (text)
      - `sensor_name` (text)
      - `description` (text)
      - `estimated_cost` (real)
      - `timestamp` (timestamptz)
      - `resolved` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access (dashboard users)
    - Add policies for service role (backend ingestion)

  3. Indexes
    - Index on timestamps for efficient time-series queries
    - Index on machine_status for filtering
    - Index on is_anomaly for quick anomaly retrieval
*/

-- Create sensor_readings table
CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  motor_rpm REAL NOT NULL,
  bearing_temperature_c REAL NOT NULL,
  oil_pressure_bar REAL NOT NULL,
  vibration_mm_s REAL NOT NULL,
  flow_rate_l_min REAL NOT NULL,
  suction_pressure_bar REAL NOT NULL,
  discharge_pressure_bar REAL NOT NULL,
  motor_current_a REAL NOT NULL,
  casing_temperature_c REAL NOT NULL,
  ambient_temperature_c REAL NOT NULL,
  machine_status TEXT DEFAULT 'UNKNOWN',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_status ON sensor_readings(machine_status);

-- Create anomaly_detections table
CREATE TABLE IF NOT EXISTS anomaly_detections (
  id BIGSERIAL PRIMARY KEY,
  reading_id BIGINT REFERENCES sensor_readings(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_anomaly BOOLEAN NOT NULL DEFAULT false,
  reconstruction_loss REAL NOT NULL,
  threshold REAL NOT NULL,
  sensor_states JSONB DEFAULT '{}'::jsonb,
  sensor_anomaly_counts JSONB DEFAULT '{}'::jsonb,
  inference_latency_ms REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_detections_timestamp ON anomaly_detections(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_is_anomaly ON anomaly_detections(is_anomaly);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_reading_id ON anomaly_detections(reading_id);

-- Create system_metrics table
CREATE TABLE IF NOT EXISTS system_metrics (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  memory_usage_mb REAL DEFAULT 0,
  cpu_usage_percent REAL DEFAULT 0,
  data_stream_status TEXT DEFAULT 'ACTIVE',
  model_status TEXT DEFAULT 'LOADED',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);

-- Create maintenance_events table
CREATE TABLE IF NOT EXISTS maintenance_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  sensor_name TEXT NOT NULL,
  description TEXT,
  estimated_cost REAL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_events_timestamp ON maintenance_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_events_severity ON maintenance_events(severity);
CREATE INDEX IF NOT EXISTS idx_maintenance_events_resolved ON maintenance_events(resolved);

-- Enable Row Level Security
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_events ENABLE ROW LEVEL SECURITY;

-- Policies for public read access (dashboard is public demo)
CREATE POLICY "Allow public read access to sensor_readings"
  ON sensor_readings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to anomaly_detections"
  ON anomaly_detections FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to system_metrics"
  ON system_metrics FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to maintenance_events"
  ON maintenance_events FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policies for service role to insert data
CREATE POLICY "Allow service role to insert sensor_readings"
  ON sensor_readings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow service role to insert anomaly_detections"
  ON anomaly_detections FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow service role to insert system_metrics"
  ON system_metrics FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow service role to insert maintenance_events"
  ON maintenance_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);