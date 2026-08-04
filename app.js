// Import các hàm cần thiết từ Firebase Web SDK v10+
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 1. Cấu hình Firebase dự án của bạn
// const firebaseConfig = {
//   apiKey: "YOUR_API_KEY",
//   authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
//   databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
//   projectId: "YOUR_PROJECT_ID",
//   storageBucket: "YOUR_PROJECT_ID.appspot.com",
//   messagingSenderId: "YOUR_SENDER_ID",
//   appId: "YOUR_APP_ID"
// };

const firebaseConfig = {
  apiKey: "AIzaSyA-ud0yVtrHR9d5ik5xDk5UpcLMEN3fQxg",
  authDomain: "iot-xdroneai.firebaseapp.com",
  databaseURL: "https://iot-xdroneai-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iot-xdroneai",
  storageBucket: "iot-xdroneai.firebasestorage.app",
  messagingSenderId: "311100326665",
  appId: "1:311100326665:web:a57a67433ec4ee214349d8",
  measurementId: "G-X5N3V45T01"
};


// const firebaseConfig = {
//     apiKey: "AIzaSyDZugdeAarCpX8mCxh04X8nQVel8_sINDc",
//     authDomain: "lorawan-499fd.firebaseapp.com",
//     databaseURL: "https://lorawan-499fd-default-rtdb.asia-southeast1.firebasedatabase.app",
//     projectId: "lorawan-499fd",
//     storageBucket: "lorawan-499fd.firebasestorage.app",
//     messagingSenderId: "731216360361",
//     appId: "1:731216360361:web:f4fde047a3817433a40ab8"
// };
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// DOM Elements
const loadingEl = document.getElementById("loading");
const deviceButtonsEl = document.getElementById("device-buttons");
const deviceDetailEl = document.getElementById("device-detail");
const selectedDeviceNameEl = document.getElementById("selected-device-name");
const metricsGridEl = document.getElementById("metrics-grid");
const tableHeadersEl = document.getElementById("table-headers");
const tableBodyEl = document.getElementById("table-body");

function safeSetHtml(el, html) {
  if (el) {
    el.innerHTML = html;
  }
}

function safeSetText(el, text) {
  if (el) {
    el.textContent = text;
  }
}

// Cấu hình các cột & màu sắc tương ứng trên Biểu đồ
const MAPPING_CONFIG = [
  { key: "date_time", label: "Date time", color: null },
  { key: "device_id", label: "Device ID", color: null },
  { key: "battery_mv", label: "Battery mv", color: "#ed8936" },
  { key: "sht_humidity", label: "Air humidity %", color: "#3182ce" },
  { key: "sht_temperature", label: "Air temperature °C", color: "#e53e3e" },
  { key: "humidity", label: "Soil humidity %", color: "#00b4d8" },
  { key: "temperature", label: "Soil temperature °C", color: "#dd6b20" },
  { key: "ph", label: "pH", color: "#805ad5" },
  { key: "nitrogen", label: "Nitrogen mg/Kg", color: "#38a169" },
  { key: "phosphorus", label: "Phosphorus mg/Kg", color: "#d69e2e" },
  { key: "potassium", label: "Potassium mg/Kg", color: "#319795" }
];

const EXCLUDED_KEYS = ["dbg_k", "dbg_kd", "dbg_low", "dbg_marker", "dbg_n", "dbg_p", "dbg_source", "timestamp", "real_timestamp", "seq"];

let activeDeviceId = null;
let allDevicesData = {};
let chartInstances = [];
let lastRenderedDeviceIds = null;
let lastRenderedActiveDeviceId = null;
let lastChartDeviceId = null;
let renderDebounceTimer = null;
let pendingRenderDeviceId = null;
// Virtual scroll state for history table
let historyRecordsCache = [];
let rowHeight = null;
let visibleStart = 0;
let visibleEnd = 0;
let containerEl = null;
let rafId = null;
let prevContainerEl = null;
const BUFFER_ROWS = 8;
const RENDER_DEBOUNCE_MS = 180;
const MAX_CHART_POINTS = 80;

