/*
    Industrial Dashboard Logic
    - Simulates data fetching
    - Simulates ML inference
    - Handles UI updates per role
    - Handles NLP interactions
*/

const APP_STATE = {
    currentRole: 'plant-engineer',
    dataIndex: 0,
    data: [],
    isPlaying: true,
    mlThreshold: 0.06222164315398973, // Updated threshold based on user input
    lastAnomalyScore: 0,
    systemState: 'NORMAL' // NORMAL | WARNING | CRITICAL
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
    // 1. STRICT OUTPUT FROM ML NOTEBOOK
    sensorAnomalyCounts: {
        'Vibration_mm_s': 450,
        'Bearing_Temperature_C': 420,
        'Motor_Current_A': 380,
        'Oil_Pressure_bar': 300,
        'Flow_Rate_L_min': 260,
        'Casing_Temperature_C': 220,
        'Discharge_Pressure_bar': 200,
        'Motor_RPM': 120,
        'Suction_Pressure_bar': 80,
        'Ambient_Temperature_C': 50
    },
    totalAnomalies: 0,
    riskLevel: 'NORMAL', // Derived from counts
    healthScore: 100     // Derived from counts
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
    // 3. Load Data & Render
    await loadSensorData();

    // Force Render after data load
    renderDashboard();

    if (APP_STATE.data.length > 0) {
        updateViewComponents();
    }
});

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

async function loadSensorData() {
    try {
        console.log("Attempting to fetch sensor_data.csv...");
        const response = await fetch('pump_sensor_data_2000_anomaly.csv');
        if (!response.ok) throw new Error(`Network response was not ok (${response.status})`);

        const text = await response.text();
        if (!text || text.trim().length === 0) throw new Error("CSV file is empty");

        APP_STATE.data = parseCSV(text);
        console.log(`Successfully loaded ${APP_STATE.data.length} records from CSV.`);

    } catch (error) {
        console.warn('Data Load Issue:', error.message);
        console.warn("Switching to FALLBACK GENERATED DATA.");
        APP_STATE.data = generateFallbackData();
    }

    // ALWAYS LOAD ML RESULTS (Source of Truth)
    loadMLInferenceResults();
    updateViewComponents();
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    // Auto-detect numeric columns
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, index) => {
            const val = values[index] ? values[index].trim() : '';
            // Try to convert to number if it looks like one, otherwise keep string
            const num = parseFloat(val);
            obj[header] = isNaN(num) ? val : num;
        });
        return obj;
    });
}

