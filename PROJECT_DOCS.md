# Industrial Anomaly Detection: System Documentation

## Overview
This system is an AI-driven monitoring platform designed to detect industrial pump failures BEFORE they occur. By learning the 'digital twin' of normal operations, the AI identifies subtle deviations that signify bearing wear, motor imbalance, or flow disruptions.

## Architecture Steps

### 1. Data Processing
- **Scaling**: We use a `MinMaxScaler` fitted only on 'Normal' data. This ensures that any value outside the learned normal range is instantly recognized as unusual.
- **Windowing**: A 30-step sliding window allows the LSTM to "see" patterns in time, not just single points.

### 2. Autoencoder Logic
- **Goal**: Reconstruct the input.
- **Analogy**: Imagine a artist who learns to draw a specific pump perfectly. If they are asked to draw a broken pump, they will still try to draw it as 'normal'. The difference between their 'ideal' drawing and the 'broken' reality is the reconstruction error.
- **Threshold**: We set a strict limit at the 99th percentile of errors seen during training.

### 3. API Layer
- Decouples AI inference from the frontend.
- Exposes critical health data via industry-standard JSON endpoints.
- Supports real-time benchmarking for IT compliance.

### 4. Role-Based Insights
- **Engineering**: "What is failing?"
- **Management**: "What will it cost if we don't fix it?"
- **Operations**: "How much life is left in the asset?"

---
*Created by AURA Intelligence v3.3*
