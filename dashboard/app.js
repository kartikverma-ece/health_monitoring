/* ============================================================
   Smart IoT Health Monitor – Dashboard JavaScript
   Features: WebSocket live data, Chart.js charts, alert logic,
             ECG animation, simulated demo data fallback
   ============================================================ */

'use strict';

// ── Configuration ─────────────────────────────────────────
const CONFIG = {
  wsUrl: 'ws://192.168.1.100:81',   // Update to your ESP32 IP
  reconnectDelay: 3000,
  demoMode: true,   // true = use simulated data (no hardware needed)
  thresholds: {
    hrHigh: 120, hrLow: 50, spo2Low: 92,
    tempHigh: 38.0
  },
  maxHistory: 60,
  ecgBufferSize: 200,
};

// ── State ──────────────────────────────────────────────────
const state = {
  ws: null,
  connected: false,
  currentView: 'dashboard',
  readings: 0,
  alertCount: 0,
  startTime: Date.now(),
  frozen: false,

  // Latest values
  hr: 0, spo2: 0, temp: 0, humidity: 0,
  pressure: 0, altitude: 0, light: 0,
  ecgRaw: 0, fallDetected: false, vibration: false,
  ecgLeadsOff: false, emergency: false, alertMsg: '',

  // History buffers
  hrHistory:   [], spo2History: [], tempHistory: [],
  timeLabels:  [],
  ecgBuffer:   [],

  // Alert log
  alertLog: [],

  // Sparkline charts
  charts: {},
};

// Simulated patient data history for demo
const historyData = [];

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  startClock();
  updateUptimeDisplay();

  if (CONFIG.demoMode) {
    startDemoSimulation();
    setConnectionStatus('demo', '● Demo Mode');
  } else {
    connectWebSocket();
  }

  // Load saved thresholds from localStorage
  loadSettings();

  // Generate fake history for history view
  generateDemoHistory();

  setInterval(updateUptimeDisplay, 1000);
  setInterval(updateFooterStats, 1000);
});

