# Smart IoT-Based Health Monitoring & Emergency Alert System

## Using Arduino Mega, ESP32, MAX30100, AD8232 ECG, ADXL345, BMP280, and OLED Display

---

## 📋 Project Overview

A complete, production-ready IoT health monitoring system that collects real-time vital signs from medical-grade sensors, detects emergency conditions, and transmits data to a cloud dashboard and mobile application.

### Key Features
- ❤️ Real-time Heart Rate (BPM) monitoring via MAX30100
- 💧 Blood Oxygen (SpO2) monitoring via MAX30100
- 📈 Live ECG signal acquisition via AD8232
- 🌡️ Body temperature monitoring via DHT22
- 🌐 Atmospheric pressure & altitude via BMP280
- 🔽 Fall detection via ADXL345 accelerometer
- 📳 Vibration detection via SW-420 sensor
- 💡 Ambient light monitoring via LDR
- 📟 Local OLED display with rotating info pages
- 🚨 Emergency alerts (LED, Buzzer, Mobile Push, Database)
- 📡 Wi-Fi connectivity via ESP32
- ☁️ MQTT + WebSocket + Firebase cloud integration
- 🖥️ Professional web dashboard with live charts
- 📱 PWA mobile application

---

## 🗂️ Project Structure

```
health-monitoring/
├── arduino/
│   ├── arduino_mega_main/
│   │   └── arduino_mega_main.ino    ← Main Arduino Mega firmware
│   └── libraries_required.txt      ← Library installation guide
├── esp32/
│   └── esp32_wifi_bridge/
│       └── esp32_wifi_bridge.ino   ← ESP32 gateway firmware
├── dashboard/
│   ├── index.html                  ← Web dashboard (open in browser)
│   ├── style.css                   ← Dark blue medical theme styles
│   └── app.js                      ← Chart.js + WebSocket logic
├── mobile-app/
│   └── index.html                  ← Mobile PWA (open on phone)
├── database/
│   └── schema.sql                  ← PostgreSQL / Firebase schema
├── docs/
│   ├── circuit_diagram.md          ← Complete pin connections
│   ├── architecture.md             ← System architecture diagrams
│   ├── block_diagram.md            ← Block diagram
│   └── flowchart.md               ← Working flowcharts
└── README.md                       ← This file
```

---

## 🔌 Hardware Requirements

| # | Component                    | Quantity |
|---|------------------------------|----------|
| 1 | Arduino Mega 2560            | 1        |
| 2 | ESP32 Dev Module (30 or 38-pin) | 1     |
| 3 | MAX30100 Pulse Oximeter      | 1        |
| 4 | AD8232 ECG Sensor + Electrodes | 1      |
| 5 | DHT22 Temperature/Humidity   | 1        |
| 6 | BMP280 Pressure/Altitude     | 1        |
| 7 | ADXL345 Accelerometer        | 1        |
| 8 | SW-420 Vibration Sensor      | 1        |
| 9 | LDR Photoresistor            | 1        |
| 10| 0.96" OLED SSD1306 (I2C)    | 1        |
| 11| Green LED 5mm                | 1        |
| 12| Red LED 5mm                  | 1        |
| 13| Buzzer (Active 5V)           | 1        |
| 14| 5V→3.3V Logic Level Shifter  | 1        |
| 15| Resistors (220Ω, 10kΩ, 4.7kΩ) | Assorted |
| 16| Breadboard / PCB             | 1        |
| 17| Jumper Wires                 | Assorted |
| 18| USB Power Supply 5V 2A       | 1        |

---

## 📚 Required Libraries

### Arduino Mega
Install via **Arduino IDE → Tools → Manage Libraries**:
- `MAX30100lib` by OXullo Intersecans
- `DHT sensor library` by Adafruit
- `Adafruit BMP280 Library`
- `SparkFun ADXL345 Arduino Library`
- `Adafruit SSD1306`
- `Adafruit GFX Library`
- `ArduinoJson` by Benoit Blanchon (v6.x)

