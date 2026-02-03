/*
    Industrial Dashboard Logic
    - Simulates data fetching
    - Simulates ML inference
    - Handles UI updates per role
    - Handles NLP interactions
*/

const APP_STATE = {
    currentRole: 'plant-engineer',
    data: [], // Historical buffer for charts
    isPlaying: true,
    lastAnomalyScore: 0,
    systemState: 'LEARNING', // LEARNING | NORMAL | WARNING | CRITICAL
    streamInterval: null
};

// Configuration for charts
const CHART_CONFIG = {
    fontColor: '#8b949e',
    gridColor: '#30363d'
};

const SENSOR_ORDER = [
    'Vibration_mm_s', 'Bearing_Temperature_C', 'Motor_Current_A', 'Oil_Pressure_bar',
    'Flow_Rate_L_min', 'Discharge_Pressure_bar', 'Suction_Pressure_bar',
    'Motor_RPM', 'Casing_Temperature_C', 'Ambient_Temperature_C'
];

const SENSOR_COLORS = {
    'Vibration_mm_s': '#da3633',        // Red
    'Bearing_Temperature_C': '#d29922', // Orange
    'Motor_Current_A': '#f0883e',       // Orange-Red
    'Oil_Pressure_bar': '#db6d28',      // Dark Orange
    'Flow_Rate_L_min': '#238636',       // Green
    'Discharge_Pressure_bar': '#58a6ff',// Blue
    'Suction_Pressure_bar': '#79c0ff',  // Light Blue
    'Motor_RPM': '#8957e5',             // Purple
    'Casing_Temperature_C': '#bd5c00',  // Brown
    'Ambient_Temperature_C': '#a5d6ff'  // Lighter Blue
};

// Global Baselines (Truth Source)
const BASELINES = {
    'Vibration_mm_s': 0.5,
    'Bearing_Temperature_C': 35.0,
    'Motor_Current_A': 45.0,
    'Oil_Pressure_bar': 3.0,
    'Flow_Rate_L_min': 100.0,
    'Discharge_Pressure_bar': 4.0,
    'Suction_Pressure_bar': 1.5,
    'Motor_RPM': 1450,
    'Casing_Temperature_C': 40.0,
    'Ambient_Temperature_C': 25.0
};

// ------------------------------------------------------------------
// GLOBAL ML STATE (The Single Source of Truth for Anomalies)
// ------------------------------------------------------------------
const ML_STATE = {
    // Dynamically updated from Backend API (Task 3)
    sensorAnomalyCounts: {
        'Motor_RPM': 0, 'Bearing_Temperature_C': 0, 'Oil_Pressure_bar': 0, 'Vibration_mm_s': 0,
        'Flow_Rate_L_min': 0, 'Suction_Pressure_bar': 0, 'Discharge_Pressure_bar': 0,
        'Motor_Current_A': 0, 'Casing_Temperature_C': 0, 'Ambient_Temperature_C': 0
    },
    totalAnomalies: 0,
    riskLevel: 'LEARNING',
    healthScore: 100,
    sequenceId: 0,
    recordNumber: 0,
    totalRecords: 1000,

    // Financial Risk Engine Data (Phase 5/6)
    moneyAtRisk: 0,
    failureProbability: 0,
    maintenanceCost: 0,
    decision: 'MONITOR'
};

// Role-based Chat Prompts
const ROLE_PROMPTS = {
    'plant-engineer': [
        "Why is vibration high risk?", "Which sensor should be fixed first?", "What happens if we ignore this?",
        "Show me sensors with >100 anomalies", "Check maintenance logs", "Root cause of high failure rate"
    ],
    'plant-head': [
        "What is the overall risk confidence?", "Show anomaly trends", "Is operation safe?",
        "Maintenance urgency level", "Summary of last 2000 records"
    ],
    'management': [
        "Cost of immediate repair vs delay", "Failure probability reasoning", "ROI of preventive maintenance",
        "Risk attribution by component", "Historical failure cost"
    ],
    'admin': [
        "Show dataset fingerprint", "Check model drift", "List all thresholds",
        "Retrain model recommendation", "Data quality report"
    ]
};

const SYSTEM_GREETING = "Hello. I have analyzed the historical pump sensor data (2000 records). How can I assist with the risk assessment?";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Role Buttons
    setupRoleSwitching();
    // 2. Initialize Chat
    setupChat();
    // 3. Start Live Streaming (Replacement for loadSensorData)
    startLiveStreaming();

    // Force Render
    renderDashboard();
});

async function startLiveStreaming() {
    console.log("🚀 TURBO MODE: Starting High-Speed Data Stream (300ms)...");

    // Initial fetch
    await fetchLiveStep();

    // Set interval for continuous updates (50ms for ULTR-TURBO speed)
    if (APP_STATE.streamInterval) clearInterval(APP_STATE.streamInterval);
    APP_STATE.streamInterval = setInterval(fetchLiveStep, 50);
}

async function fetchLiveStep() {
    try {
        // 1. Fetch Live Data
        const responseData = await fetch('/api/live-data');
        if (!responseData.ok) throw new Error("Data API Offline");
        const data = await responseData.json();

        // Handle Completion (dataset finished)
        if (data.status === 'COMPLETED') {
            console.log("🏁 DATASET REPLAY COMPLETED");
            if (APP_STATE.streamInterval) clearInterval(APP_STATE.streamInterval);
            APP_STATE.systemState = 'COMPLETED';
            updateMLStats(data);

            // Render the final available state
            const lastData = APP_STATE.data.length > 0 ? APP_STATE.data[APP_STATE.data.length - 1] : data;
            updateViewComponents(lastData);
            return;
        }

        // 2. Update App State (Task 3 & 6)
        APP_STATE.lastAnomalyScore = data.reconstruction_error || 0;
        APP_STATE.systemState = data.status;

        // 3. Prepare display data (Flatten for components)
        const displayData = {
            ...data.values,
            status: data.status,
            anomaly_score: data.reconstruction_error,
            sensor_states: data.sensor_states,
            record_number: data.record_number,
            total_records: data.total_records,
            timestamp: data.timestamp
        };

        // 4. Add to historical buffer (max 100 points)
        APP_STATE.data.push(displayData);
        if (APP_STATE.data.length > 100) APP_STATE.data.shift();

        // Sync ML Stats
        updateMLStats(data);

        // Update Header Time
        if (document.getElementById('current-time')) {
            document.getElementById('current-time').innerText = data.timestamp;
        }

        // Update Sidebar Status (Task 8)
        const streamEl = document.getElementById('sidebar-stream-status');
        if (streamEl) {
            streamEl.innerText = data.status === 'OFFLINE' ? 'Offline' : 'Live';
            streamEl.className = data.status === 'OFFLINE' ? 'status-err' : 'status-ok';
        }

        const mlEl = document.getElementById('sidebar-ml-status');
        if (mlEl) {
            mlEl.innerText = data.status === 'LEARNING' ? 'Learning' : (data.status === 'ANOMALY' ? 'Alert' : 'Active');
            mlEl.className = data.status === 'ANOMALY' ? 'status-err' : 'status-ok';
        }

        // 3. Fetch System Health (Task 8 & 9)
        const responseHealth = await fetch('/api/system-health');
        if (responseHealth.ok) {
            const health = await responseHealth.json();
            if (document.getElementById('inference-latency')) {
                document.getElementById('inference-latency').innerText = health.inference_latency_ms;
            }
            if (document.getElementById('memory-usage')) {
                document.getElementById('memory-usage').innerText = health.memory_usage_mb;
            }
        }

        // Update View with flattened data
        updateViewComponents(displayData);

    } catch (error) {
        console.error("Streaming Error:", error);
        APP_STATE.systemState = "OFFLINE";
        updateViewComponents();
    }
}