// ══════════════════════════════════════════════════════════
//  CHART INITIALIZATION
// ══════════════════════════════════════════════════════════
function initCharts() {
  Chart.defaults.color = '#8bafd4';
  Chart.defaults.font.family = "'Inter', sans-serif";

  // ── HR Sparkline ─────────────────────────────────────
  const hrCtx = document.getElementById('hrSparkline').getContext('2d');
  state.charts.hr = new Chart(hrCtx, {
    type: 'line',
    data: {
      labels: Array(30).fill(''),
      datasets: [{
        data: Array(30).fill(null),
        borderColor: '#ff4081', borderWidth: 2,
        pointRadius: 0, fill: true,
        backgroundColor: 'rgba(255, 64, 129, 0.08)',
        tension: 0.4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: 40, max: 140 }
      }
    }
  });

  // ── ECG Mini Canvas ───────────────────────────────────
  const ecgMiniCtx = document.getElementById('ecgMiniCanvas').getContext('2d');
  state.charts.ecgMini = new Chart(ecgMiniCtx, {
    type: 'line',
    data: {
      labels: Array(80).fill(''),
      datasets: [{
        data: Array(80).fill(512),
        borderColor: '#00e676', borderWidth: 1.5,
        pointRadius: 0, fill: false, tension: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: 0, max: 1023 }
      }
    }
  });

  // ── ECG Full Chart ────────────────────────────────────
  const ecgFullCtx = document.getElementById('ecgFullChart').getContext('2d');
  state.charts.ecgFull = new Chart(ecgFullCtx, {
    type: 'line',
    data: {
      labels: Array(CONFIG.ecgBufferSize).fill(''),
      datasets: [{
        label: 'ECG',
        data: Array(CONFIG.ecgBufferSize).fill(512),
        borderColor: '#00e676', borderWidth: 2,
        pointRadius: 0, fill: false, tension: 0,
        borderJoinStyle: 'round',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: {
          display: true, min: 0, max: 1023,
          grid: { color: 'rgba(0,230,118,0.07)' },
          ticks: { color: '#4a6080', font: { size: 10 } }
        }
      }
    }
  });

  // ── Trend Chart ───────────────────────────────────────
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  state.charts.trend = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Heart Rate',
          data: [],
          borderColor: '#ff4081', borderWidth: 2,
          pointRadius: 0, fill: false, tension: 0.4,
          yAxisID: 'yHR',
        },
        {
          label: 'SpO₂',
          data: [],
          borderColor: '#00d4ff', borderWidth: 2,
          pointRadius: 0, fill: false, tension: 0.4,
          yAxisID: 'ySPO2',
        },
        {
          label: 'Temp ×2',
          data: [],
          borderColor: '#ffab00', borderWidth: 2,
          pointRadius: 0, fill: false, tension: 0.4,
          yAxisID: 'yHR',
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: '#0d1f38', borderColor: '#1a2f52', borderWidth: 1,
          titleColor: '#8bafd4', bodyColor: '#e8f0fe',
        }
      },
      scales: {
        x: {
          display: true, maxTicksLimit: 8,
          grid: { color: 'rgba(26, 47, 82, 0.8)' },
          ticks: { color: '#4a6080', font: { size: 10 } }
        },
        yHR: {
          display: true, position: 'left',
          min: 30, max: 160,
          grid: { color: 'rgba(26, 47, 82, 0.8)' },
          ticks: { color: '#4a6080', font: { size: 10 } }
        },
        ySPO2: {
          display: true, position: 'right',
          min: 80, max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: '#4a6080', font: { size: 10 } }
        },
      }
    }
  });

  // ── History Charts ────────────────────────────────────
  ['historyHRChart', 'historySpO2Chart'].forEach((id, i) => {
    const ctx = document.getElementById(id).getContext('2d');
    const colors = ['#ff4081', '#00d4ff'];
    const labels = ['Heart Rate (BPM)', 'SpO₂ (%)'];
    state.charts['history' + i] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: labels[i],
          data: [],
          borderColor: colors[i], borderWidth: 2,
          pointRadius: 0, fill: true,
          backgroundColor: colors[i] + '18',
          tension: 0.3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8bafd4' } },
          tooltip: { backgroundColor: '#0d1f38', borderColor: '#1a2f52', borderWidth: 1 }
        },
        scales: {
          x: { grid: { color: '#1a2f52' }, ticks: { color: '#4a6080', maxTicksLimit: 6 } },
          y: { grid: { color: '#1a2f52' }, ticks: { color: '#4a6080' } }
        }
      }
    });
  });
}

// ══════════════════════════════════════════════════════════
//  WEBSOCKET
// ══════════════════════════════════════════════════════════
function connectWebSocket() {
  setConnectionStatus('connecting', 'Connecting...');
  try {
    state.ws = new WebSocket(CONFIG.wsUrl);

    state.ws.onopen = () => {
      state.connected = true;
      setConnectionStatus('connected', 'Connected');
      console.log('[WS] Connected to ESP32');
    };

    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        processData(data);
      } catch (e) {
        console.warn('[WS] Parse error:', e);
      }
    };

    state.ws.onclose = () => {
      state.connected = false;
      setConnectionStatus('disconnected', 'Disconnected');
      setTimeout(connectWebSocket, CONFIG.reconnectDelay);
    };

    state.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  } catch (e) {
    console.error('[WS] Failed to connect:', e);
    setConnectionStatus('disconnected', 'Error');
    setTimeout(connectWebSocket, CONFIG.reconnectDelay);
  }
}

function reconnectWS() {
  const url = document.getElementById('wsUrl').value;
  if (url) CONFIG.wsUrl = url;
  CONFIG.demoMode = false;
  if (state.ws) state.ws.close();
  connectWebSocket();
}

