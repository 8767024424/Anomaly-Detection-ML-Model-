/**
 * Modern Industrial Dashboard - Responsive & Real-Time
 * Integrates with backend API and Supabase database
 */

// Global State
const APP_STATE = {
    currentRole: 'plant-engineer',
    isLive: false,
    updateInterval: null,
    sensorData: {},
    anomalyHistory: [],
    charts: {}
};

// Sensor Feature Names
const SENSOR_FEATURES = [
    'Motor_RPM',
    'Bearing_Temperature_C',
    'Oil_Pressure_bar',
    'Vibration_mm_s',
    'Flow_Rate_L_min',
    'Suction_Pressure_bar',
    'Discharge_Pressure_bar',
    'Motor_Current_A',
    'Casing_Temperature_C',
    'Ambient_Temperature_C'
];

// Sensor Display Names
const SENSOR_LABELS = {
    'Motor_RPM': 'Motor RPM',
    'Bearing_Temperature_C': 'Bearing Temp',
    'Oil_Pressure_bar': 'Oil Pressure',
    'Vibration_mm_s': 'Vibration',
    'Flow_Rate_L_min': 'Flow Rate',
    'Suction_Pressure_bar': 'Suction Pressure',
    'Discharge_Pressure_bar': 'Discharge Pressure',
    'Motor_Current_A': 'Motor Current',
    'Casing_Temperature_C': 'Casing Temp',
    'Ambient_Temperature_C': 'Ambient Temp'
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Dashboard initializing...');

    setupRoleButtons();
    setupChatInterface();
    startLiveUpdates();
    updateClock();
    setInterval(updateClock, 1000);

    // Load initial view
    switchRole('plant-engineer');
});

// Role Switching
function setupRoleButtons() {
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.dataset.role;
            switchRole(role);
        });
    });
}

function switchRole(role) {
    APP_STATE.currentRole = role;

    // Update button states
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === role);
    });

    // Update page title
    const titles = {
        'plant-engineer': 'Maintenance Console',
        'plant-head': 'Operations Dashboard',
        'management': 'Executive Overview',
        'admin': 'System Administration'
    };
    document.getElementById('page-title').innerHTML = titles[role] || 'Dashboard';

    // Load view
    loadView(role);
}

function loadView(role) {
    const container = document.getElementById('dashboard-view');
    const template = document.getElementById(`tpl-${role}`);

    if (template) {
        container.innerHTML = template.innerHTML;
        initializeView(role);
    } else {
        container.innerHTML = '<div class="card"><h3>View not found</h3></div>';
    }
}

// View Initializers
function initializeView(role) {
    console.log(`Initializing ${role} view`);

    switch (role) {
        case 'plant-engineer':
            initEngineerView();
            break;
        case 'plant-head':
            initPlantHeadView();
            break;
        case 'management':
            initManagementView();
            break;
        case 'admin':
            initAdminView();
            break;
    }
}

// Plant Engineer View
async function initEngineerView() {
    await updateSensorTable();
    createAnomalyChart();
    createTrendChart();
    await updateMaintenanceTimeline();
    await updateSystemHealth();
}

async function updateSensorTable() {
    const response = await fetch('/api/live-data');
    const data = await response.json();

    if (!data.values) return;

    const tbody = document.querySelector('#sensor-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    SENSOR_FEATURES.forEach(sensor => {
        const value = data.values[sensor] || 0;
        const state = data.sensor_states?.[sensor] || 'NORMAL';
        const count = data.sensor_anomaly_counts?.[sensor] || 0;

        const row = document.createElement('tr');
        row.className = count > 5 ? 'critical-row' : (count > 2 ? 'warning-row' : '');

        row.innerHTML = `
            <td>${SENSOR_LABELS[sensor]}</td>
            <td><span class="status-badge ${state.toLowerCase()}">${state}</span></td>
            <td class="text-center">${value.toFixed(2)}</td>
            <td class="text-center">${count}</td>
            <td>${interpretSensor(sensor, value, state, count)}</td>
        `;

        tbody.appendChild(row);
    });
}

function interpretSensor(sensor, value, state, count) {
    if (state === 'ANOMALY') {
        if (count > 5) {
            return `<span class="text-critical">Requires immediate attention</span>`;
        } else {
            return `<span class="text-warning">Monitor closely</span>`;
        }
    }
    return '<span class="text-muted">Operating normally</span>';
}

function createAnomalyChart() {
    const canvas = document.getElementById('anomaly-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Destroy existing chart
    if (APP_STATE.charts.anomaly) {
        APP_STATE.charts.anomaly.destroy();
    }

    APP_STATE.charts.anomaly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: SENSOR_FEATURES.map(s => SENSOR_LABELS[s]),
            datasets: [{
                label: 'Anomaly Count',
                data: new Array(10).fill(0),
                backgroundColor: 'rgba(218, 54, 51, 0.6)',
                borderColor: 'rgba(218, 54, 51, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#8b949e' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: { color: '#8b949e', maxRotation: 45, minRotation: 45 },
                    grid: { display: false }
                }
            }
        }
    });

    updateAnomalyChart();
}