// Khởi tạo đọc dữ liệu Realtime
const dbRef = ref(database, "devices");

onValue(dbRef, (snapshot) => {
  if (loadingEl) {
    loadingEl.style.display = "none";
  }

  if (snapshot.exists()) {
    allDevicesData = snapshot.val();
    const deviceIds = Object.keys(allDevicesData).sort();

    // Render danh sách nút bấm chọn Device
    renderDeviceButtons(deviceIds);

    // Mặc định chọn thiết bị đầu tiên nếu chưa chọn
    if (!activeDeviceId || !deviceIds.includes(activeDeviceId)) {
      activeDeviceId = deviceIds[0] || null;
    }

    if (activeDeviceId && allDevicesData[activeDeviceId]) {
      scheduleRenderDeviceDetail(activeDeviceId);
    }
  } else {
    safeSetHtml(deviceButtonsEl, "<p>Không tìm thấy thiết bị nào.</p>");
    deviceDetailEl?.classList.add("hidden");
  }
}, (error) => {
  console.error("Lỗi kết nối Firebase:", error);
  safeSetText(loadingEl, "Lỗi tải dữ liệu!");
});

function scheduleRenderDeviceDetail(deviceId) {
  pendingRenderDeviceId = deviceId;
  if (renderDebounceTimer) {
    clearTimeout(renderDebounceTimer);
  }

  renderDebounceTimer = window.setTimeout(() => {
    renderDebounceTimer = null;
    const targetDeviceId = pendingRenderDeviceId;
    if (!targetDeviceId || !allDevicesData[targetDeviceId]) return;
    renderDeviceDetail(targetDeviceId);
  }, RENDER_DEBOUNCE_MS);
}

// Render danh sách nút bấm chọn thiết bị
function renderDeviceButtons(deviceIds) {
  if (!deviceButtonsEl) return;

  const sameList = lastRenderedDeviceIds &&
    lastRenderedDeviceIds.length === deviceIds.length &&
    lastRenderedDeviceIds.every((id, index) => id === deviceIds[index]);

  if (sameList && lastRenderedActiveDeviceId === activeDeviceId) {
    return;
  }

  lastRenderedDeviceIds = deviceIds;
  lastRenderedActiveDeviceId = activeDeviceId;

  deviceButtonsEl.innerHTML = "";
  deviceIds.forEach(id => {
    const btn = document.createElement("button");
    btn.className = `device-btn ${id === activeDeviceId ? 'active' : ''}`;
    btn.innerText = `📱 Device: ${id}`;
    btn.onclick = () => {
      activeDeviceId = id;
      renderDeviceButtons(deviceIds);
      scheduleRenderDeviceDetail(id);
    };
    deviceButtonsEl.appendChild(btn);
  });
}

// Render chi tiết của 1 thiết bị khi nhấp vào
function renderDeviceDetail(deviceId) {
  if (!deviceId || !allDevicesData?.[deviceId]) return;

  deviceDetailEl?.classList.remove("hidden");
  safeSetText(selectedDeviceNameEl, `📱 Thiết bị: ${deviceId}`);

  const device = allDevicesData[deviceId];
  const latestData = processDataObj(device.latest || {});
  const historyData = device.history || {};

  // 1. Render Metrics Cards (Latest)
  renderMetricsCards(latestData);

  // 2. Chuẩn bị dữ liệu History & Sắp xếp theo real_timestamp LỚN ĐỨNG ĐẦU BẢNG
  let historyKeys = Object.keys(historyData);
  historyKeys.sort((a, b) => {
    const tsA = Number(historyData[a]?.real_timestamp) || 0;
    const tsB = Number(historyData[b]?.real_timestamp) || 0;
    return tsB - tsA;
  });

  const processedHistoryRecords = historyKeys.map(key => processDataObj(historyData[key]));

  // 3. Render các Biểu đồ Line Chart riêng cho từng tham số
  const chartHistoryRecords = processedHistoryRecords.slice(-MAX_CHART_POINTS);
  renderLineCharts(chartHistoryRecords, deviceId);

  // 4. Render Bảng Lịch sử
  renderHistoryTable(processedHistoryRecords);
}