// ══════════════════════════════════════════════════════════
//  DATA PROCESSING
// ══════════════════════════════════════════════════════════
function processData(data) {
  state.readings++;

  // Update state
  if (data.hr   !== undefined && data.hr  > 0) state.hr  = parseFloat(data.hr);
  if (data.spo2 !== undefined && data.spo2 > 0) state.spo2 = parseFloat(data.spo2);
  if (data.temp !== undefined) state.temp     = parseFloat(data.temp);
  if (data.hum  !== undefined) state.humidity = parseFloat(data.hum);
  if (data.pres !== undefined) state.pressure = parseFloat(data.pres);
  if (data.alt  !== undefined) state.altitude = parseFloat(data.alt);
  if (data.ecg  !== undefined) state.ecgRaw   = parseInt(data.ecg);
  if (data.lgt  !== undefined) state.light    = parseInt(data.lgt);
  state.fallDetected = data.fall  === 1 || data.fall  === true;
  state.vibration    = data.vib   === 1 || data.vib   === true;
  state.ecgLeadsOff  = data.ecgOff=== 1 || data.ecgOff=== true;
  state.emergency    = data.alert === 1 || data.alert === true;
  state.alertMsg     = data.msg   || '';

  // Update UI
  updateVitalCards();
  updateCharts();
  checkAlerts();
  updateLastUpdateTime();

  if (data.rssi !== undefined) {
    document.getElementById('rssiDisplay').textContent = `RSSI: ${data.rssi} dBm`;
  }
}