async function updateAnomalyChart() {
    if (!APP_STATE.charts.anomaly) return;

    const response = await fetch('/api/live-data');
    const data = await response.json();

    if (data.sensor_anomaly_counts) {
        const counts = SENSOR_FEATURES.map(s => data.sensor_anomaly_counts[s] || 0);
        APP_STATE.charts.anomaly.data.datasets[0].data = counts;
        APP_STATE.charts.anomaly.update('none');

        // Update root cause text
        const maxIndex = counts.indexOf(Math.max(...counts));
        const rootCause = document.getElementById('engineer-root-cause');
        if (rootCause && counts[maxIndex] > 0) {
            rootCause.innerHTML = `Primary anomaly source: <strong>${SENSOR_LABELS[SENSOR_FEATURES[maxIndex]]}</strong>`;
        }
    }
}

function createTrendChart() {
    const canvas = document.getElementById('trend-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (APP_STATE.charts.trend) {
        APP_STATE.charts.trend.destroy();
    }

    APP_STATE.charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Reconstruction Loss',
                    data: [],
                    borderColor: '#58a6ff',
                    backgroundColor: 'rgba(88, 166, 255, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Threshold',
                    data: [],
                    borderColor: '#da3633',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#8b949e' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#8b949e' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: { color: '#8b949e' },
                    grid: { display: false }
                }
            }
        }
    });
}

async function updateMaintenanceTimeline() {
    const response = await fetch('/api/maintenance-events?resolved=false');
    const data = await response.json();

    const container = document.getElementById('engineer-alerts');
    if (!container) return;

    if (!data.data || data.data.length === 0) {
        container.innerHTML = '<p class="text-muted">No active maintenance events</p>';
        return;
    }

    container.innerHTML = data.data.map(event => `
        <div class="card" style="border-left: 4px solid ${getSeverityColor(event.severity)}; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h4 style="color: ${getSeverityColor(event.severity)}; margin: 0;">
                        ${event.severity} - ${event.sensor_name}
                    </h4>
                    <p style="margin: 8px 0; font-size: 0.9rem;">${event.description}</p>
                    <p class="small text-muted">Estimated Cost: ₹${event.estimated_cost.toLocaleString()}</p>
                </div>
            </div>
        </div>
    `).join('');
}

function getSeverityColor(severity) {
    const colors = {
        'CRITICAL': '#da3633',
        'HIGH': '#d29922',
        'MEDIUM': '#58a6ff',
        'LOW': '#238636'
    };
    return colors[severity] || '#8b949e';
}

// Plant Head View
async function initPlantHeadView() {
    await updatePlantHeadKPIs();
    await updateRULBars();
    createRiskChart();
}

async function updatePlantHeadKPIs() {
    const response = await fetch('/api/maintenance-events?resolved=false');
    const data = await response.json();

    if (data.data && data.data.length > 0) {
        const topFaults = data.data.slice(0, 3);
        const container = document.getElementById('ph-top-faults');
        if (container) {
            container.innerHTML = topFaults.map(e =>
                `<div style="margin-bottom: 4px;">• ${e.sensor_name}</div>`
            ).join('');
        }
    }
}

async function updateRULBars() {
    const response = await fetch('/api/live-data');
    const data = await response.json();

    const container = document.getElementById('rulContainer');
    if (!container) return;

    const criticalSensors = ['Bearing_Temperature_C', 'Vibration_mm_s', 'Motor_Current_A'];

    container.innerHTML = criticalSensors.map(sensor => {
        const count = data.sensor_anomaly_counts?.[sensor] || 0;
        const rul = Math.max(0, 100 - (count * 10));
        const colorClass = rul > 60 ? 'green' : (rul > 30 ? 'amber' : 'red');

        return `
            <div class="rul-bar">
                <div class="rul-label">${SENSOR_LABELS[sensor]}</div>
                <div class="rul-track">
                    <div class="rul-fill ${colorClass}" style="width: ${rul}%"></div>
                </div>
                <div class="rul-value">${rul}%</div>
            </div>
        `;
    }).join('');
}

function createRiskChart() {
    const canvas = document.getElementById('risk-impact-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (APP_STATE.charts.risk) {
        APP_STATE.charts.risk.destroy();
    }

    APP_STATE.charts.risk = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Normal Operation', 'Minor Risk', 'Major Risk'],
            datasets: [{
                data: [60, 25, 15],
                backgroundColor: ['#238636', '#d29922', '#da3633']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#8b949e' }
                }
            }
        }
    });
}

// Management View
async function initManagementView() {
    await updateFinancialMetrics();
    createFinancialChart();
}