// Hàm render thẻ chỉ số nhanh
function renderMetricsCards(latestData) {
  if (!metricsGridEl) return;
  metricsGridEl.innerHTML = "";
  MAPPING_CONFIG.forEach(({ key, label, color }) => {
    if (latestData[key] !== undefined && key !== "date_time" && key !== "device_id") {
      const card = document.createElement("div");
      card.className = "metric-card";
      if (color) card.style.borderLeftColor = color;
      card.innerHTML = `
        <div class="title">${label}</div>
        <div class="value">${latestData[key]}</div>
      `;
      metricsGridEl.appendChild(card);
    }
  });
}

// Hàm vẽ nhiều biểu đồ đường riêng cho từng tham số
function renderLineCharts(historyRecords, deviceId) {
  const chartsContainerEl = document.getElementById("charts-container");
  if (!chartsContainerEl) return;

  const metricConfigs = MAPPING_CONFIG.filter(config => config.color !== null);
  const labels = [...historyRecords].reverse().map(item => item.date_time || "-");
  const shouldRecreate = lastChartDeviceId !== deviceId || chartInstances.length !== metricConfigs.length;

  if (shouldRecreate) {
    chartInstances.forEach(chart => chart?.destroy());
    chartInstances = [];
    chartsContainerEl.innerHTML = "";
    lastChartDeviceId = deviceId;
  }

  metricConfigs.forEach((config, index) => {
    let card = chartsContainerEl.children[index];
    if (!card) {
      card = document.createElement("div");
      card.className = "chart-card";
      card.innerHTML = `
        <h5>${config.label}</h5>
        <div class="chart-container">
          <canvas></canvas>
        </div>
      `;
      chartsContainerEl.appendChild(card);
    }

    const canvas = card.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    if (!chartInstances[index]) {
      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: config.label,
            data: [...historyRecords].reverse().map(item => item[config.key] !== undefined ? item[config.key] : null),
            borderColor: config.color,
            backgroundColor: config.color,
            tension: 0.28,
            fill: false,
            pointRadius: 0.4,
            borderWidth: 2.2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                title: (items) => `Thời gian: ${items[0].label}`
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: 'Thời gian' }
            },
            y: {
              title: { display: true, text: config.label }
            }
          }
        }
      });

      chartInstances[index] = chart;
    } else {
      const chart = chartInstances[index];
      chart.data.labels = labels;
      chart.data.datasets[0].label = config.label;
      chart.data.datasets[0].data = [...historyRecords].reverse().map(item => item[config.key] !== undefined ? item[config.key] : null);
      chart.data.datasets[0].borderColor = config.color;
      chart.data.datasets[0].backgroundColor = config.color;
      chart.update('none');
    }
  });
}

// Hàm render Bảng Lịch sử
function renderHistoryTable(historyRecords) {
  if (!tableHeadersEl || !tableBodyEl) return;
  // Lưu cache
  historyRecordsCache = historyRecords || [];

  // Thêm Header
  tableHeadersEl.innerHTML = MAPPING_CONFIG.map(col => `<th>${col.label}</th>`).join('');

  // Nếu không có dữ liệu thì hiển thị thông báo và dọn listeners
  if (historyRecordsCache.length === 0) {
    detachVirtualScroll();
    tableBodyEl.innerHTML = `<tr><td colspan="${MAPPING_CONFIG.length}">Không có dữ liệu lịch sử</td></tr>`;
    return;
  }

  // Thiết lập container và listeners nếu cần
  containerEl = tableBodyEl.closest('.table-wrapper');
  if (containerEl !== prevContainerEl) {
    detachVirtualScroll();
    attachVirtualScroll(containerEl);
    prevContainerEl = containerEl;
  }

  // Đo rowHeight nếu chưa có
  measureRowHeightIfNeeded();

  // Render lần đầu
  renderVisibleRows();
}