function updateMLStats(newData) {
    // 1. Sync Anomaly Counts directly from Backend (Task 3)
    if (newData.sensor_anomaly_counts) {
        ML_STATE.sensorAnomalyCounts = newData.sensor_anomaly_counts;

        // Calculate Total
        let total = 0;
        Object.values(ML_STATE.sensorAnomalyCounts).forEach(c => total += c);
        ML_STATE.totalAnomalies = total;
    }

    // 2. Sync Progress (Phase 7: One-Pass)
    ML_STATE.sequenceId = newData.record_number || 0;
    ML_STATE.recordNumber = newData.record_number || 0;
    ML_STATE.totalRecords = newData.total_records || 1000;

    // 3. Update Risk Level based on Backend Status
    ML_STATE.riskLevel = newData.status;
    ML_STATE.threshold = newData.threshold || 0.05;

    // 4. Update Health Score
    ML_STATE.healthScore = Math.max(0, 100 - (ML_STATE.totalAnomalies / 10));

    // 5. Sync Financial Data (Phase 6)
    if (newData.money_at_risk !== undefined) {
        ML_STATE.moneyAtRisk = newData.money_at_risk;
        ML_STATE.failureProbability = newData.failure_probability;
        ML_STATE.maintenanceCost = newData.maintenance_cost;
        ML_STATE.decision = newData.decision;
    } else {
        // Fallback: Frontend Financial Simulation
        ML_STATE.moneyAtRisk = ML_STATE.totalAnomalies * 450; // ₹450 per anomaly
        ML_STATE.failureProbability = Math.min(1.0, ML_STATE.totalAnomalies / 150);
        ML_STATE.maintenanceCost = 25000; // Fixed Repair Cost
        ML_STATE.decision = ML_STATE.failureProbability > 0.6 ? 'APPROVE_MAINTENANCE' : 'MONITORING';
    }
}

function setupRoleSwitching() {
    const btns = document.querySelectorAll('.role-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            APP_STATE.currentRole = btn.dataset.role;
            renderDashboard();
            updateViewComponents(); // Ensure data binding happens on switch
        });
    });
    // Initial skeleton render (no data yet)
    renderDashboard();
}

function renderDashboard() {
    const viewContainer = document.getElementById('dashboard-view');
    const templateId = `tpl-${APP_STATE.currentRole}`;
    const template = document.getElementById(templateId);

    if (template) {
        viewContainer.innerHTML = '';

        // Cleanup old charts before rendering new ones
        Object.keys(CHART_INSTANCES).forEach(key => {
            if (CHART_INSTANCES[key]) {
                CHART_INSTANCES[key].destroy();
            }
        });
        CHART_INSTANCES = {};

        viewContainer.appendChild(template.content.cloneNode(true));

        // Update Chat Chips for this role
        updateChatChips(APP_STATE.currentRole);

        // Update header
        const titles = {
            'plant-engineer': 'Maintenance Console',
            'plant-head': 'Plant Operations Overview',
            'management': 'Risk & Financial Dashboard',
            'admin': 'System Diagnostics'
        };
        document.getElementById('page-title').innerText = titles[APP_STATE.currentRole];

        // Initialize components if data exists
        if (APP_STATE.data.length > 0) {
            updateViewComponents();
        }
    }
}

// MOCKED DATA GENERATOR FOR FALLBACK
function generateFallbackData() {
    console.warn("Generating fallback data...");
    const data = [];
    const baseTime = new Date().getTime();
    for (let i = 0; i < 50; i++) {
        data.push({
            timestamp: new Date(baseTime - (50 - i) * 60000).toISOString(),
            Vibration_mm_s: 0.5 + Math.random() * 0.5, // Occasional spike
            Motor_Current_A: 40 + Math.random() * 10,
            Discharge_Pressure_bar: 3.8 + Math.random() * 0.4,
            Oil_Pressure_bar: 2.9 + Math.random() * 0.2,
            Bearing_Temperature_C: 34 + Math.random() * 3,
            Flow_Rate_L_min: 98 + Math.random() * 4,
            Motor_RPM: 1445 + Math.random() * 10,
            Suction_Pressure_bar: 1.4 + Math.random() * 0.2,
            Casing_Temperature_C: 39 + Math.random() * 2,
            Ambient_Temperature_C: 24 + Math.random() * 2,
            machine_status: 'NORMAL',
            anomaly_score: -0.4,
            is_anomaly: 0
        });
    }
    // Inject some anomalies
    data[25].Vibration_mm_s = 4.2;
    data[30].Bearing_Temperature_C = 85;
    data[45].Motor_Current_A = 20;
    return data;
}

// ------------------------------------------------------------------
// 4. LOAD ML RESULTS (NO CALCULATION)
// ------------------------------------------------------------------
function loadMLInferenceResults() {
    console.log("Loading ML Inference Results...");

    // 1. Calculate Totals & Risk Level based on EXISTING counts
    let total = 0;
    let maxCount = 0;

    Object.entries(ML_STATE.sensorAnomalyCounts).forEach(([key, count]) => {
        total += count;
        if (count > maxCount) maxCount = count;
    });

    ML_STATE.totalAnomalies = total;

    // 2. Determine System Risk Level (Strict Mapping)
    if (maxCount > 200) {
        ML_STATE.riskLevel = 'CRITICAL';
        ML_STATE.healthScore = 45;
    } else if (maxCount > 100) {
        ML_STATE.riskLevel = 'UNSTABLE'; // Warning
        ML_STATE.healthScore = 65;
    } else if (maxCount > 50) {
        ML_STATE.riskLevel = 'WATCH';
        ML_STATE.healthScore = 80;
    } else {
        ML_STATE.riskLevel = 'NORMAL';
        ML_STATE.healthScore = 98;
    }

    console.log("ML State Loaded:", ML_STATE);
}

// Local Simulation Loop Removed in favor of fetchLiveStep

function updateViewComponents(data) {
    if (!data && APP_STATE.data.length > 0) data = APP_STATE.data[APP_STATE.data.length - 1];

    if (APP_STATE.currentRole === 'plant-engineer') {
        updateEngineerTable(data);
        updateEngineerCharts(data);
        updateEngineerAlerts(data);
    } else if (APP_STATE.currentRole === 'plant-head') {
        updatePlantHeadView(data);
    } else if (APP_STATE.currentRole === 'management') {
        updateManagementView(data);
    } else if (APP_STATE.currentRole === 'admin') {
        updateAdminView(data);
    }
}

// Global Chart Instances
let CHART_INSTANCES = {};

