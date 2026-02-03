"""
Real-Time Data Stream Processor
Handles continuous sensor data ingestion and ML inference
"""

import threading
import time
import queue
from datetime import datetime
from inference_engine import engine
import os

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("Warning: Supabase client not installed")

class StreamProcessor:
    def __init__(self):
        self.data_queue = queue.Queue(maxsize=1000)
        self.running = False
        self.processing_thread = None

        # Initialize Supabase client
        self.supabase = None
        if SUPABASE_AVAILABLE:
            supabase_url = os.getenv('SUPABASE_URL')
            supabase_key = os.getenv('SUPABASE_ANON_KEY')
            if supabase_url and supabase_key:
                self.supabase = create_client(supabase_url, supabase_key)
                print("✅ Supabase connected for real-time data storage")

        # Statistics
        self.total_processed = 0
        self.total_anomalies = 0
        self.last_reading = None
        self.last_inference = None

    def start(self):
        """Start the background processing thread"""
        if not self.running:
            self.running = True
            self.processing_thread = threading.Thread(target=self._process_stream, daemon=True)
            self.processing_thread.start()
            print("🚀 Stream processor started")

    def stop(self):
        """Stop the background processing"""
        self.running = False
        if self.processing_thread:
            self.processing_thread.join(timeout=5)
        print("⏹ Stream processor stopped")

    def ingest(self, sensor_data: dict):
        """
        Public API to ingest sensor data
        Can be called from REST endpoint, WebSocket, or message queue
        """
        try:
            self.data_queue.put(sensor_data, block=False)
            return True
        except queue.Full:
            print("⚠️ Queue full, dropping data point")
            return False

    def _process_stream(self):
        """Background thread that continuously processes incoming data"""
        print("📊 Processing thread active")

        while self.running:
            try:
                # Get data from queue (timeout to allow checking self.running)
                sensor_data = self.data_queue.get(timeout=1.0)

                # Store raw reading
                reading_id = self._store_sensor_reading(sensor_data)

                # Run ML inference
                inference_result = engine.run_inference(sensor_data)

                # Store inference result
                self._store_anomaly_detection(reading_id, inference_result)

                # Update statistics
                self.total_processed += 1
                if inference_result.get('is_anomaly'):
                    self.total_anomalies += 1

                # Cache for API access
                self.last_reading = sensor_data
                self.last_inference = inference_result

                # Generate maintenance events if needed
                self._check_maintenance_triggers(sensor_data, inference_result)

            except queue.Empty:
                continue
            except Exception as e:
                print(f"Error processing stream: {e}")

    def _store_sensor_reading(self, sensor_data: dict) -> int:
        """Store sensor reading to database"""
        if not self.supabase:
            return 0

        try:
            result = self.supabase.table('sensor_readings').insert({
                'motor_rpm': float(sensor_data.get('Motor_RPM', 0)),
                'bearing_temperature_c': float(sensor_data.get('Bearing_Temperature_C', 0)),
                'oil_pressure_bar': float(sensor_data.get('Oil_Pressure_bar', 0)),
                'vibration_mm_s': float(sensor_data.get('Vibration_mm_s', 0)),
                'flow_rate_l_min': float(sensor_data.get('Flow_Rate_L_min', 0)),
                'suction_pressure_bar': float(sensor_data.get('Suction_Pressure_bar', 0)),
                'discharge_pressure_bar': float(sensor_data.get('Discharge_Pressure_bar', 0)),
                'motor_current_a': float(sensor_data.get('Motor_Current_A', 0)),
                'casing_temperature_c': float(sensor_data.get('Casing_Temperature_C', 0)),
                'ambient_temperature_c': float(sensor_data.get('Ambient_Temperature_C', 0)),
                'machine_status': sensor_data.get('machine_status', 'UNKNOWN')
            }).execute()

            return result.data[0]['id'] if result.data else 0
        except Exception as e:
            print(f"Error storing sensor reading: {e}")
            return 0

    def _store_anomaly_detection(self, reading_id: int, inference_result: dict):
        """Store anomaly detection result"""
        if not self.supabase or reading_id == 0:
            return

        try:
            self.supabase.table('anomaly_detections').insert({
                'reading_id': reading_id,
                'is_anomaly': inference_result.get('is_anomaly', False),
                'reconstruction_loss': inference_result.get('reconstruction_loss', 0),
                'threshold': inference_result.get('threshold', 0.05),
                'sensor_states': inference_result.get('sensor_states', {}),
                'sensor_anomaly_counts': inference_result.get('sensor_anomaly_counts', {}),
                'inference_latency_ms': inference_result.get('latency_ms', 0)
            }).execute()
        except Exception as e:
            print(f"Error storing anomaly detection: {e}")

    def _check_maintenance_triggers(self, sensor_data: dict, inference_result: dict):
        """Check if maintenance events should be triggered"""
        if not self.supabase:
            return

        sensor_states = inference_result.get('sensor_states', {})

        # Critical sensors that require immediate attention
        critical_sensors = {
            'Bearing_Temperature_C': 85,
            'Vibration_mm_s': 8.0,
            'Motor_Current_A': 45
        }

        for sensor_name, critical_value in critical_sensors.items():
            current_value = sensor_data.get(sensor_name, 0)
            is_anomalous = sensor_states.get(sensor_name) == 'ANOMALY'

            if is_anomalous and current_value > critical_value:
                try:
                    # Check if event already exists (avoid duplicates)
                    existing = self.supabase.table('maintenance_events')\
                        .select('id')\
                        .eq('sensor_name', sensor_name)\
                        .eq('resolved', False)\
                        .execute()

                    if not existing.data:
                        # Create new maintenance event
                        severity = 'CRITICAL' if current_value > critical_value * 1.2 else 'HIGH'
                        estimated_cost = self._estimate_maintenance_cost(sensor_name, severity)

                        self.supabase.table('maintenance_events').insert({
                            'event_type': 'ANOMALY_DETECTED',
                            'severity': severity,
                            'sensor_name': sensor_name,
                            'description': f'{sensor_name} showing anomalous behavior. Current value: {current_value:.2f}',
                            'estimated_cost': estimated_cost,
                            'resolved': False
                        }).execute()

                        print(f"🚨 Maintenance event created: {sensor_name} - {severity}")
                except Exception as e:
                    print(f"Error creating maintenance event: {e}")

    def _estimate_maintenance_cost(self, sensor_name: str, severity: str) -> float:
        """Estimate maintenance cost based on sensor and severity"""
        base_costs = {
            'Bearing_Temperature_C': 45000,
            'Vibration_mm_s': 35000,
            'Motor_Current_A': 60000,
            'Oil_Pressure_bar': 25000
        }

        base = base_costs.get(sensor_name, 30000)

        if severity == 'CRITICAL':
            return base * 1.5
        elif severity == 'HIGH':
            return base * 1.2
        else:
            return base

    def get_statistics(self) -> dict:
        """Get current processing statistics"""
        return {
            'total_processed': self.total_processed,
            'total_anomalies': self.total_anomalies,
            'queue_size': self.data_queue.qsize(),
            'is_running': self.running,
            'last_reading': self.last_reading,
            'last_inference': self.last_inference
        }

# Global instance
stream_processor = StreamProcessor()