// ══════════════════════════════════════════════════════════
//  UPDATE VITAL CARDS
// ══════════════════════════════════════════════════════════
function updateVitalCards() {
  const T = CONFIG.thresholds;

  // ── Heart Rate ────────────────────────────────────────
  const hrEl    = document.getElementById('hrValue');
  const hrStat  = document.getElementById('hrStatus');
  const hrCard  = document.getElementById('cardHR');
  hrEl.textContent = state.hr ? Math.round(state.hr) : '--';
  let hrAlert = state.hr > 0 && (state.hr > T.hrHigh || state.hr < T.hrLow);
  setCardStatus(hrCard, hrStat, hrAlert ? 'alert' : 'normal', hrAlert ? 'ALERT' : 'NORMAL');

  // HR sparkline update
  const hrData = state.charts.hr.data.datasets[0].data;
  hrData.push(state.hr || null);
  if (hrData.length > 30) hrData.shift();
  state.charts.hr.update('none');

  // Beat indicator
  const beatEl = document.getElementById('beatIndicator');
  beatEl.classList.add('beat');
  setTimeout(() => beatEl.classList.remove('beat'), 150);

  // HR trend arrow
  const trend = document.getElementById('hrTrend');
  const prev  = hrData[hrData.length - 3] || state.hr;
  if (state.hr > prev + 1) { trend.textContent = '↑'; trend.className = 'trend-up'; }
  else if (state.hr < prev - 1) { trend.textContent = '↓'; trend.className = 'trend-down'; }
  else { trend.textContent = '→'; trend.className = 'trend-neutral'; }

  // ── SpO2 ─────────────────────────────────────────────
  const spo2El   = document.getElementById('spo2Value');
  const spo2Stat = document.getElementById('spo2Status');
  const spo2Card = document.getElementById('cardSpO2');
  spo2El.textContent = state.spo2 ? Math.round(state.spo2) : '--';
  const spo2Alert = state.spo2 > 0 && state.spo2 < T.spo2Low;
  setCardStatus(spo2Card, spo2Stat, spo2Alert ? 'alert' : 'normal', spo2Alert ? 'ALERT' : 'NORMAL');

  // SpO2 gauge
  const gaugePercent = state.spo2 > 0 ? Math.max(0, Math.min(100, (state.spo2 - 80) / 20 * 100)) : 0;
  const circumference = 157;
  const offset = circumference - (gaugePercent / 100) * circumference;
  const gaugeFill = document.getElementById('gaugeFill');
  gaugeFill.style.strokeDashoffset = offset;
  gaugeFill.style.stroke = spo2Alert ? '#ff3b3b' : '#00d4ff';
  document.getElementById('gaugeLabel').textContent = state.spo2 ? `${Math.round(state.spo2)}%` : '--%';

  // ── Temperature ───────────────────────────────────────
  const tempEl   = document.getElementById('tempValue');
  const tempStat = document.getElementById('tempStatus');
  const tempCard = document.getElementById('cardTemp');
  tempEl.textContent = state.temp ? state.temp.toFixed(1) : '--';
  const tempAlert = state.temp > T.tempHigh;
  setCardStatus(tempCard, tempStat, tempAlert ? 'alert' : 'normal', tempAlert ? 'HIGH TEMP' : 'NORMAL');

  // Thermometer fill: map 35–40°C → 0–100%
  const thermoPercent = state.temp ? Math.max(0, Math.min(100, (state.temp - 35) / 5 * 100)) : 0;
  const thermoFill = document.getElementById('thermoFill');
  thermoFill.style.width = thermoPercent + '%';
  thermoFill.style.background = tempAlert
    ? 'linear-gradient(90deg, #ff9800, #ff3b3b)'
    : 'linear-gradient(90deg, #00bcd4, #ffeb3b, #ff9800)';

  // ── Pressure ─────────────────────────────────────────
  document.getElementById('presValue').textContent = state.pressure ? Math.round(state.pressure) : '--';

  // ── Altitude ──────────────────────────────────────────
  document.getElementById('altValue').textContent = state.altitude ? Math.round(state.altitude) : '--';

  // ── Light Level ───────────────────────────────────────
  document.getElementById('lightValue').textContent = state.light !== undefined ? state.light : '--';
  const lightPct = `${state.light}% , #1a2f52 ${state.light}%`;
  document.getElementById('lightRing').style.background = `conic-gradient(#ffeb3b ${lightPct})`;

  // ── Fall / Activity ───────────────────────────────────
  const fallCard   = document.getElementById('cardFall');
  const fallStat   = document.getElementById('fallStatus');
  const fallVal    = document.getElementById('fallValue');
  const vibVal     = document.getElementById('vibValue');
  const actIcon    = document.getElementById('activityIcon');
  const actText    = document.getElementById('activityText');

  if (state.fallDetected) {
    fallVal.textContent = 'YES!';
    fallVal.className = 'fall-danger';
    actIcon.textContent = '🆘';
    actText.textContent = 'FALL DETECTED';
    setCardStatus(fallCard, fallStat, 'alert', 'ALERT');
  } else {
    fallVal.textContent = 'NO';
    fallVal.className = 'fall-safe';
    actIcon.textContent = '🚶‍♂️';
    actText.textContent = 'Standing / Walking';
    setCardStatus(fallCard, fallStat, 'normal', 'NORMAL');
  }

  vibVal.textContent = state.vibration ? 'ABNORMAL' : 'NORMAL';
  vibVal.className   = state.vibration ? 'fall-danger' : 'fall-safe';

  // ── ECG ───────────────────────────────────────────────
  const ecgCard = document.getElementById('cardECG');
  const ecgStat = document.getElementById('ecgStatus');
  document.getElementById('ecgRaw').textContent = state.ecgLeadsOff ? '----' : state.ecgRaw;
  setCardStatus(ecgCard, ecgStat,
    state.ecgLeadsOff ? 'alert' : 'normal',
    state.ecgLeadsOff ? 'LEADS OFF' : 'CONNECTED');

  // ECG mini chart
  if (!state.frozen) {
    const ecgMiniData = state.charts.ecgMini.data.datasets[0].data;
    ecgMiniData.push(state.ecgLeadsOff ? 512 : state.ecgRaw);
    if (ecgMiniData.length > 80) ecgMiniData.shift();
    state.charts.ecgMini.update('none');

    // ECG full chart
    const ecgFullData = state.charts.ecgFull.data.datasets[0].data;
    ecgFullData.push(state.ecgLeadsOff ? null : state.ecgRaw);
    if (ecgFullData.length > CONFIG.ecgBufferSize) ecgFullData.shift();
    state.charts.ecgFull.update('none');
  }

  // Update ECG info strip
  document.getElementById('ecgHR').textContent = state.hr ? Math.round(state.hr) : '--';
  document.getElementById('ecgSpO2').textContent = state.spo2 ? Math.round(state.spo2) : '--';
  document.getElementById('ecgLeads').textContent = state.ecgLeadsOff ? 'OFF ⚠️' : 'ON ✓';
}