function measureRowHeightIfNeeded() {
  if (rowHeight) return;
  if (!tableBodyEl) return;
  const tr = document.createElement('tr');
  MAPPING_CONFIG.forEach(() => {
    const td = document.createElement('td');
    td.textContent = '-';
    tr.appendChild(td);
  });
  tr.style.visibility = 'hidden';
  tableBodyEl.appendChild(tr);
  rowHeight = tr.offsetHeight || 36;
  tr.remove();
}

function attachVirtualScroll(container) {
  if (!container) return;
  const onScroll = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderVisibleRows);
  };
  const onResize = () => {
    measureRowHeightIfNeeded();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderVisibleRows);
  };
  container.addEventListener('scroll', onScroll);
  window.addEventListener('resize', onResize);
  // store handlers on element for later removal
  container._virtualHandlers = { onScroll, onResize };
}

function detachVirtualScroll() {
  if (!prevContainerEl) return;
  const handlers = prevContainerEl._virtualHandlers;
  if (handlers) {
    prevContainerEl.removeEventListener('scroll', handlers.onScroll);
    window.removeEventListener('resize', handlers.onResize);
    delete prevContainerEl._virtualHandlers;
  }
  prevContainerEl = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function renderVisibleRows() {
  if (!tableBodyEl || !containerEl) return;
  const total = historyRecordsCache.length;
  if (total === 0) return;

  const containerHeight = containerEl.clientHeight;
  measureRowHeightIfNeeded();
  const rowsPerView = Math.max(1, Math.ceil(containerHeight / rowHeight));
  const scrollTop = containerEl.scrollTop;
  let start = Math.floor(scrollTop / rowHeight) - BUFFER_ROWS;
  if (start < 0) start = 0;
  let end = Math.min(total, start + rowsPerView + BUFFER_ROWS * 2);

  // If visible range unchanged, do nothing
  if (start === visibleStart && end === visibleEnd) return;

  visibleStart = start;
  visibleEnd = end;

  const fragment = document.createDocumentFragment();

  // top spacer
  const topTr = document.createElement('tr');
  const topTd = document.createElement('td');
  topTd.colSpan = MAPPING_CONFIG.length;
  topTd.style.padding = '0';
  topTd.style.border = 'none';
  topTd.style.height = `${start * rowHeight}px`;
  topTr.appendChild(topTd);
  fragment.appendChild(topTr);

  // visible rows
  for (let i = start; i < end; i++) {
    const record = historyRecordsCache[i];
    const tr = document.createElement('tr');
    MAPPING_CONFIG.forEach(({ key }) => {
      const td = document.createElement('td');
      td.textContent = record[key] !== undefined ? record[key] : '-';
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  }

  // bottom spacer
  const bottomTr = document.createElement('tr');
  const bottomTd = document.createElement('td');
  bottomTd.colSpan = MAPPING_CONFIG.length;
  bottomTd.style.padding = '0';
  bottomTd.style.border = 'none';
  bottomTd.style.height = `${(total - end) * rowHeight}px`;
  bottomTr.appendChild(bottomTd);
  fragment.appendChild(bottomTr);

  tableBodyEl.replaceChildren(fragment);
}

// Hàm hỗ trợ lọc dữ liệu và chuyển đổi timestamp
function processDataObj(rawObj) {
  if (typeof rawObj !== 'object' || rawObj === null) return {};
  const result = {};

  Object.entries(rawObj).forEach(([key, val]) => {
    if (!EXCLUDED_KEYS.includes(key)) {
      result[key] = val;
    }
  });

  if (rawObj.real_timestamp) {
    result["date_time"] = convertTimestampToDate(rawObj.real_timestamp);
  }

  return result;
}

function convertTimestampToDate(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "-";
  let ts = Number(timestamp);
  if (ts < 10000000000) ts *= 1000;

  const date = new Date(ts);
  if (isNaN(date.getTime())) return "-";

  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;//:${pad(date.getSeconds())}`;
}