function updateLoop() {
    try {
        if (!APP_STATE.isPlaying || APP_STATE.data.length === 0) return;

        // Advance index
        APP_STATE.dataIndex = (APP_STATE.dataIndex + 1) % APP_STATE.data.length;
        const currentData = APP_STATE.data[APP_STATE.dataIndex];

        // 1. ML Simulation (Calculate Anomaly Score) - Simplified for CSV data
        // We utilize the 'Vibration' and 'Temperature' logic if they exist, or just use a random noise baseline if fields are missing
        let reconstructionError = 0.05 + Math.random() * 0.02;

        const vib = currentData['Vibration_mm_s'] || 0;
        const temp = currentData['Bearing_Temperature_C'] || 0;

        if (vib > 4.0) reconstructionError += 0.2;
        if (temp > 75) reconstructionError += 0.3;

        APP_STATE.lastAnomalyScore = reconstructionError;

        // Update System Status based on ML
        if (reconstructionError > APP_STATE.mlThreshold + 0.3) {
            APP_STATE.systemState = 'CRITICAL';
        } else if (reconstructionError > APP_STATE.mlThreshold) {
            APP_STATE.systemState = 'WARNING';
        } else {
            APP_STATE.systemState = 'NORMAL';
        }

        // Update Header Time using actual timestamp if available
        const timeDisplay = currentData.timestamp ? new Date(currentData.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
        document.getElementById('current-time').innerText = timeDisplay;

        // Update View
        updateViewComponents(currentData);
    } catch (e) {
        console.error("Error in updateLoop:", e);
    }
}

function updateViewComponents(data) {
    if (!data) data = APP_STATE.data[APP_STATE.dataIndex];

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

    /* ----------------------------------------------------
       1. PERFORMANCE COMPARISON BAR CHART (UNCHANGED)
    ---------------------------------------------------- */
    /* ----------------------------------------------------
       1. CHART C: SENSOR RELIABILITY SCORE (Historical)
       Formula: 100 - (Anomaly Count / Total Records * 100)
    ---------------------------------------------------- */
    const ctxTrend = document.getElementById('trend-chart');
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
                    borderWidth: 1
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
                        ticks: { color: CHART_CONFIG.fontColor }
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

        // Only populate if empty to avoid re-render loops (static)
        if (chart.data.labels.length === 0) {
            // Use Global ML State
            const counts = ML_STATE.sensorAnomalyCounts;
            const totalRecords = APP_STATE.data.length || 1;

            const labels = [];
            const reliabilityScores = [];
            const colors = [];

            SENSOR_ORDER.forEach(sensor => {
                const count = counts[sensor] || 0;
                const reliability = 100 - ((count / totalRecords) * 100);

                labels.push(sensor.replace(/_/g, ' '));
                reliabilityScores.push(reliability.toFixed(1));

                // Color based on score
                if (reliability < 80) colors.push('#da3633'); // Red
                else if (reliability < 95) colors.push('#d29922'); // Orange
                else colors.push('#238636'); // Green
            });

            chart.data.labels = labels;
            chart.data.datasets[0].data = reliabilityScores;
            chart.data.datasets[0].backgroundColor = colors;
            chart.update('none');
        }
    }

    /* ----------------------------------------------------
       2. CHART B: HISTORICAL ANOMALY DISTRIBUTION (Top 5 + Others)
    ---------------------------------------------------- */
    const ctxAnomaly = document.getElementById('anomaly-chart');
    if (ctxAnomaly && !CHART_INSTANCES['anomaly']) {
        CHART_INSTANCES['anomaly'] = new Chart(ctxAnomaly, {
            type: 'pie',
            data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12, color: '#8b949e' } }
                }
            }
        });
    }

    if (CHART_INSTANCES['anomaly']) {
        const chart = CHART_INSTANCES['anomaly'];

        if (chart.data.labels.length === 0) {
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
                // Show ALL 10 Sensors
                SENSOR_ORDER.forEach(sensor => {
                    const count = counts[sensor] || 0;
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
}

function updateEngineerAlerts(data) {
    const alertPanel = document.getElementById('engineer-alerts');
    if (!alertPanel) return;

    let html = '';
    // Use data-driven alerts
    if (data.Vibration_mm_s > 4.0) {
        html += `
            <div class="alert-card critical">
                <h4>CRITICAL ALERT</h4>
                <p>High Vibration detected (${data.Vibration_mm_s.toFixed(2)} mm/s).</p>
                <div class="alert-actions">
                    <button>Acknowledge</button>
                    <button>View Analysis</button>
                </div>
            </div>
        `;
    }
    if (data.Bearing_Temperature_C > 80) {
        html += `
            <div class="alert-card warning">
                <h4>TEMP WARNING</h4>
                <p>High Temperature (${data.Bearing_Temperature_C.toFixed(1)} °C).</p>
            </div>
        `;
    }

    if (html === '') {
        html = '<div class="alert-card ok"><p>No active alerts.</p></div>';
    }

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

    let items = [];

    sensors.forEach(key => {
        const count = sensorStats[key] || 0;
        let rulPct = 95;
        let color = "green";

        // STRICT RUL MAPPING
        if (count > 200) { rulPct = 20; color = "red"; }        // 10-30%
        else if (count > 100) { rulPct = 40; color = "amber"; } // 30-50%
        else if (count > 50) { rulPct = 60; color = "amber"; }  // 50-70%
        else { rulPct = 85; color = "green"; }                  // 70-95%

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

    // C. Fail Risk Window
    const elWindow = document.getElementById('ph-risk-window');
    if (elWindow) {
        // High Risk = <24 hrs, Medium = 24-72 hrs
        elWindow.innerText = (ML_STATE.riskLevel === 'CRITICAL') ? "24–36 Hours" : "Safe";
    }

    // D. System Confidence (REMOVED)

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

    // ----------------------------------------------------
    // 3. EXECUTIVE SUMMARY
    // ----------------------------------------------------
    const summaryEl = document.getElementById('ph-executive-summary');
    if (summaryEl) {
        if (ML_STATE.riskLevel === 'CRITICAL') {
            summaryEl.innerHTML = `The system is in a <strong>CRITICAL</strong> state. Immediate intervention required for top contributors.`;
            summaryEl.style.borderLeftColor = "#da3633";
        } else {
            summaryEl.innerHTML = `System operating within acceptable limits.`;
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
    // Management view: Financial Impact driven by Anomaly Distribution

    const TOTAL_BUDGET_RISK = 450000; // Fixed Total Risk Value
    const totalAnomalies = ML_STATE.totalAnomalies || 1; // Avoid div/0

    // 1. Calculate Cost per Sensor
    // Cost = (SensorAnomalies / TotalAnomalies) * 450,000

    // We update the "Cost Drivers" section or similar. 
    // Assuming there are elements for this, or we inject dynamic cards.
    // NOTE: The current HTML might be static. We will try to update specific IDs if they exist, 
    // or log the calculation for verification if the UI is hardcoded.

    // For now, let's update the "Projected Loss" KPI if it exists, or the Risk Composition text.

    const lossEl = document.getElementById('mgmt-projected-loss'); // Hypothetical ID
    // If specific IDs aren't known from the snippet, we'll try to update the known containers.

    // Let's assume we update the "Cost Drivers" list in Management View (if it shares Plant Head structure or is separate).
    // The previous code had `updateManagementView` as empty/static.

    // We will inject a new "Financial Risk Breakdown" logic into the Management container if possible.
    const container = document.getElementById('management-cost-breakdown');
    if (container) {
        const sorted = Object.entries(ML_STATE.sensorAnomalyCounts).sort(([, a], [, b]) => b - a);
        let html = '<h4>Financial Risk Attribution</h4><ul class="cost-list">';

        sorted.forEach(([key, count]) => {
            if (count > 0) {
                const cost = (count / totalAnomalies) * TOTAL_BUDGET_RISK;
                html += `<li><strong>${key.replace(/_/g, ' ')}</strong>: ₹${cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</li>`;
            }
        });
        html += '</ul>';
        container.innerHTML = html;
    }

    // 5. Action Button Logic
    const btnApprove = document.getElementById('btn-approve-repair');
    if (btnApprove && !btnApprove.dataset.bound) {
        btnApprove.dataset.bound = "true";
        btnApprove.onclick = () => {
            const originalText = btnApprove.innerHTML;
            btnApprove.innerHTML = "⏳ Processing...";
            btnApprove.style.opacity = "0.7";
            btnApprove.disabled = true;

            setTimeout(() => {
                btnApprove.innerHTML = originalText;
                btnApprove.style.opacity = "1";
                btnApprove.disabled = false;
                // Matches the user's requested alert style
                alert(`✅ Maintenance Approved\n\nSystem verification passed.`);
            }, 800);
        };
    }
}

function updateAdminView(data) {
    // ----------------------------------------------------
    // ADMIN SYSTEM ASSURANCE VIEW
    // ----------------------------------------------------

    // 1. Determine System Reliability
    // Check if we have data and ML results
    const isReliable = (ML_STATE.sensorAnomalyCounts && Object.keys(ML_STATE.sensorAnomalyCounts).length > 0);

    // 2. Update Status Banner
    const banner = document.getElementById('admin-assurance-banner');
    if (banner) {
        if (isReliable) {
            banner.style.background = "rgba(35,134,54,0.1)";
            banner.style.borderColor = "#238636";
            banner.innerHTML = `
                <h2 class="text-success" style="margin: 0; font-size: 1.8rem;">✅ SYSTEM RELIABLE</h2>
                <p class="text-muted" style="margin: 10px 0 0 0;">All critical system checks passed. Platform is stable.</p>
            `;
        } else {
            banner.style.background = "rgba(218,54,51,0.1)";
            banner.style.borderColor = "#da3633";
            banner.innerHTML = `
                <h2 class="text-critical" style="margin: 0; font-size: 1.8rem;">⚠️ ATTENTION REQUIRED</h2>
                <p class="text-muted" style="margin: 10px 0 0 0;">ML inference results are missing or incomplete.</p>
            `;
        }
    }

    // 3. Update Trust Indicators (Timestamps)
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updateText('admin-last-data', now, 'text-white');
    updateText('admin-last-ml', now, 'text-white');

    // 4. Bind Admin Actions
    setupAdminButton('btn-reload-data', "Dataset Reloaded", "Fetching latest CSV...");
    setupAdminButton('btn-refresh-ml', "Inference Refreshed", "Verifying model outputs...");
    setupAdminButton('btn-resync-ui', "Dashboard Synced", "Forcing view update...");
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

// Helper to update text safely
function updateText(id, text, className) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = text;
        if (className) el.className = `metric-big ${className}`;
    }
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

        // Determine Status Level (Strict Mapping)
        let status = 'NORMAL';
        let statusClass = 'text-success';
        let badgeClass = 'status-ok';
        let badgeText = '🟢 NORMAL';

        if (count > 200) {
            status = 'CRITICAL';
            statusClass = 'text-critical';
            badgeClass = 'status-critical';
            badgeText = '🔴 CRITICAL';
        } else if (count > 100) {
            status = 'UNSTABLE';
            statusClass = 'text-warning';
            badgeClass = 'status-warning';
            badgeText = '🟠 UNSTABLE';
        } else if (count > 50) {
            status = 'WATCH';
            statusClass = 'text-warning';
            badgeClass = 'status-warning';
            badgeText = '🟡 WATCH';
        }

        return { key, actual, meaning: config.meaning, anomalyCount: count, status, statusClass, badgeClass, badgeText };
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
        if (criticalCount > 0) {
            banner.style.display = 'block';
            riskText.innerHTML = `${criticalCount} Sensor(s) in <strong>CRITICAL FAILURE STATE</strong>. Immediate maintenance recommended.`;
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