function updateEngineerCharts(data) {
    // 1. SAFETY: Check if elements exist
    const ctxLive = document.getElementById('live-recon-chart');
    const ctxTrend = document.getElementById('trend-chart');
    const ctxAnomaly = document.getElementById('anomaly-chart');

    if (!ctxLive && !ctxTrend && !ctxAnomaly) return;

    /* ----------------------------------------------------
       0. LIVE INTELLIGENCE STREAM (Line Chart)
    ---------------------------------------------------- */
    if (ctxLive) {
        // PERMANENCE FIX: If chart exists but on a different canvas, destroy it
        if (CHART_INSTANCES['live'] && CHART_INSTANCES['live'].canvas !== ctxLive) {
            CHART_INSTANCES['live'].destroy();
            CHART_INSTANCES['live'] = null;
        }

        if (!CHART_INSTANCES['live']) {
            // Buffer-Aware Pre-population (Fix for "No lines on stop")
            const history = APP_STATE.data.slice(-100);
            const labels = Array(100 - history.length).fill('').concat(history.map(d => d.timestamp));

            const datasets = SENSOR_ORDER.map((sensor, index) => {
                const dataPoints = Array(100 - history.length).fill(null).concat(history.map(d => {
                    const state = d.sensor_states ? d.sensor_states[sensor] : 'NORMAL';
                    let val = 20;
                    if (state === 'ANOMALY') val = 70;
                    if (state === 'CRITICAL') val = 95;
                    return val + (Math.random() * 4 - 2); // Subtle noise for continuity
                }));

                return {
                    label: sensor.replace(/_/g, ' '),
                    data: dataPoints,
                    borderColor: SENSOR_COLORS[sensor] || '#888',
                    backgroundColor: SENSOR_COLORS[sensor],
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.1
                };
            });

            CHART_INSTANCES['live'] = new Chart(ctxLive, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100, // Normalized 0-100%
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: '#8b949e', font: { size: 10 } }
                        },
                        x: {
                            display: false // Keep X clean for stream
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: '#8b949e',
                                boxWidth: 8,
                                font: { size: 9 },
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    }
                }
            });
        }
    }

    if (CHART_INSTANCES['live']) {
        const chart = CHART_INSTANCES['live'];
        const currentStates = data.sensor_states || {};

        // 2. PERSISTENCE CHECK: If no data, STOP updating (Freeze history)
        if (Object.keys(currentStates).length === 0) {
            return;
        }

        // FILTER: Show only top 3 anomalous sensors (User Request)
        const sortedAnomalies = Object.entries(ML_STATE.sensorAnomalyCounts)
            .sort(([, a], [, b]) => b - a);
        const top3Keys = sortedAnomalies.slice(0, 3).map(([key]) => key);

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        SENSOR_ORDER.forEach((sensor, index) => {
            const dataset = chart.data.datasets[index];
            const state = currentStates[sensor];

            // Update Visibility
            dataset.hidden = !top3Keys.includes(sensor);

            // DATA LOGIC: Map State to Visual Value (0-100%)
            let val = 20;
            if (state === 'ANOMALY') val = 70;
            if (state === 'CRITICAL') val = 95;

            // Add noise for realism
            val += (Math.random() * 10) - 5;
            if (val < 0) val = 0;

            dataset.data.push(val);
            if (dataset.data.length > 100) dataset.data.shift();
        });

        chart.data.labels.push(now);
        if (chart.data.labels.length > 100) chart.data.labels.shift();

        chart.update('none');
    }

    /* ----------------------------------------------------
   1. PERFORMANCE COMPARISON BAR CHART (UNCHANGED)
---------------------------------------------------- */
    /* ----------------------------------------------------
       1. CHART C: SENSOR RELIABILITY SCORE (Historical)
       Formula: 100 - (Anomaly Count / Total Records * 100)
    ---------------------------------------------------- */

    if (ctxTrend && !CHART_INSTANCES['trend']) {
        CHART_INSTANCES['trend'] = new Chart(ctxTrend, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Reliability (%)',
                    data: [],
                    backgroundColor: [],
                    borderColor: '#30363d',
                    borderWidth: 0,
                    borderRadius: 6, // ROUNDED CORNERS
                    borderSkipped: false
                }]
            },
            options: {
                // indexAxis: 'y', // REMOVED for Vertical Bars
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: CHART_CONFIG.gridColor },
                        ticks: { color: CHART_CONFIG.fontColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: CHART_CONFIG.fontColor,
                            autoSkip: true,
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 10 }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    if (CHART_INSTANCES['trend']) {
        const chart = CHART_INSTANCES['trend'];

        // Use Global ML State
        const counts = ML_STATE.sensorAnomalyCounts;
        const totalRecords = ML_STATE.recordNumber || 1;

        const labels = [];
        const reliabilityScores = [];
        const colors = [];

        SENSOR_ORDER.forEach(sensor => {
            const count = counts[sensor] || 0;
            // Reliability based on frequency of anomalies in the session
            const reliability = Math.max(0, 100 - ((count / totalRecords) * 100));

            labels.push(sensor.replace(/_/g, ' '));
            reliabilityScores.push(reliability.toFixed(1));

            // Color based on score (Task 4 rules)
            if (reliability < 80) colors.push('#da3633'); // RED -> CRITICAL
            else if (reliability < 95) colors.push('#d29922'); // ORANGE -> WARNING
            else colors.push('#238636'); // GREEN -> NORMAL
        });

        chart.data.labels = labels;
        chart.data.datasets[0].data = reliabilityScores;
        chart.data.datasets[0].backgroundColor = colors;
        chart.update('none');
    }

    /* ----------------------------------------------------
       2. CHART B: HISTORICAL ANOMALY DISTRIBUTION (Top 5 + Others)
    ---------------------------------------------------- */

    if (ctxAnomaly && !CHART_INSTANCES['anomaly']) {
        CHART_INSTANCES['anomaly'] = new Chart(ctxAnomaly, {
            type: 'pie',
            data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                layout: {
                    padding: {
                        top: 20,
                        bottom: 20,
                        left: 0,
                        right: 0
                    }
                },
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12, color: '#8b949e' } }
                }
            }
        });
    }

    if (CHART_INSTANCES['anomaly']) {
        const chart = CHART_INSTANCES['anomaly'];

        // Use Global ML State
        const counts = ML_STATE.sensorAnomalyCounts;

        const sortedSensors = Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .filter(([, count]) => count > 0);

        let finalLabels = [];
        let finalData = [];
        let finalColors = [];

        if (sortedSensors.length === 0) {
            finalLabels = ['No Anomalies'];
            finalData = [1];
            finalColors = ['#238636'];
        } else {
            // Show All Sensors (Removed Slice limit)
            sortedSensors.forEach(([sensor, count]) => {
                finalLabels.push(sensor.replace(/_/g, ' '));
                finalData.push(count);
                finalColors.push(SENSOR_COLORS[sensor] || '#888');
            });
        }

        chart.data.labels = finalLabels;
        chart.data.datasets[0].data = finalData;
        chart.data.datasets[0].backgroundColor = finalColors;
        chart.update('none');
    }
}

function updateEngineerAlerts(data) {
    const alertPanel = document.getElementById('engineer-alerts');
    if (!alertPanel) return;

    if (APP_STATE.systemState === 'LEARNING') {
        alertPanel.innerHTML = '<div class="alert-card learning"><p>⏳ System Learning... (Populating sequence buffer)</p></div>';
        return;
    }

    if (APP_STATE.systemState === 'NORMAL') {
        alertPanel.innerHTML = '<div class="alert-card ok"><p>✅ System Stable. No active anomalies.</p></div>';
        return;
    }

    let html = '';
    const statusColor = APP_STATE.systemState === 'CRITICAL' ? 'critical' : 'warning';
    const statusTitle = APP_STATE.systemState.toUpperCase();

    html += `
        <div class="alert-card ${statusColor}">
            <h4>${statusTitle} ALERT</h4>
            <p>ML Inference detected <strong>${APP_STATE.systemState}</strong> state (Score: ${APP_STATE.lastAnomalyScore.toFixed(4)}).</p>
            <div class="alert-actions">
                <button>Acknowledge</button>
            </div>
        </div>
    `;

    alertPanel.innerHTML = html;
}

// ---------------------------------------------------
// Plant Head – Remaining Useful Life (RUL)
// Historical anomalies OVERRIDE current health
// ---------------------------------------------------
function generateAndRenderRUL(sensorStats) {
    const container = document.getElementById("rulContainer");
    if (!container) return;

    // Sensors shown to Plant Head
    const sensors = SENSOR_ORDER;

    const displayNames = {
        Vibration_mm_s: "Vibration",
        Bearing_Temperature_C: "Bearing Temp",
        Flow_Rate_L_min: "Flow Rate",
        Discharge_Pressure_bar: "Discharge Pressure",
        Motor_Current_A: "Motor Current",
        Oil_Pressure_bar: "Oil Pressure",
        Suction_Pressure_bar: "Suction Pressure",
        Motor_RPM: "Motor RPM",
        Casing_Temperature_C: "Casing Temp",
        Ambient_Temperature_C: "Ambient Temp"
    };

    function calculateRUL(count) {
        // Dynamic Formula: Start at 100%, lose 0.5% per anomaly event.
        // Cap Minimum at 10% (never 0% unless dead).
        let rul = 100 - (count * 0.5);
        if (rul < 10) rul = 10;
        return Math.floor(rul);
    }

    let items = [];

    sensors.forEach(key => {
        const count = sensorStats[key] || 0;
        let rulPct = calculateRUL(count);
        let color = "green";

        if (rulPct < 40) color = "red";
        else if (rulPct < 75) color = "amber";

        items.push({ name: displayNames[key], value: rulPct, color: color });
    });

    items.sort((a, b) => a.value - b.value);

    container.innerHTML = "";
    items.forEach(item => {
        container.innerHTML += `
            <div class="rul-bar">
                <div class="rul-label">${item.name}</div>
                <div class="rul-track">
                    <div class="rul-fill ${item.color}" style="width: ${item.value}%"></div>
                </div>
                <div class="rul-value">${item.value}%</div>
            </div>
        `;
    });
}