### ESP32
Install via **Arduino IDE → Tools → Board Manager**:
- `esp32` by Espressif Systems (board package)

Install via Library Manager:
- `PubSubClient` by Nick O'Leary
- `WebSocketsServer` by Links2004
- `ArduinoJson` by Benoit Blanchon
- `ArduinoOTA` (bundled with ESP32 core)

---

## ⚡ Quick Start

### Step 1: Hardware Assembly
1. Connect all sensors per `docs/circuit_diagram.md`
2. Ensure 5V→3.3V level shifter between Mega TX1 → ESP32 RX2
3. All 3.3V sensors share a common 3.3V rail (from AMS1117 LDO or Arduino 3.3V pin)

### Step 2: Program Arduino Mega
```
1. Open Arduino IDE
2. Install all required libraries (see above)
3. Open: arduino/arduino_mega_main/arduino_mega_main.ino
4. Board: Tools → Arduino Mega or Mega 2560
5. Port:  Select your Arduino COM port
6. Click Upload
```

### Step 3: Program ESP32
```
1. Open: esp32/esp32_wifi_bridge/esp32_wifi_bridge.ino
2. Edit these lines with your details:
   const char* WIFI_SSID1 = "YOUR_WIFI_SSID";
   const char* WIFI_PASS1 = "YOUR_WIFI_PASSWORD";
3. Board:  ESP32 Dev Module
4. Upload Speed: 921600
5. Click Upload
```

### Step 4: Set Up Database
```sql
-- PostgreSQL
psql -U postgres -d healthdb -f database/schema.sql

-- Or import to your cloud PostgreSQL instance (Supabase, Railway, etc.)
```

### Step 5: Run Web Dashboard
```
Simply open: dashboard/index.html in any modern browser

The dashboard runs in Demo Mode by default (simulated data).

To connect to real hardware:
1. Open dashboard/app.js
2. Set CONFIG.demoMode = false
3. Set CONFIG.wsUrl = 'ws://YOUR_ESP32_IP:81'
4. Refresh browser
```

### Step 6: Open Mobile App
```
Open: mobile-app/index.html in a mobile browser

For PWA installation (Add to Home Screen):
• Android Chrome: Menu → Add to Home Screen
• iOS Safari: Share → Add to Home Screen

For real data: edit the WebSocket URL in mobile-app/index.html
```

---

## 🚨 Emergency Alert Thresholds

| Condition            | Threshold              | Action                    |
|----------------------|------------------------|---------------------------|
| Heart Rate HIGH      | > 120 BPM              | Red LED, Buzzer, Alert    |
| Heart Rate LOW       | < 50 BPM               | Red LED, Buzzer, Alert    |
| SpO2 LOW             | < 92%                  | Red LED, Buzzer, Alert    |
| Temperature HIGH     | > 38.0°C               | Red LED, Buzzer, Alert    |
| Fall Detected        | ADXL345 algorithm      | Red LED, Buzzer, Alert    |
| ECG Leads Off        | LO+ or LO- HIGH        | Red LED, Buzzer, Alert    |
| Abnormal Vibration   | ≥5 counts in 2 sec     | Red LED, Buzzer, Alert    |
| Normal Condition     | All within range       | Green LED, No buzzer      |

> Thresholds are configurable in the web dashboard Settings tab.

---

## 📡 MQTT Topics

| Topic                      | Payload               | Direction   |
|----------------------------|-----------------------|-------------|
| `smarthealth/vitals`       | JSON vitals object    | ESP32 → All |
| `smarthealth/alerts`       | JSON alert object     | ESP32 → All |
| `smarthealth/device/status`| JSON device info      | ESP32 → All |
| `smarthealth/cmd/#`        | Commands              | App → ESP32 |

### Vitals JSON Payload Example
```json
{
  "ts":   1718900631000,
  "hr":   72.5,
  "spo2": 98.1,
  "temp": 36.8,
  "hum":  55.2,
  "pres": 1013.2,
  "alt":  12.4,
  "ecg":  645,
  "lgt":  65,
  "fall": 0,
  "vib":  0,
  "ecgOff": 0,
  "alert": 0,
  "msg":  ""
}
```