function setCardStatus(card, badge, type, text) {
  badge.className = `card-status ${type}`;
  badge.textContent = text;
  card.classList.toggle('alert-card', type === 'alert');
}

// ══════════════════════════════════════════════════════════
//  UPDATE TREND CHARTS
// ══════════════════════════════════════════════════════════
function updateCharts() {
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  state.hrHistory.push(state.hr || null);
  state.spo2History.push(state.spo2 || null);
  state.tempHistory.push(state.temp ? state.temp * 2 : null);  // scaled for display
  state.timeLabels.push(now);

  if (state.hrHistory.length > CONFIG.maxHistory) {
    state.hrHistory.shift();
    state.spo2History.shift();
    state.tempHistory.shift();
    state.timeLabels.shift();
  }

  state.charts.trend.data.labels                  = state.timeLabels;
  state.charts.trend.data.datasets[0].data        = state.hrHistory;
  state.charts.trend.data.datasets[1].data        = state.spo2History;
  state.charts.trend.data.datasets[2].data        = state.tempHistory;
  state.charts.trend.update('none');
}

// ══════════════════════════════════════════════════════════
//  ALERT SYSTEM
// ══════════════════════════════════════════════════════════
function checkAlerts() {
  if (state.emergency && state.alertMsg) {
    addAlert(state.alertMsg, state.hr, state.spo2, state.temp);

    // Show banner
    document.getElementById('alertBannerText').textContent =
      `⚠️ ${state.alertMsg} — HR: ${Math.round(state.hr)} BPM | SpO₂: ${Math.round(state.spo2)}% | Temp: ${state.temp.toFixed(1)}°C`;
    document.getElementById('alertBanner').classList.remove('hidden');

    // Show overlay
    if (document.getElementById('overlayToggle').checked) {
      showEmergencyOverlay(state.alertMsg);
    }

    // Audio alert
    if (document.getElementById('soundToggle').checked) {
      playAlertSound();
    }
  } else {
    document.getElementById('alertBanner').classList.add('hidden');
  }
}

function addAlert(type, hr, spo2, temp) {
  const now = new Date();
  const entry = {
    type, hr: Math.round(hr), spo2: Math.round(spo2),
    temp: temp ? temp.toFixed(1) : '--',
    time: now.toLocaleTimeString(),
    severity: 'high',
  };

  // Avoid duplicate consecutive alerts
  const last = state.alertLog[0];
  if (last && last.type === type && now - last.rawTime < 5000) return;

  entry.rawTime = now;
  state.alertLog.unshift(entry);
  if (state.alertLog.length > 50) state.alertLog.pop();
  state.alertCount++;

  renderAlertList();
  document.getElementById('alertCount').textContent = `${state.alertCount} Alert${state.alertCount !== 1 ? 's' : ''}`;
}

function renderAlertList() {
  const list = document.getElementById('alertList');
  if (state.alertLog.length === 0) {
    list.innerHTML = '<div class="no-alerts">No alerts recorded</div>';
    return;
  }
  list.innerHTML = state.alertLog.map(a => `
    <div class="alert-item">
      <div class="alert-dot ${a.severity}"></div>
      <div class="alert-item-content">
        <div class="alert-type">${a.type}</div>
        <div class="alert-value">HR: ${a.hr} BPM | SpO₂: ${a.spo2}% | Temp: ${a.temp}°C</div>
        <div class="alert-time">${a.time}</div>
      </div>
    </div>
  `).join('');
}

// ── Emergency Overlay ──────────────────────────────────
function showEmergencyOverlay(msg) {
  const overlay = document.getElementById('emergencyOverlay');
  document.getElementById('emergencyTitle').textContent = '🚨 EMERGENCY ALERT';
  document.getElementById('emergencyMessage').textContent = msg;
  document.getElementById('emergencyVitals').innerHTML =
    `<span>HR: ${Math.round(state.hr)} BPM</span>
     <span>SpO₂: ${Math.round(state.spo2)}%</span>
     <span>Temp: ${state.temp.toFixed(1)}°C</span>`;
  overlay.classList.remove('hidden');
}