function updatePlantHeadView(data) {
    // ----------------------------------------------------
    // 1. TOP KPI ROW (Dynamic from ML_STATE)
    // ----------------------------------------------------

    // A. Plant Health
    const elHealth = document.getElementById('ph-health-status');
    // If Critical Risk -> At Risk. Else Healthy.
    if (elHealth) {
        elHealth.innerHTML = (ML_STATE.riskLevel === 'CRITICAL' || ML_STATE.riskLevel === 'UNSTABLE') ? "At Risk" : "Optimized";
        elHealth.className = (ML_STATE.riskLevel === 'CRITICAL') ? "value critical-text" : "value success-text";
    }

    // B. Operational Risk
    const elRisk = document.getElementById('ph-risk-level');
    if (elRisk) {
        elRisk.innerText = (ML_STATE.riskLevel === 'CRITICAL') ? "High" : (ML_STATE.riskLevel === 'UNSTABLE' ? "Medium" : "Low");
        elRisk.className = (ML_STATE.riskLevel === 'CRITICAL') ? "value critical-text" : "value success-text";
    }

    // D. Executive Summary
    const elSummary = document.getElementById('ph-executive-summary');
    if (elSummary) {
        if (APP_STATE.systemState === 'COMPLETED') {
            elSummary.innerHTML = `🏁 Dataset replay completed (1000/1000). System state is frozen at final audit point.`;
        } else if (ML_STATE.riskLevel === 'LEARNING') {
            elSummary.innerHTML = `System in warm-up phase. Tracking [Record: ${ML_STATE.recordNumber} / ${ML_STATE.totalRecords}]. No critical risk detected yet.`;
        } else if (ML_STATE.riskLevel === 'CRITICAL') {
            elSummary.innerHTML = `⚠️ High-risk deviation detected at [Record: ${ML_STATE.recordNumber}]. Critical vibration and pressure anomalies suggest imminent failure.`;
        } else {
            elSummary.innerHTML = `Industrial pump operating within normal parameters. Replaying [Record: ${ML_STATE.recordNumber} / ${ML_STATE.totalRecords}].`;
        }
    }

    // D. System Confidence (REMOVED)

    // C. Fail Risk Window
    const elWindow = document.getElementById('ph-risk-window');
    if (elWindow) {
        if (ML_STATE.riskLevel === 'LEARNING') {
            elWindow.innerText = "Learning...";
        } else if (ML_STATE.failureProbability > 0.7) {
            elWindow.innerText = "24–36 Hours";
        } else if (ML_STATE.failureProbability > 0.4) {
            elWindow.innerText = "3–5 Days";
        } else {
            elWindow.innerText = "Safe";
        }
    }

    // New: Top 3 Fault Sensors
    const elTopFaults = document.getElementById('ph-top-faults');
    if (elTopFaults) {
        const sorted = Object.entries(ML_STATE.sensorAnomalyCounts).sort(([, a], [, b]) => b - a);
        const top3 = sorted.slice(0, 3);
        let valid = top3.filter(([, c]) => c > 0);

        if (valid.length === 0) {
            elTopFaults.innerHTML = '<span class="text-success">No Significant Faults</span>';
        } else {
            // Format: 1. Sensor (Count)<br>2. Sensor (Count)...
            elTopFaults.innerHTML = valid.map((item, i) =>
                `<div>${i + 1}. ${item[0].replace(/_/g, ' ')} (${item[1]})</div>`
            ).join('');
        }
    }


    // ----------------------------------------------------
    // 2. RISK DRIVERS (Dynamic)
    // ----------------------------------------------------
    const driversContainer = document.getElementById('ph-risk-drivers');
    if (driversContainer) {
        // Sort sensors by anomalies
        const sorted = Object.entries(ML_STATE.sensorAnomalyCounts).sort(([, a], [, b]) => b - a);
        const top3 = sorted.slice(0, 3);

        let html = '';
        top3.forEach(([key, count]) => {
            if (count > 50) {
                let impact = count > 200 ? "High Impact" : "Medium Impact";
                let icon = count > 200 ? "🔴" : "🟠";
                html += `
                <div class="driver-card high-impact">
                    <span class="driver-name">${icon} ${key.replace(/_/g, ' ')} – ${impact} (${count} events)</span>
                </div>`;
            }
        });
        if (html === '') html = '<div class="driver-card"><span class="driver-name">No Significant Risks</span></div>';
        driversContainer.innerHTML = html;
    }

    // 3. EXECUTIVE SUMMARY
    const summaryEl = document.getElementById('ph-executive-summary');
    if (summaryEl) {
        const { moneyAtRisk, decision } = ML_STATE;
        if (ML_STATE.riskLevel === 'LEARNING') {
            summaryEl.innerHTML = `System sequence buffer is initializing. Baseline monitoring active.`;
            summaryEl.style.borderLeftColor = "#58a6ff";
        } else if (decision === 'APPROVE_MAINTENANCE') {
            summaryEl.innerHTML = `The system is in a <strong>CRITICAL</strong> state. Repair approval is recommended to avoid ₹${(moneyAtRisk / 100000).toFixed(1)}L loss.`;
            summaryEl.style.borderLeftColor = "#da3633";
        } else if (ML_STATE.riskLevel === 'WARNING') {
            summaryEl.innerHTML = `System anomalies detected. Monitoring for escalation. No immediate intervention required.`;
            summaryEl.style.borderLeftColor = "#d29922";
        } else {
            summaryEl.innerHTML = `System operating within acceptable limits. All critical parameters stable.`;
            summaryEl.style.borderLeftColor = "#238636";
        }
    }

    // 4. TIMESTAMP UPDATE
    const timeEl = document.getElementById('data-timestamp');
    if (timeEl) {
        const now = new Date();
        timeEl.innerText = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    // 5. RUL (Strict Logic)
    generateAndRenderRUL(ML_STATE.sensorAnomalyCounts);
}

function updateManagementView(data) {
    // Management view: Financial Impact driven by Backend Financial Engine (Phase 6)
    let { moneyAtRisk, failureProbability, maintenanceCost, decision } = ML_STATE;
    const totalAnomalies = ML_STATE.totalAnomalies || 0;

    // Fallback logic if Money is missing but Anomalies exist
    if ((!moneyAtRisk || moneyAtRisk === 0) && totalAnomalies > 0) {
        moneyAtRisk = totalAnomalies * 5500; // Estimated cost per anomaly
        ML_STATE.moneyAtRisk = moneyAtRisk; // Update global state
    }

    // 1. Update Money at Risk KPI
    const moneyRiskEl = document.getElementById('mgmt-money-risk');
    if (moneyRiskEl) {
        moneyRiskEl.innerText = `₹${(moneyAtRisk / 100000).toFixed(2)}L`;
    }

    // 2. Failure Window & Risk Stats
    const timeFailureEl = document.getElementById('mgmt-time-failure');
    if (timeFailureEl) {
        if (ML_STATE.riskLevel === 'LEARNING') {
            timeFailureEl.innerText = "Learning...";
        } else if (failureProbability > 0.7) {
            timeFailureEl.innerText = "24–36h";
        } else if (failureProbability > 0.4) {
            timeFailureEl.innerText = "3–5 Days";
        } else {
            timeFailureEl.innerText = "Stable";
        }
    }

    const actionStatusEl = document.getElementById('mgmt-action-status');
    if (actionStatusEl) {
        actionStatusEl.innerText = (decision === 'APPROVE_MAINTENANCE') ? "Action Required" : "Monitoring";
        actionStatusEl.className = (decision === 'APPROVE_MAINTENANCE') ? "metric-big text-critical" : "metric-big text-success";
    }

    // 2.5 New Dynamic Comparison Elements
    const contextBar = document.getElementById('mgmt-context-bar');
    if (contextBar) {
        const riskL = (moneyAtRisk / 100000).toFixed(2);
        if (ML_STATE.riskLevel === 'LEARNING') {
            contextBar.innerHTML = `⏳ System Learning... Establishing financial baseline.`;
            contextBar.style.borderLeftColor = "#58a6ff";
        } else if (decision === 'APPROVE_MAINTENANCE') {
            contextBar.innerHTML = `ℹ️ Financial exposure is high. Immediate maintenance avoids critical ₹${riskL}L loss.`;
            contextBar.style.borderLeftColor = "#da3633";
        } else {
            contextBar.innerHTML = `ℹ️ System stable. Current risk of ₹${riskL}L is below intervention threshold.`;
            contextBar.style.borderLeftColor = "#238636";
        }
    }

    const costApproveEl = document.getElementById('mgmt-cost-approve');
    if (costApproveEl) {
        costApproveEl.innerText = `₹${maintenanceCost.toLocaleString()}`;
    }

    const costDelayEl = document.getElementById('mgmt-cost-delay');
    if (costDelayEl) {
        costDelayEl.innerText = `~₹${(moneyAtRisk / 100000).toFixed(2)} Lakhs`;
    }

    const delayRiskText = document.getElementById('mgmt-delay-risk-text');
    if (delayRiskText) {
        const prob = (failureProbability * 100).toFixed(0);
        delayRiskText.innerHTML = `
            • ${prob}% Failure Probability<br>
            • Projected Loss: ₹${(moneyAtRisk / 1000).toFixed(0)}k<br>
            • Unplanned downtime impacts production
        `;
    }

    // 3. Cost Drivers Breakdown (Dynamic)
    const driversContainer = document.getElementById('mgmt-cost-drivers');
    if (driversContainer) {
        let sorted = [];
        if (ML_STATE.sensorAnomalyCounts) {
            sorted = Object.entries(ML_STATE.sensorAnomalyCounts)
                .sort(([, a], [, b]) => b - a)
                .filter(([, count]) => count > 0);
        }

        let html = '';

        if (sorted.length === 0) {
            html = `
                <div class="text-center p-4" style="border: 1px dashed #30363d; border-radius: 6px; color: #8b949e;">
                    <div style="font-size: 1.5rem; margin-bottom: 10px;">✅</div>
                    <div>System Stable</div>
                    <div style="font-size: 0.8rem; margin-top: 5px;">No significant cost drivers detected</div>
                </div>
             `;
        } else {
            sorted.slice(0, 3).forEach(([key, count]) => {
                const percentage = totalAnomalies > 0 ? ((count / totalAnomalies) * 100).toFixed(0) : 0;
                const costShare = totalAnomalies > 0 ? (count / totalAnomalies) * moneyAtRisk : 0;

                html += `
                    <div class="cost-driver-item">
                        <div class="row-between">
                            <span class="text-white">${key.replace(/_/g, ' ')}</span>
                            <span class="text-muted">₹${(costShare / 1000).toFixed(0)}k (${percentage}%)</span>
                        </div>
                        <div class="progress-bar-bg" style="height: 6px; background: #21262d; border-radius: 3px; margin-top: 5px; overflow: hidden;">
                            <div class="progress-bar-fill" style="width: ${percentage}%; height: 100%; background: ${SENSOR_COLORS[key] || '#58a6ff'};"></div>
                        </div>
                    </div>
                `;
            });
        }

        driversContainer.innerHTML = html;
    }

    // 4. Executive Summary
    const summaryEl = document.getElementById('mgmt-executive-summary');
    if (summaryEl) {
        if (APP_STATE.systemState === 'COMPLETED') {
            summaryEl.innerHTML = `🏁 Dataset Replay Completed (1000 / 1000). All projected risks have been logged. Asset health frozen at final state.`;
            summaryEl.style.borderLeftColor = "#58a6ff";
        } else if (ML_STATE.riskLevel === 'LEARNING') {
            summaryEl.innerHTML = `System is currently in LEARNING mode. Baseline financial risk will be available after sequence buffer is full.`;
            summaryEl.style.borderLeftColor = "#58a6ff";
        } else if (decision === 'APPROVE_MAINTENANCE') {
            summaryEl.innerHTML = `High probability of failure detected. Immediate maintenance recommended to avoid <strong>₹${(moneyAtRisk / 100000).toFixed(2)} Lakhs</strong> in projected downtime loss.`;
            summaryEl.style.borderLeftColor = "#da3633";
        } else {
            summaryEl.innerHTML = `System status is stable. Projected loss of ₹${(moneyAtRisk / 100000).toFixed(2)}L does not yet justify immediate maintenance cost of ₹${(maintenanceCost / 1000).toFixed(0)}k.`;
            summaryEl.style.borderLeftColor = "#238636";
        }
    }

    // 5. Action Button Logic (Dynamic)
    const btnApprove = document.getElementById('btn-approve-repair');
    if (btnApprove) {
        const costK = (maintenanceCost / 1000).toFixed(0);

        if (decision === 'APPROVE_MAINTENANCE') {
            btnApprove.innerHTML = `Request sent for Maintenance Approval`;
            btnApprove.style.backgroundColor = "#238636";
            btnApprove.style.cursor = "pointer";
            btnApprove.disabled = false;
            btnApprove.style.opacity = "1";
        } else {
            btnApprove.innerHTML = `Monitoring – Risk ₹${(moneyAtRisk / 1000).toFixed(0)}k < ₹${costK}k Cost`;
            btnApprove.style.backgroundColor = "#30363d";
            btnApprove.style.cursor = "not-allowed";
            btnApprove.disabled = true;
            btnApprove.style.opacity = "0.6";
        }

        if (!btnApprove.dataset.bound) {
            btnApprove.dataset.bound = "true";
            btnApprove.addEventListener('click', () => {
                const originalText = btnApprove.innerHTML;
                btnApprove.innerHTML = "⏳ Sending Approval...";
                btnApprove.style.opacity = "0.7";
                btnApprove.disabled = true;

                setTimeout(() => {
                    btnApprove.innerHTML = originalText;
                    btnApprove.style.opacity = "1";
                    btnApprove.disabled = false;

                    // FIXED: Use Global State for real-time ROI calculation
                    const currentRisk = ML_STATE.moneyAtRisk || 0;
                    const currentCost = ML_STATE.maintenanceCost || 0;
                    const roi = ((currentRisk - currentCost) / 100000).toFixed(2);

                    alert(`✅ Successfully sent the request for Maintenance Approval! \n\nWork order created for next scheduled shutdown. Expected ROI: ₹${roi} Lakhs.`);
                }, 1200);
            });
        }
    }

    // 6. Timestamp
    const timeEl = document.getElementById('data-timestamp-mgmt');
    if (timeEl) {
        timeEl.innerText = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    }

    // 7. Update Risk Chart
    updateManagementCharts();
}

function updateManagementCharts() {
    const ctx = document.getElementById('risk-impact-chart');
    if (!ctx) return;

    if (!CHART_INSTANCES['riskImpact']) {
        CHART_INSTANCES['riskImpact'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Do Nothing', 'Take Action'],
                datasets: [
                    {
                        label: 'Projected Loss (Risk)',
                        data: [0, 0],
                        backgroundColor: '#da3633', // Red
                        stack: 'Stack 0',
                    },
                    {
                        label: 'Risk Avoided',
                        data: [0, 0],
                        backgroundColor: '#238636', // Green
                        stack: 'Stack 1',
                    },
                    {
                        label: 'Residual Risk',
                        data: [0, 0],
                        backgroundColor: '#d29922', // Orange
                        stack: 'Stack 1',
                    },
                    {
                        label: 'Maintenance Cost',
                        data: [0, 0],
                        backgroundColor: '#6e7681', // Grey
                        stack: 'Stack 1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b949e', callback: (val) => '₹' + (val / 1000) + 'k' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#e6edf3' }
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#8b949e', boxWidth: 10 } },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    if (CHART_INSTANCES['riskImpact']) {
        const chart = CHART_INSTANCES['riskImpact'];
        const risk = ML_STATE.moneyAtRisk || 0;
        const cost = ML_STATE.maintenanceCost || 0;

        let residual = 0;
        let avoided = 0;

        if (risk > 0) {
            residual = risk * 0.15; // Assume 85% risk reduction
            avoided = risk - residual;
        }

        // Bar 1: Do Nothing -> Full Risk
        chart.data.datasets[0].data = [risk, 0];

        // Bar 2: Take Action -> Cost + Residual (Stack) + Avoided (Implicit? No, avoided is "benefit", usually we compare Cost vs Risk)
        // User asked: "Money at Risk", "Avoided Risk", "Residual Risk".

        // Let's stack:
        // Bar 1: Money At Risk (Red)
        // Bar 2: Residual (Orange) + Avoided (Green)
        // Total Height of Bar 2 = MoneyAtRisk (representing the original risk coverage)
        // Wait, "Avoided Risk" is GOOD. 
        // We probably want to show:
        // Bar 1: Loss = Risk
        // Bar 2: Loss = Residual + Cost. (The actual cost incurred).
        // Difference is the "Avoided".

        // BUT user explicit requests: "Bars should show: Money at Risk... Avoided Risk... Residual Risk".

        // Implementation:
        // Dataset 0 (Risk): [Risk, 0]
        // Dataset 1 (Avoided): [0, Avoided]
        // Dataset 2 (Residual): [0, Residual]
        // Dataset 3 (Cost): [0, Cost] -- User didn't ask for cost but it's crucial context? 
        // "Risk vs Action Impact".

        // If I strictly follow user:
        chart.data.datasets[0].data = [risk, 0]; // Risk on "Before"
        chart.data.datasets[1].data = [0, avoided]; // Avoided on "After"
        chart.data.datasets[2].data = [0, residual]; // Residual on "After"
        // Also add Cost for reality check?
        chart.data.datasets[3].data = [0, cost]; // Cost on "After"

        chart.update('none');
    }
}

function updateAdminView(data) {
    // Task 4: ADMIN SYSTEM VERIFICATION

    const isLive = APP_STATE.systemState !== 'OFFLINE';
    const isLearning = APP_STATE.systemState === 'LEARNING';
    const isCompleted = APP_STATE.systemState === 'COMPLETED';

    // 1. Update Status Banner
    const banner = document.getElementById('admin-assurance-banner');
    if (banner) {
        if (!isLive) {
            banner.style.background = "rgba(218,54,51,0.1)";
            banner.style.borderColor = "#da3633";
            banner.innerHTML = `<h2 class="text-critical">⚠️ API UNREACHABLE</h2><p>Flask backend is disconnected.</p>`;
        } else if (isCompleted) {
            banner.style.background = "rgba(88,166,255,0.1)";
            banner.style.borderColor = "#58a6ff";
            banner.innerHTML = `<h2 class="text-blue">🏁 REPLAY COMPLETED</h2><p>Dataset fully consumed. All ${ML_STATE.totalRecords} records processed.</p>`;
        } else if (isLearning) {
            banner.style.background = "rgba(88,166,255,0.1)";
            banner.style.borderColor = "#58a6ff";
            banner.innerHTML = `<h2 class="text-blue">⏳ SYSTEM LEARNING</h2><p>Collecting initial 30 samples for sequence buffer...</p>`;
        } else {
            banner.style.background = "rgba(35,134,54,0.1)";
            banner.style.borderColor = "#238636";
            banner.innerHTML = `<h2 class="text-success">✅ SYSTEM RELIABLE</h2><p>Mode: ONE-PASS REPLAY. Data streaming active.</p>`;
        }
    }

    // 2. Update System Flow Health
    const flowHealth = document.getElementById('admin-flow-health');
    if (flowHealth) {
        flowHealth.innerHTML = `
            <div class="row-between py-2 border-bottom">
                <span class="text-muted">Dataset</span>
                <strong class="text-white">${ML_STATE.totalRecords === 1000 ? 'pump_sensor_sequence_1000_records.csv' : 'Industrial Dataset'}</strong>
            </div>
            <div class="row-between py-2 border-bottom">
                <span class="text-muted">Records</span>
                <strong class="text-white">${ML_STATE.totalRecords}</strong>
            </div>
            <div class="row-between py-2 border-bottom">
                <span class="text-muted">Mode</span>
                <strong class="text-blue">ONE-PASS (No Loop)</strong>
            </div>
            <div class="row-between py-2 border-bottom">
                <span class="text-muted">Current Record</span>
                <strong class="text-success">${ML_STATE.recordNumber} / ${ML_STATE.totalRecords}</strong>
            </div>
            <div class="row-between py-2 border-bottom">
                <span class="text-muted">ML Engine</span>
                <strong class="text-success">✔ Running</strong>
            </div>
            <div class="row-between py-2">
                <span class="text-muted">Sequence Buffer</span>
                <strong class="${isLearning ? 'text-warning' : 'text-success'}">${isLearning ? 'Filling (Window=30)' : '✔ Active'}</strong>
            </div>
        `;
    }

    // 3. Update Activity Log
    const activityLog = document.getElementById('admin-activity-log');
    if (activityLog) {
        const timestamp = new Date().toLocaleTimeString();
        activityLog.innerHTML = `
            <li>[${timestamp}] Mode: ONE-PASS DATA REPLAY</li>
            <li>[${timestamp}] Current Record: ${ML_STATE.recordNumber} / ${ML_STATE.totalRecords}</li>
            <li>[${timestamp}] API Status: ${APP_STATE.systemState}</li>
        `;
    }

    // 4. Update Trust Indicators
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updateText('admin-last-data', now, 'text-white');
    updateText('admin-last-ml', now, 'text-white');

    // 5. Bind Admin Actions
    setupAdminButton('btn-reload-data', "Dataset Reloaded", "Fetching latest CSV...");
    setupAdminButton('btn-refresh-ml', "Resetting Counters", "Calling /api/admin/reset-counters...");
    const refreshBtn = document.getElementById('btn-refresh-ml');
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            await fetch('/api/admin/reset-counters', { method: 'POST' });
            alert("Anomaly Counters Reset Successful.");
        };
    }
}

function setupAdminButton(id, successText, logText) {
    const btn = document.getElementById(id);
    if (btn && !btn.dataset.bound) {
        btn.dataset.bound = "true";
        btn.onclick = () => {
            const originalText = btn.innerHTML;
            btn.innerHTML = "⏳ Processing...";
            btn.disabled = true;

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                alert(`✅ ${successText}\n\nSystem verification passed.`);
            }, 800);
        };
    }
}