async function updateFinancialMetrics() {
    const response = await fetch('/api/maintenance-events?resolved=false');
    const data = await response.json();

    if (data.data) {
        const totalCost = data.data.reduce((sum, e) => sum + e.estimated_cost, 0);
        const moneyRisk = document.getElementById('mgmt-money-risk');
        if (moneyRisk) {
            moneyRisk.textContent = `₹${(totalCost / 100000).toFixed(1)}L`;
        }

        // Cost drivers
        const drivers = document.getElementById('mgmt-cost-drivers');
        if (drivers && data.data.length > 0) {
            const top3 = data.data.slice(0, 3);
            drivers.innerHTML = top3.map(e => {
                const percentage = (e.estimated_cost / totalCost * 100).toFixed(0);
                return `
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-size: 0.85rem;">${e.sensor_name}</span>
                            <span style="font-weight: 700; color: #da3633;">₹${(e.estimated_cost / 1000).toFixed(0)}K</span>
                        </div>
                        <div style="background: #232A36; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div style="background: #da3633; height: 100%; width: ${percentage}%; transition: width 0.5s;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function createFinancialChart() {
    const canvas = document.getElementById('risk-impact-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (APP_STATE.charts.financial) {
        APP_STATE.charts.financial.destroy();
    }

    APP_STATE.charts.financial = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Do Nothing', 'Preventive Maintenance'],
            datasets: [{
                label: 'Cost (₹ Lakhs)',
                data: [4.5, 1.2],
                backgroundColor: ['rgba(218, 54, 51, 0.6)', 'rgba(35, 134, 54, 0.6)'],
                borderColor: ['#da3633', '#238636'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#8b949e' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: { color: '#8b949e' },
                    grid: { display: false }
                }
            }
        }
    });
}

// Admin View
async function initAdminView() {
    await updateAdminMetrics();
    setupAdminControls();
}

async function updateAdminMetrics() {
    const response = await fetch('/api/system-health');
    const data = await response.json();

    document.getElementById('admin-last-data').textContent = 'Just now';
    document.getElementById('admin-last-ml').textContent = 'Just now';
}

function setupAdminControls() {
    document.getElementById('btn-reload-data')?.addEventListener('click', async () => {
        console.log('Reloading data...');
        await fetch('/api/start-simulation', { method: 'POST' });
        alert('Data simulation started');
    });

    document.getElementById('btn-refresh-ml')?.addEventListener('click', () => {
        console.log('Refreshing ML...');
        alert('ML engine refreshed');
    });

    document.getElementById('btn-resync-ui')?.addEventListener('click', () => {
        console.log('Resyncing UI...');
        location.reload();
    });
}

// Live Updates
function startLiveUpdates() {
    APP_STATE.updateInterval = setInterval(async () => {
        await updateCurrentView();
    }, 2000);
}

async function updateCurrentView() {
    switch (APP_STATE.currentRole) {
        case 'plant-engineer':
            await updateSensorTable();
            await updateAnomalyChart();
            await updateSystemHealth();
            break;
        case 'plant-head':
            await updatePlantHeadKPIs();
            await updateRULBars();
            break;
        case 'management':
            await updateFinancialMetrics();
            break;
        case 'admin':
            await updateAdminMetrics();
            break;
    }
}

// System Health Updates
async function updateSystemHealth() {
    const response = await fetch('/api/system-health');
    const data = await response.json();

    document.getElementById('inference-latency').textContent = data.inference_latency_ms.toFixed(2);
    document.getElementById('memory-usage').textContent = data.memory_usage_mb.toFixed(1);
    document.getElementById('sidebar-stream-status').textContent = data.data_stream;
    document.getElementById('sidebar-ml-status').textContent = data.model_status;
}

// Clock Update
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('current-time').textContent = timeString;
}

// Chat Interface
function setupChatInterface() {
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');

    sendBtn?.addEventListener('click', () => sendMessage());
    userInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            userInput.value = chip.textContent;
            sendMessage();
        });
    });
}

function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();

    if (!message) return;

    const chatHistory = document.getElementById('chat-history');

    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'msg user';
    userMsg.textContent = message;
    chatHistory.appendChild(userMsg);

    // Generate AI response
    setTimeout(() => {
        const aiMsg = document.createElement('div');
        aiMsg.className = 'msg ai';
        aiMsg.textContent = generateAIResponse(message);
        chatHistory.appendChild(aiMsg);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }, 500);

    input.value = '';
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function generateAIResponse(message) {
    const responses = {
        'highest anomaly sensor': 'Bearing Temperature shows the highest anomaly count.',
        'sensor health summary': 'All sensors operational. 2 sensors require monitoring.',
        'sensor failure risk': 'Bearing and Vibration sensors show elevated risk.',
        'cost impact': 'Estimated cost of current anomalies: ₹4.5L if unresolved.'
    };

    const normalized = message.toLowerCase();
    for (const [key, value] of Object.entries(responses)) {
        if (normalized.includes(key)) return value;
    }

    return 'I am analyzing the sensor data. Please be more specific about your query.';
}

// Export for global access
window.APP_STATE = APP_STATE;
window.switchRole = switchRole;