function dismissEmergency() {
  document.getElementById('emergencyOverlay').classList.add('hidden');
}

// ── Audio Alert ────────────────────────────────────────
let audioCtx = null;
function playAlertSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) { /* audio blocked */ }
}

// ══════════════════════════════════════════════════════════
//  DEMO SIMULATION
// ══════════════════════════════════════════════════════════
let demoInterval = null;
let demoTick = 0;
let demoEmergencyScheduled = false;

function startDemoSimulation() {
  // Simulate realistic physiological data
  const demoState = {
    hr: 72, spo2: 98, temp: 36.8, pressure: 1013.2, altitude: 12.5,
    ecgPhase: 0, light: 65, vibCount: 0,
  };

  demoInterval = setInterval(() => {
    demoTick++;

    // Smooth random walk for vitals
    demoState.hr   = clamp(demoState.hr   + (Math.random() - 0.5) * 4, 50, 130);
    demoState.spo2 = clamp(demoState.spo2 + (Math.random() - 0.5) * 0.4, 90, 100);
    demoState.temp = clamp(demoState.temp + (Math.random() - 0.5) * 0.06, 36.2, 38.5);
    demoState.pressure = clamp(demoState.pressure + (Math.random()-0.5)*0.3, 1010, 1020);
    demoState.altitude = clamp(demoState.altitude + (Math.random()-0.5)*0.2, 10, 20);
    demoState.light = Math.round(clamp(demoState.light + (Math.random()-0.5)*5, 20, 90));

    // Simulate ECG (PQRST-like waveform)
    demoState.ecgPhase = (demoState.ecgPhase + 8) % 360;
    const ecgVal = generateECGSample(demoState.ecgPhase);

    // Simulate a fall event at tick 120
    const fallDetected = (demoTick === 120);
    if (fallDetected) {
      setTimeout(() => {
        processData({ hr: demoState.hr, spo2: demoState.spo2,
          temp: demoState.temp, pres: demoState.pressure,
          alt: demoState.altitude, lgt: demoState.light,
          ecg: ecgVal, fall: 0, vib: 0, ecgOff: 0, alert: 0, msg: '' });
      }, 5000);
    }

    // Simulate SpO2 drop at tick 200
    if (demoTick === 200) demoState.spo2 = 88;
    if (demoTick === 230) demoState.spo2 = 97;

    const isEmergency = demoState.hr > 120 || demoState.hr < 50
      || demoState.spo2 < 92 || demoState.temp > 38.0 || fallDetected;

    let alertMsg = '';
    if (demoState.hr > 120)       alertMsg = 'HIGH HEART RATE';
    else if (demoState.hr < 50)   alertMsg = 'LOW HEART RATE';
    else if (demoState.spo2 < 92) alertMsg = 'LOW SpO2';
    else if (demoState.temp > 38) alertMsg = 'HIGH TEMPERATURE';
    else if (fallDetected)        alertMsg = 'FALL DETECTED';

    processData({
      ts:     Date.now(),
      hr:     Math.round(demoState.hr * 10) / 10,
      spo2:   Math.round(demoState.spo2 * 10) / 10,
      temp:   Math.round(demoState.temp * 100) / 100,
      hum:    55 + (Math.random() - 0.5) * 4,
      pres:   demoState.pressure,
      alt:    demoState.altitude,
      ecg:    ecgVal,
      lgt:    demoState.light,
      fall:   fallDetected ? 1 : 0,
      vib:    0,
      ecgOff: 0,
      alert:  isEmergency ? 1 : 0,
      msg:    alertMsg,
      rssi:   -55 + Math.round((Math.random()-0.5)*10),
    });
  }, 200);  // 5 Hz
}