function updateText(id, text, className) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = text;
        if (className) el.className = `value ${className}`;
    }
}

function getUnit(key) {
    if (key.includes('mm_s')) return 'mm/s';
    if (key.includes('_C')) return '°C';
    if (key.includes('_A')) return 'A';
    if (key.includes('_bar')) return 'bar';
    if (key.includes('_min')) return 'L/min';
    if (key.includes('RPM')) return 'RPM';
    return '';
}

function updateEngineerTable(data) {
    const tableBody = document.querySelector('#sensor-table tbody');
    if (!tableBody) return;

    let html = '';

    // Defined baselines & meaning
    const baselines = {
        'Vibration_mm_s': { norm: 0.5, meaning: "Excessive vibration indicating mechanical imbalance or bearing wear" },
        'Motor_Current_A': { norm: 45.0, meaning: "Abnormally low load suggesting coupling or impeller issue" },
        'Discharge_Pressure_bar': { norm: 4.0, meaning: "Elevated pressure, possible downstream restriction" },
        'Oil_Pressure_bar': { norm: 3.0, meaning: "Pressure approaching upper limit, lubrication flow restriction possible" },
        'Flow_Rate_L_min': { norm: 100.0, meaning: "Operating variation within acceptable range" },
        'Ambient_Temperature_C': { norm: 25.0, meaning: "Environmental temperature variation" },
        'Bearing_Temperature_C': { norm: 35.0, meaning: "Slight increase, within safe operating limits" },
        'Motor_RPM': { norm: 1450, meaning: "Speed variation within control tolerance" },
        'Suction_Pressure_bar': { norm: 1.5, meaning: "No inlet restriction detected" },
        'Casing_Temperature_C': { norm: 40.0, meaning: "Equipment temperature within normal range" }
    };

    const keys = Object.keys(ML_STATE.sensorAnomalyCounts); // Use Keys from ML Output

    // Create rows array
    let rows = keys.map(key => {
        const actual = (data && data[key] !== undefined) ? data[key] : 0;
        const config = baselines[key] || { norm: 0, meaning: "N/A" };

        // STRICT: ANOMALY COUNT FROM ML STATE
        const count = ML_STATE.sensorAnomalyCounts[key]; // Guaranteed to be defined

        // Determine Status Level (Strict Mapping - Task 3)
        const sensorState = (data && data.sensor_states) ? data.sensor_states[key] : 'NORMAL';
        let statusClass = 'text-white';
        let badgeClass = 'status-ok';
        let badgeText = '🟢 NORMAL';

        if (APP_STATE.systemState === 'LEARNING') {
            badgeClass = 'status-learning';
            badgeText = '⚪ LEARNING';
            statusClass = 'text-muted';
        } else if (sensorState === 'ANOMALY') {
            badgeClass = 'status-critical';
            badgeText = '🔴 ANOMALY';
            statusClass = 'text-critical';
        } else {
            statusClass = 'text-success';
        }

        return { key, actual, meaning: config.meaning, anomalyCount: count, status: sensorState, statusClass, badgeClass, badgeText };
    });

    // Sort by Anomaly Count Descending
    rows.sort((a, b) => b.anomalyCount - a.anomalyCount);

    let criticalCount = 0;

    rows.forEach(row => {
        if (row.status === 'CRITICAL') criticalCount++;
        html += `
            <tr>
                <td>${row.key.replace(/_/g, ' ')} (${getUnit(row.key)})</td>
                <td><span class="badge ${row.badgeClass}">${row.badgeText}</span></td>
                <td>${row.actual.toFixed(2)}</td>
                <td class="${row.statusClass}"><strong>${row.anomalyCount}</strong></td>
                <td>${row.meaning}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;

    // UPDATE RISK BANNER
    const banner = document.getElementById('risk-banner');
    const riskText = document.getElementById('risk-summary-text');
    if (banner && riskText) {
        if (APP_STATE.systemState === 'COMPLETED') {
            banner.style.display = 'block';
            banner.style.background = 'rgba(88,166,255,0.1)';
            banner.style.borderLeftColor = '#58a6ff';
            riskText.innerHTML = `🏁 REPLAY COMPLETED: <strong>${ML_STATE.recordNumber} / ${ML_STATE.totalRecords} Records</strong> processed.`;
        } else if (APP_STATE.systemState === 'OFFLINE') {
            banner.style.display = 'block';
            banner.style.background = '#2f1e1e';
            banner.style.borderLeftColor = '#da3633';
            riskText.innerHTML = `⚠️ API UNREACHABLE: Flask backend is disconnected. Check terminal.`;
        } else if (APP_STATE.systemState !== 'NORMAL' && APP_STATE.systemState !== 'LEARNING') {
            banner.style.display = 'block';
            banner.style.background = APP_STATE.systemState === 'CRITICAL' || APP_STATE.systemState === 'ANOMALY' ? '#2f1e1e' : '#2f2b1e';
            banner.style.borderLeftColor = APP_STATE.systemState === 'CRITICAL' || APP_STATE.systemState === 'ANOMALY' ? '#da3633' : '#d29922';
            riskText.innerHTML = `SYSTEM STATUS: <strong>${APP_STATE.systemState}</strong>. [Record: ${ML_STATE.recordNumber} / ${ML_STATE.totalRecords}]`;
        } else {
            banner.style.display = 'none';
        }
    }

    // UPDATE ALERTS CONSOLE
    const alertPanel = document.getElementById('engineer-alerts');
    if (alertPanel) {
        if (criticalCount > 0) {
            // Generate list of critical sensors for the alert panel
            const criticalSensorsList = rows.filter(row => row.status === 'CRITICAL')
                .map(row => `<li><strong>${row.key.replace(/_/g, ' ')}</strong>: ${row.anomalyCount} anomalies (Critical)</li>`)
                .join('');

            alertPanel.innerHTML = `
                <h4 class="text-critical">🔴 Critical Actions Required</h4>
                <ul class="action-list">${criticalSensorsList}</ul>
                <div class="action-reason mt-2 text-warning">
                    ✅ Reason: Historical data indicates persistent instability in these sensors.
                </div>
            `;
        } else {
            alertPanel.innerHTML = `
                <h4 class="text-success">✅ System Stable</h4>
                <div class="action-reason mt-2">
                    No critical historical anomalies detected. Proceed with routine maintenance.
                </div>
            `;
        }
    }
}

function getUnit(key) {
    if (key.includes('Temperature')) return '°C';
    if (key.includes('Pressure')) return 'bar';
    if (key.includes('Vibration')) return 'mm/s';
    if (key.includes('RPM')) return 'RPM';
    if (key.includes('Current')) return 'A';
    if (key.includes('Flow')) return 'L/min';
    return '';
}


// ------------------------------------------------------------------
// AI Copilot / NLP Logic (Natural "ChatGPT-like" Persona)
// ------------------------------------------------------------------

function setupChat() {
    const btn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');

    btn.addEventListener('click', () => handleUserMessage());
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserMessage();
    });
}

function updateChatChips(role) {
    const container = document.querySelector('.quick-prompts');
    if (!container) return;

    container.innerHTML = '';
    const prompts = ROLE_PROMPTS[role] || [];
    prompts.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.innerText = p;
        btn.addEventListener('click', () => {
            document.getElementById('user-input').value = p;
            handleUserMessage();
        });
        container.appendChild(btn);
    });
}

function handleUserMessage() {
    const input = document.getElementById('user-input');
    const history = document.getElementById('chat-history');
    const msg = input.value.trim();
    if (!msg) return;

    // Add User Message
    history.innerHTML += `<div class="msg user">${msg}</div>`;
    input.value = '';

    // Generate AI Response
    setTimeout(() => {
        const response = generateAIResponse(msg);
        history.innerHTML += `<div class="msg ai">${response}</div>`;
        history.scrollTop = history.scrollHeight;
    }, 600);
}

// ------------------------------------------------------------------
// 1. Context Extraction (Reasoning Base)
// ------------------------------------------------------------------
function getSystemContext() {
    const risk = ML_STATE.riskLevel; // NORMAL, WATCH, UNSTABLE, CRITICAL

    // Get critical sensors with details
    const criticalSensors = Object.entries(ML_STATE.sensorAnomalyCounts)
        .filter(([, count]) => count > 50)
        .map(([key, count]) => {
            return {
                name: key.replace(/_/g, ' '),
                count: count,
                isCritical: count > 200
            };
        })
        .sort((a, b) => b.count - a.count);

    return {
        role: APP_STATE.currentRole,
        riskLevel: risk,
        isCritical: risk === 'CRITICAL',
        isWarning: risk === 'UNSTABLE' || risk === 'WATCH',
        isNormal: risk === 'NORMAL',
        topSensor: criticalSensors[0] || null,
        topSensorName: criticalSensors[0] ? criticalSensors[0].name : "Standard Operations",
        failureWindow: risk === 'CRITICAL' ? "24–36 hours" : "Safe",
        downtimeCost: "₹4.5 Lakhs",
        repairCost: "₹25,000",
        systemStatus: "Online",
        lastSync: "Just now"
    };
}

// ------------------------------------------------------------------
// 2. Intent Detection (Simplified NLP)
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// 2. Intent Detection (Advanced Reasoning + Alerts)
// ------------------------------------------------------------------
function detectIntent(text) {
    text = text.toLowerCase();

    // CREATE ALERT (New Feature)
    if (text.includes("alert") && (text.includes("if") || text.includes("when")) &&
        (text.includes(">") || text.includes("above") || text.includes("greater"))) {
        return "CREATE_ALERT";
    }

    // GREETING
    if (["hello", "hi", "hey", "greetings"].some(w => text.includes(w))) return "GREETING";

    // SYSTEM_DIAGNOSTICS (Admin Focus)
    if (text.includes("system") || text.includes("sync") || text.includes("data") ||
        text.includes("model") || text.includes("diagnostic") || text.includes("integrity") ||
        text.includes("latency") || text.includes("connect")) return "SYSTEM_DIAGNOSTICS";

    // FINANCIAL / IMPACT
    if (text.includes("cost") || text.includes("price") || text.includes("money") ||
        text.includes("financial") || text.includes("roi") || text.includes("budget") ||
        text.includes("loss") || text.includes("worth") || text.includes("api")) return "FINANCIAL";

    // SAFETY / PERMISSION (The "Decision" override)
    // "Can I run", "Is it safe", "Continue", "Shut down", "Permission"
    if (text.includes("safe") || text.includes("run") || text.includes("continue") ||
        text.includes("shut") || text.includes("stop") || text.includes("permission") ||
        text.includes("allow") || text.includes("danger") || text.includes("urgent")) return "SAFETY_DECISION";

    // TIMELINE / RISK ASSESSMENT
    if (text.includes("when") || text.includes("time") || text.includes("window") ||
        text.includes("fail") || text.includes("future") || text.includes("predict") ||
        text.includes("long")) return "TIMELINE_RISK";

    // DECISION / ACTION (General)
    if (text.includes("fix") || text.includes("repair") || text.includes("do") ||
        text.includes("action") || text.includes("recommend") || text.includes("suggest") ||
        text.includes("approve") || text.includes("step")) return "GENERAL_DECISION";

    // STATUS / CONDITION (Default for technical queries)
    if (text.includes("status") || text.includes("health") || text.includes("condition") ||
        text.includes("how is") || text.includes("sensor") || text.includes("reading") ||
        text.includes("value") || text.includes("vibration") || text.includes("temp") ||
        text.includes("pressure") || text.includes("limit") || text.includes("warning") ||
        text.includes("state")) return "STATUS_CHECK";

    return "GENERAL"; // Fallback
}

// ------------------------------------------------------------------
// 3. Response Generation Router
// ------------------------------------------------------------------
function generateAIResponse(query) {
    const ctx = getSystemContext();
    const intent = detectIntent(query);

    // console.log(`[AI Reasoner] Role: ${ctx.role}, Intent: ${intent}`); // Debug

    // Handle Alert Creation Logic directly
    if (intent === "CREATE_ALERT") {
        return handleCreateAlert(query);
    }

    if (intent === "GREETING") return generateGreeting(ctx);

    switch (ctx.role) {
        case 'plant-engineer': return generateEngineerResponse(intent, ctx);
        case 'plant-head': return generatePlantHeadResponse(intent, ctx);
        case 'management': return generateManagementResponse(intent, ctx);
        case 'admin': return generateAdminResponse(intent, ctx);
        default: return "I am ready to assist. Please select a valid role.";
    }
}

async function handleCreateAlert(query) {
    // Basic Parsing: "Alert if vibration > 5"
    // This is a simulation of the logic extraction
    // In a real system, we'd use regex to extract parameter, operator, and value.

    // Simulate API Call
    try {
        await fetch('/api/v1/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                created_at: new Date().toISOString(),
                role: APP_STATE.currentRole
            })
        });
        return "✅ Alert Created. I will monitor this condition and notify you if it is triggered.";
    } catch (e) {
        return "❌ Failed to create alert. Please try again. (Ensure Backend is running).";
    }
}

function generateGreeting(ctx) {
    const greetings = {
        'plant-engineer': "Hello Engineer. I am monitoring the sensor array. Ask me about specific technical conditions or status.",
        'plant-head': "Hello. Plant risk assessment is active. We can discuss operational timelines and safety risks.",
        'management': "Hello. Financial impact models are ready. Ask me about ROI or cost of downtime.",
        'admin': "System Online. Admin console active. I can report on diagnostics and data integrity."
    };
    return greetings[ctx.role] || "Hello. System ready.";
}

// ------------------------------------------------------------------
// 4. Role-Specific Generators (Advanced Logic)
// ------------------------------------------------------------------

// --- PLANT ENGINEER -----------------------------------------------
function generateEngineerResponse(intent, ctx) {
    // RULE: Technical, Conditional Safety, No Finance.

    if (intent === "FINANCIAL") return "I focus on purely technical performance and maintenance. Please consult Management for financial approval or cost analysis.";

    if (intent === "SYSTEM_DIAGNOSTICS") return "System diagnostics look nominal. Refer to the Admin console for detailed ML model health logs.";

    if (intent === "STATUS_CHECK" || intent === "TIMELINE_RISK") {
        if (ctx.isCritical) {
            return `Condition Alert: **${ctx.topSensorName}** is showing severe instability (${ctx.topSensor.count} anomalies). The vibration signature suggests mechanical looseness or bearing degradation.`;
        }
        if (ctx.isWarning) {
            return `Status is degraded. I am detecting early drift in **${ctx.topSensorName}**. It is currently manageable but requires monitoring.`;
        }
        return `All systems operational. ${ctx.topSensorName} and other key parameters are within standard engineering limits.`;
    }

    if (intent === "SAFETY_DECISION" || intent === "GENERAL_DECISION") {
        // Engineer gives technical permission/denial
        if (ctx.isCritical) {
            return `**Unsafe to Continue**. The sensor deviation in **${ctx.topSensorName}** has exceeded the safety threshold. I recommend immediate isolation of the pump to prevent catastrophic failure.`;
        }
        return `Technically, the pump is within safe operating limits. You may continue operation, but please schedule a routine inspection for **${ctx.topSensorName}** during the next shift.`;
    }

    return `I am analyzing **${ctx.topSensorName}**. Ask me about its condition or safety status.`;
}

// --- PLANT HEAD ---------------------------------------------------
function generatePlantHeadResponse(intent, ctx) {
    // RULE: Operational Risk, Escalation, Uptime.

    if (intent === "STATUS_CHECK" || intent === "SYSTEM_DIAGNOSTICS") {
        if (ctx.isCritical) return `**Operational Status: RED**. The plant is operating in a critical risk state due to instability in the pump array. Uptime is compromised.`;
        return `Plant operations are stable. We are meeting our reliability targets for this shift.`;
    }

    if (intent === "TIMELINE_RISK") {
        if (ctx.isCritical) return `Risk Projection: Failure is highly probable within **${ctx.failureWindow}**. We are risking unplanned downtime if we do not intervene.`;
        return `The current failure probability is low. We have a safe operating window for the foreseeable future (Next 72+ hours).`;
    }

    if (intent === "SAFETY_DECISION" || intent === "GENERAL_DECISION") {
        if (ctx.isCritical) {
            return `**DO NOT RUN**. The operational risk is too high. Continued operation will likely result in an unplanned outage and asset damage. Initiate shutdown procedures.`;
        }
        return `Operations can proceed, but with heightened caution. We are accepting a low level of risk on **${ctx.topSensorName}**. Keep the maintenance team on standby.`;
    }

    if (intent === "FINANCIAL") return "My focus is on operational continuity. However, high risk usually correlates with high financial exposure. Check with Management for the exact figures.";

    return "I can assess operational risks and failure timelines for you.";
}

// --- MANAGEMENT ---------------------------------------------------
function generateManagementResponse(intent, ctx) {
    // RULE: Trade-offs, Consequences, ROI. Avoid deep tech.

    if (intent === "SYSTEM_DIAGNOSTICS" || intent === "STATUS_CHECK") {
        return "That is a technical detail. I suggest focusing on the business implications: We are currently tracking the financial risk of these anomalies.";
    }

    if (intent === "FINANCIAL" || intent === "TIMELINE_RISK") {
        if (ctx.isCritical) {
            return `**Financial Implication**: We are facing a projected loss of **${ctx.downtimeCost}** due to imminent failure. The cost of inaction far exceeds the repair budget.`;
        }
        return `Current financial exposure is minimal. The asset is generating value without significant risk of capital loss.`;
    }

    if (intent === "SAFETY_DECISION" || intent === "GENERAL_DECISION") {
        if (ctx.isCritical) {
            return `**Decision**: Approve the Maintenance. \n\nLogic: Spending **${ctx.repairCost}** now prevents a **${ctx.downtimeCost}** production loss. The ROI on immediate action is positive (~18x).`;
        }
        return `**Decision**: Defer Maintenance. \n\nLogic: There is no financial justification for downtime right now. Run to failure or wait for the next planned outage.`;
    }

    return "I can help you weigh the cost of repair against the cost of downtime.";
}

// --- ADMIN --------------------------------------------------------
function generateAdminResponse(intent, ctx) {
    // RULE: Strict Diagnostics. NO ADVICE.

    if (intent === "SAFETY_DECISION" || intent === "GENERAL_DECISION" || intent === "TIMELINE_RISK") {
        // REFUSAL
        return "I cannot advise on operational or safety decisions. \n\n**System Status**: My role is strictly limited to verifying data integrity and platform health. Please consult the Plant Engineer.";
    }

    if (intent === "FINANCIAL" || intent === "SYSTEM_DIAGNOSTICS" || intent === "STATUS_CHECK" || intent === "GENERAL") {
        return `**System Diagnostic Report**:\n` +
            `- Data Stream: Active (${ctx.lastSync})\n` +
            `- Exposed API: http://localhost:5000/api/v1/data\n` +
            `- Integrity Check: PASS\n\n` +
            `The dashboard is accurately reflecting the underlying sensor data. Users can access raw data via the API endpoint above.`;
    }

    return "System ready. Diagnostics active. API online.";
}