---

## 🗄️ Database Tables

| Table             | Purpose                             |
|-------------------|-------------------------------------|
| `devices`         | Device registry                     |
| `patients`        | Patient profiles                    |
| `vital_readings`  | Time-series vital signs (main)      |
| `ecg_data`        | Raw ECG sample buffer               |
| `fall_events`     | Fall detection events               |
| `alerts`          | All emergency alert history         |
| `notification_log`| Push/SMS/email delivery tracking    |
| `system_logs`     | Device diagnostics                  |

---

## 📊 Dashboard Features

| Feature                | Description                                    |
|------------------------|------------------------------------------------|
| Live Heart Rate Card   | BPM with sparkline + trend arrow               |
| SpO2 Gauge             | Arc gauge with real-time update                |
| Temperature Bar        | Thermometer visualization                      |
| ECG Graph (mini)       | 80-sample rolling ECG                         |
| ECG Full View          | 200-sample full-screen with grid overlay      |
| Fall Detection Card    | Activity icon + status                        |
| Trend Chart            | HR + SpO2 + Temp multi-axis 60-point history  |
| Alert History          | Time-stamped alert log with severity           |
| History View           | 1H/6H/24H/7D charts + exportable CSV table   |
| Settings Panel         | Configurable thresholds, WS URL, patient info |
| Emergency Overlay      | Full-screen red pulsing alert modal           |

---

## 📱 Mobile App Tabs

| Tab      | Features                                                |
|----------|---------------------------------------------------------|
| Monitor  | 8 vital cards, live ECG graph, quick stats              |
| Alerts   | Alert history with severity, time, and acknowledgement |
| History  | 1H/6H/24H/7D charts for HR, SpO2, Temperature         |
| Profile  | Patient info, emergency contacts, device status, SOS   |

---

## 🏗️ System Architecture

```
Sensors → Arduino Mega 2560 → [UART] → ESP32 Wi-Fi
                                              │
                    ┌─────────────────────────┼──────────────────┐
                    ▼                         ▼                   ▼
              MQTT Broker              Firebase RTDB        WebSocket :81
                    │                                             │
              ┌─────┴─────┐                               ┌──────┴──────┐
              ▼           ▼                               ▼             ▼
         PostgreSQL  Notification                   Web Dashboard  Mobile App
          Database    Service
```

---

## 🔒 Security Notes

- Use MQTT over TLS (port 8883) in production
- Store credentials in environment variables, not source code
- Enable Firebase security rules to restrict read/write
- OTA password should be changed from default
- All patient data is PII — comply with local health data regulations

---

## 🛠️ Troubleshooting

| Issue                         | Solution                                          |
|-------------------------------|---------------------------------------------------|
| MAX30100 not detected         | Check 3.3V supply, SDA/SCL pull-ups, I2C address |
| ECG shows flat line           | Verify electrode placement, check LO± pins       |
| ESP32 won't connect to Wi-Fi  | Check SSID/password, check 2.4GHz (not 5GHz)    |
| OLED shows nothing            | Verify I2C address (0x3C vs 0x3D)               |
| Dashboard shows no data       | Set correct ESP32 IP in CONFIG.wsUrl             |
| Fall not detected             | Adjust FALL_ACCEL_THRESHOLD in firmware          |
| UART garbled data             | Check level shifter, verify 115200 baud both ends|

---

## 📄 License

MIT License – Free for educational and research use.

---

## 👥 Credits

- **Project:** Smart IoT-Based Health Monitoring System
- **Hardware:** Arduino Mega 2560 + ESP32
- **Sensors:** MAX30100, AD8232, DHT22, BMP280, ADXL345
- **Libraries:** Adafruit, SparkFun, OXullo, Benoit Blanchon
- **Dashboard:** Chart.js, Inter font (Google Fonts)