function generateECGSample(phase) {
  // Approximate PQRST waveform
  const p = phase;
  if (p < 40)       return 512 + Math.round(50 * Math.sin(p * Math.PI / 40));    // P wave
  if (p < 100)      return 512 + Math.round(10 * Math.sin((p-40) * Math.PI / 60)); // PQ segment
  if (p < 115)      return 512 - Math.round(80 * Math.sin((p-100) * Math.PI / 15)); // Q
  if (p < 130)      return 512 + Math.round(350 * Math.sin((p-115) * Math.PI / 15)); // R spike
  if (p < 150)      return 512 - Math.round(120 * Math.sin((p-130) * Math.PI / 20)); // S
  if (p < 220)      return 512 + Math.round(30 * Math.sin((p-150) * Math.PI / 70));  // ST + T
  return 512 + Math.round((Math.random() - 0.5) * 8); // baseline
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ══════════════════════════════════════════════════════════
//  VIEW SWITCHING
// ══════════════════════════════════════════════════════════
function setView(view) {
  state.currentView = view;
  const views = ['dashboard', 'ecg', 'history', 'settings'];
  const elements = {
    dashboard: ['dashboardView', 'bottomRow'],
    ecg:       ['ecgView'],
    history:   ['historyView'],
    settings:  ['settingsView'],
  };

  // Hide all
  ['dashboardView', 'bottomRow', 'ecgView', 'historyView', 'settingsView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // Show active
  (elements[view] || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach((btn, i) => {
    btn.classList.toggle('active', views[i] === view);
  });

  if (view === 'history') loadHistory();
}

// ══════════════════════════════════════════════════════════
//  HISTORY VIEW
// ══════════════════════════════════════════════════════════
function generateDemoHistory() {
  const now = Date.now();
  for (let i = 288; i >= 0; i--) {
    historyData.push({
      time:     new Date(now - i * 5 * 60 * 1000),
      hr:       Math.round(68 + Math.sin(i * 0.2) * 12 + (Math.random()-0.5)*6),
      spo2:     Math.round(97 + Math.sin(i * 0.1) * 1.5 + (Math.random()-0.5)*0.5),
      temp:     (36.6 + Math.sin(i*0.05)*0.3 + (Math.random()-0.5)*0.1).toFixed(1),
      pressure: (1013 + Math.sin(i*0.03)*2).toFixed(1),
      altitude: (12 + Math.sin(i*0.04)).toFixed(1),
      fall:     i === 120 || i === 200,
      alert:    i === 120 || i === 200 || (i > 245 && i < 250),
    });
  }
}

function loadHistory() {
  const range = document.getElementById('historyRange').value;
  const count = range === '1h' ? 12 : range === '6h' ? 72 : range === '24h' ? 288 : historyData.length;
  const slice  = historyData.slice(-count);

  const labels  = slice.map(r => r.time.toLocaleTimeString('en', {hour:'2-digit', minute:'2-digit'}));
  const hrData   = slice.map(r => r.hr);
  const spo2Data = slice.map(r => r.spo2);

  // Update history charts
  [state.charts.history0, state.charts.history1].forEach((c, i) => {
    c.data.labels = labels;
    c.data.datasets[0].data = i === 0 ? hrData : spo2Data;
    c.update();
  });

  // Fill table
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = slice.slice(-50).reverse().map(r => `
    <tr>
      <td>${r.time.toLocaleTimeString()}</td>
      <td>${r.hr}</td>
      <td>${r.spo2}</td>
      <td>${r.temp}</td>
      <td>${r.pressure}</td>
      <td>${r.altitude}</td>
      <td>${r.fall ? '<span class="badge-alert">YES</span>' : 'No'}</td>
      <td>${r.alert ? '<span class="badge-alert">ALERT</span>' : '<span class="badge-normal">OK</span>'}</td>
    </tr>
  `).join('');
}

function exportHistory() {
  const rows = [['Time','HR','SpO2','Temp','Pressure','Altitude','Fall','Alert']];
  historyData.forEach(r => rows.push([
    r.time.toISOString(), r.hr, r.spo2, r.temp, r.pressure, r.altitude,
    r.fall ? 'YES' : 'NO', r.alert ? 'ALERT' : 'OK'
  ]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `health_history_${Date.now()}.csv`; a.click();
}

// ══════════════════════════════════════════════════════════
//  ECG CONTROLS
// ══════════════════════════════════════════════════════════
function setECGSpeed(mult) {
  document.querySelectorAll('.ecg-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('ecgSpeedDisplay').textContent = `${25 * mult} mm/s`;
}

function toggleECGFreeze() {
  state.frozen = !state.frozen;
  const btn = document.getElementById('ecgFreezeBtn');
  btn.textContent = state.frozen ? '▶ Resume' : '⏸ Freeze';
  btn.classList.toggle('active', state.frozen);
}

function exportECG() {
  const data = state.charts.ecgFull.data.datasets[0].data;
  const csv = 'index,ecg_value\n' + data.map((v, i) => `${i},${v}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ecg_export_${Date.now()}.csv`; a.click();
}

// ══════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════
function saveThresholds() {
  CONFIG.thresholds.hrHigh  = parseFloat(document.getElementById('tHrHigh').value) || 120;
  CONFIG.thresholds.hrLow   = parseFloat(document.getElementById('tHrLow').value)  || 50;
  CONFIG.thresholds.spo2Low = parseFloat(document.getElementById('tSpo2').value)   || 92;
  CONFIG.thresholds.tempHigh= parseFloat(document.getElementById('tTemp').value)   || 38.0;
  localStorage.setItem('healthThresholds', JSON.stringify(CONFIG.thresholds));
  showToast('Thresholds saved ✓');
}

function savePatient() {
  showToast('Patient profile saved ✓');
}

function loadSettings() {
  const saved = localStorage.getItem('healthThresholds');
  if (saved) {
    try {
      Object.assign(CONFIG.thresholds, JSON.parse(saved));
      document.getElementById('tHrHigh').value = CONFIG.thresholds.hrHigh;
      document.getElementById('tHrLow').value  = CONFIG.thresholds.hrLow;
      document.getElementById('tSpo2').value   = CONFIG.thresholds.spo2Low;
      document.getElementById('tTemp').value   = CONFIG.thresholds.tempHigh;
    } catch (e) {}
  }
}

function toggleDarkMode() {
  // In a full app, this would switch between themes
  showToast('Dark mode always active for medical use');
}

// ══════════════════════════════════════════════════════════
//  CLOCK & UPTIME
// ══════════════════════════════════════════════════════════
function startClock() {
  function tick() {
    document.getElementById('headerTime').textContent =
      new Date().toLocaleTimeString('en-US', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

function updateUptimeDisplay() {
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  document.getElementById('uptimeDisplay').textContent = `Uptime: ${h}:${m}:${s}`;
}

function updateFooterStats() {
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  document.getElementById('footerStats').textContent =
    `Readings: ${state.readings} | Alerts: ${state.alertCount} | Uptime: ${h}:${m}:${s}`;
}

function updateLastUpdateTime() {
  document.getElementById('lastUpdate').textContent =
    'Last Update: ' + new Date().toLocaleTimeString();
}

// ══════════════════════════════════════════════════════════
//  CONNECTION STATUS
// ══════════════════════════════════════════════════════════
function setConnectionStatus(status, text) {
  const dot  = document.getElementById('statusDot');
  const label= document.getElementById('statusText');
  dot.className  = `status-dot ${status === 'connected' ? 'connected' : status === 'disconnected' ? 'disconnected' : ''}`;
  label.textContent = text;
}

// ══════════════════════════════════════════════════════════
//  TOAST NOTIFICATION
// ══════════════════════════════════════════════════════════
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position:fixed; bottom:80px; right:24px; z-index:500;
      background:#0d1f38; border:1px solid #1a6bff; color:#e8f0fe;
      padding:12px 20px; border-radius:10px; font-size:.85rem;
      box-shadow:0 4px 20px rgba(0,0,0,.5); transition:opacity .3s;
      font-family:'Inter',sans-serif;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}
