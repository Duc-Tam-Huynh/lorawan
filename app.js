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

const dataListEl = document.getElementById("data-list");
const loadingEl = document.getElementById("loading");

// Danh sách các key rác cần loại bỏ
const EXCLUDED_KEYS = [
  "dbg_k", "dbg_kd", "dbg_low", "dbg_marker", 
  "dbg_n", "dbg_p", "dbg_source", "timestamp", "real_timestamp","seq"
];

// Thứ tự cột cố định theo yêu cầu
const TARGET_COLUMN_ORDER = [
  "date_time",
  "device_id",
  "battery_mv",
  "sht_humidity",
  "sht_temperature",
  "humidity",
  "temperature",
  "ph",
  "nitrogen",
  "phosphorus",
  "potassium"
];

const dbRef = ref(database, "devices");

onValue(dbRef, (snapshot) => {
  loadingEl.style.display = "none";
  dataListEl.innerHTML = "";

  if (snapshot.exists()) {
    const devices = snapshot.val();

    Object.keys(devices).forEach((deviceId) => {
      const deviceData = devices[deviceId];
      const latestData = deviceData.latest || {};
      const historyData = deviceData.history || {};

      const deviceCard = document.createElement("div");
      deviceCard.className = "device-card";

      // 1. Tiêu đề Thiết bị
      let contentHtml = `<h3 class="device-title">📱 Thiết bị ID: ${latestData.device_id || deviceId}</h3>`;

      // 2. Bảng LATEST (Dữ liệu Mới nhất)
      contentHtml += `
        <div class="section-block">
          <h4 class="section-title">⚡ Dữ liệu Mới nhất (Latest)</h4>
          <div class="table-wrapper">
            <table class="params-table">
              <thead>
                <tr>
                  <th>Tham số</th>
                  <th>Giá trị</th>
                </tr>
              </thead>
              <tbody>
      `;

      if (Object.keys(latestData).length > 0) {
        const processedLatest = processDataObj(latestData);

        // Hiển thị Latest theo thứ tự cột chuẩn
        TARGET_COLUMN_ORDER.forEach((key) => {
          if (processedLatest[key] !== undefined) {
            contentHtml += `
              <tr>
                <td class="param-name">${key}</td>
                <td class="param-val">${formatValue(processedLatest[key])}</td>
              </tr>
            `;
          }
        });
      } else {
        contentHtml += `<tr><td colspan="2">Không có dữ liệu latest.</td></tr>`;
      }

      contentHtml += `
              </tbody>
            </table>
          </div>
        </div>
      `;

      // 3. Bảng HISTORY (Lịch sử)
      contentHtml += `
        <div class="section-block">
          <h4 class="section-title">📜 Lịch sử Dữ liệu (History)</h4>
      `;

      let historyKeys = Object.keys(historyData);

      if (historyKeys.length > 0) {
        // Sắp xếp real_timestamp LỚN ĐỨNG ĐẦU BẢNG
        historyKeys.sort((a, b) => {
          const tsA = Number(historyData[a]?.real_timestamp) || 0;
          const tsB = Number(historyData[b]?.real_timestamp) || 0;
          return tsB - tsA;
        });

        contentHtml += `
          <div class="table-wrapper">
            <table class="history-table">
              <thead>
                <tr>
                  ${TARGET_COLUMN_ORDER.map(col => `<th>${col}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
        `;

        // Render từng bản ghi lịch sử (Không có cột Record Key nữa)
        historyKeys.forEach((recordKey) => {
          const record = historyData[recordKey];
          contentHtml += `<tr>`;

          if (typeof record === 'object' && record !== null) {
            const processedRecord = processDataObj(record);

            // Duyệt chính xác theo thứ tự mảng TARGET_COLUMN_ORDER
            TARGET_COLUMN_ORDER.forEach((col) => {
              const val = processedRecord[col] !== undefined ? processedRecord[col] : '-';
              contentHtml += `<td>${formatValue(val)}</td>`;
            });
          } else {
            contentHtml += `<td colspan="${TARGET_COLUMN_ORDER.length}">${formatValue(record)}</td>`;
          }

          contentHtml += `</tr>`;
        });

        contentHtml += `
              </tbody>
            </table>
          </div>
        `;
      } else {
        contentHtml += `<p class="no-data">Không có lịch sử dữ liệu.</p>`;
      }

      contentHtml += `</div>`;

      deviceCard.innerHTML = contentHtml;
      dataListEl.appendChild(deviceCard);
    });
  } else {
    dataListEl.innerHTML = "<p>Không tìm thấy dữ liệu thiết bị nào.</p>";
  }
}, (error) => {
  console.error("Lỗi kết nối Firebase:", error);
  loadingEl.innerText = "Lỗi khi tải dữ liệu!";
});

/**
 * Xử lý dữ liệu: Bỏ key rác và tạo date_time từ real_timestamp
 */
function processDataObj(rawObj) {
  const result = {};

  Object.entries(rawObj).forEach(([key, val]) => {
    if (EXCLUDED_KEYS.includes(key)) return;
    result[key] = val;
  });

  // Tự động thêm date_time nếu có real_timestamp
  if (rawObj.real_timestamp) {
    result["date_time"] = convertTimestampToDate(rawObj.real_timestamp);
  }

  return result;
}

/**
 * Chuyển đổi timestamp sang định dạng YYYY-MM-DD HH:mm:ss
 */
function convertTimestampToDate(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "-";

  let ts = Number(timestamp);
  if (ts < 10000000000) {
    ts *= 1000;
  }

  const date = new Date(ts);
  if (isNaN(date.getTime())) return "-";

  const pad = (n) => n.toString().padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format giá trị hiển thị
 */
function formatValue(value) {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}