# System Flowchart

## Smart IoT-Based Health Monitoring & Emergency Alert System

---

## 1. Arduino Mega Main Loop Flowchart

```
                            ┌─────────────────┐
                            │   SYSTEM START   │
                            └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │  Initialize I2C   │
                            │  Wire.begin()     │
                            └────────┬─────────┘
                                     │
                    ┌────────────────┼────────────────────┐
                    │                │                     │
           ┌────────▼──────┐ ┌──────▼──────┐ ┌──────────▼──────┐
           │ Init MAX30100 │ │ Init BMP280 │ │  Init ADXL345   │
           └────────┬──────┘ └──────┬──────┘ └──────────┬──────┘
                    │               │                     │
                    └───────────────┼─────────────────────┘
                                    │
                    ┌───────────────┼─────────────────────┐
                    │               │                     │
           ┌────────▼──────┐ ┌──────▼──────┐ ┌──────────▼──────┐
           │ Init DHT22    │ │ Init OLED   │ │ Init GPIO Pins  │
           │               │ │ Show "Ready"│ │ LED, Buzzer     │
           └────────┬──────┘ └──────┬──────┘ └──────────┬──────┘
                    └───────────────┼─────────────────────┘
                                    │
                            ┌───────▼───────┐
                            │  Startup LED  │
                            │  Self-Test    │
                            │  (blink all)  │
                            └───────┬───────┘
                                    │
                        ════════════▼════════════
                       ║       MAIN LOOP          ║
                        ════════════╦════════════
                                    ║
                            ┌───────▼───────┐
                            │ pulseOx.update│ ← Every iteration
                            │ (MAX30100)    │
                            └───────┬───────┘
                                    │
                        ┌───────────▼────────────┐
                        │ 200ms Timer Elapsed?   │
                        └──────┬──────────┬──────┘
                              YES         NO
                               │          │──────────────────────┐
                        ┌──────▼──────┐                          │
                        │ Read All    │                          │
                        │ Fast Sensors│                          │
                        │ • MAX30100  │                          │
                        │ • ECG/AD8232│                          │
                        │ • ADXL345   │                          │
                        │ • Vibration │                          │
                        │ • LDR       │                          │
                        └──────┬──────┘                          │
                               │                                  │
                        ┌──────▼──────┐                          │
                        │ 2000ms Timer│                          │
                        │ Elapsed?    │                          │
                        └──┬──────┬───┘                          │
                          YES     NO                              │
                           │       └──────────────────────┐      │
                    ┌──────▼──────┐                        │      │
                    │ Read Slow   │                        │      │
                    │ Sensors     │                        │      │
                    │ • DHT22     │                        │      │
                    │ • BMP280    │                        │      │
                    └──────┬──────┘                        │      │
                           │                               │      │
                    ┌──────▼──────┐◀──────────────────────┘      │
                    │   Evaluate  │                               │
                    │   Alerts    │                               │
                    └──────┬──────┘                               │
                           │                                       │
                    ┌──────▼──────────────────┐                   │
                    │  Is any threshold        │                   │
                    │  exceeded?               │                   │
                    └──┬───────────────────┬───┘                   │
                      YES                  NO                       │
                       │                   │                        │
               ┌───────▼────────┐  ┌───────▼──────────┐           │
               │ EMERGENCY MODE │  │   NORMAL MODE    │           │
               │                │  │                  │           │
               │ • Red LED ON   │  │ • Green LED ON   │           │
               │ • Buzzer BEEP  │  │ • Buzzer OFF     │           │
               │ • Green OFF    │  │ • Red LED OFF    │           │
               └───────┬────────┘  └───────┬──────────┘           │
                       └───────────────────┘                       │
                                    │                               │
                            ┌───────▼───────┐                      │
                            │  500ms Timer? │                      │
                            └──┬────────┬───┘                      │
                              YES       NO─────────────────────────┘
                               │
                        ┌──────▼──────┐
                        │ Update OLED │
                        │ (3 rotating │
                        │   pages)    │
                        └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │  1000ms     │
                        │  Timer?     │
                        └──┬───────┬──┘
                          YES      NO
                           │        └─────────────────────────────┐
                    ┌──────▼──────┐                               │
                    │ Serialize   │                               │
                    │ JSON Data   │                               │
                    └──────┬──────┘                               │
                           │                                       │
                    ┌──────▼──────┐                               │
                    │ Send via    │                               │
                    │ Serial1 to  │                               │
                    │ ESP32       │                               │
                    └──────┬──────┘                               │
                           │                                       │
                           └──────────────────────────────────────┘
                                        (repeat)
```

---

## 2. Emergency Alert Detection Flowchart

```
                    ┌─────────────────────────┐
                    │    READ SENSOR DATA      │
                    │ • heart_rate (BPM)       │
                    │ • spo2 (%)               │
                    │ • temperature (°C)        │
                    │ • fallDetected (bool)    │
                    │ • ecgLeadsOff (bool)     │
                    │ • vibration (bool)       │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │       HR > 120 BPM?                  │
              └──────┬───────────────────┬───────────┘
                    YES                 NO
                     │                  │
              ┌──────▼──────┐  ┌────────▼──────────────────┐
              │ alert =TRUE │  │     HR < 50 BPM?           │
              │ msg="HIGH   │  └──────┬──────────────────┬───┘
              │  HEART RATE"│       YES                  NO
              └──────┬──────┘        │                   │
                     │        ┌──────▼──────┐  ┌─────────▼──────────────┐
                     │        │ alert=TRUE  │  │    SpO2 < 92%?          │
                     │        │ msg="LOW    │  └──────┬──────────────┬────┘
                     │        │  HR"        │       YES              NO
                     │        └──────┬──────┘        │               │
                     │               │       ┌───────▼─────┐  ┌──────▼──────────────┐
                     │               │       │ alert=TRUE  │  │  Temperature > 38°C?│
                     │               │       │ msg="LOW    │  └──────┬───────────┬───┘
                     │               │       │  SpO2"      │       YES           NO
                     │               │       └──────┬──────┘        │             │
                     │               │              │       ┌────────▼────┐ ┌──────▼─────────┐
                     │               │              │       │ alert=TRUE  │ │ Fall Detected? │
                     │               │              │       │ msg="HIGH   │ └──┬──────────┬───┘
                     │               │              │       │  TEMP"      │  YES          NO
                     │               │              │       └──────┬──────┘   │            │
                     │               │              │              │  ┌────────▼────┐ ┌────▼───────────┐
                     │               │              │              │  │ alert=TRUE  │ │ Vibration High?│
                     │               │              │              │  │ msg="FALL   │ └──┬─────────┬────┘
                     │               │              │              │  │  DETECTED"  │  YES         NO
                     │               │              │              │  └──────┬──────┘   │           │
                     │               │              │              │         │  ┌────────▼────┐ ┌───▼──────┐
                     │               │              │              │         │  │ alert=TRUE  │ │ alert=   │
                     │               │              │              │         │  │ msg="ABNORM │ │ FALSE    │
                     │               │              │              │         │  │  VIBRATION" │ └────┬─────┘
                     │               │              │              │         │  └──────┬──────┘      │
                     └───────────────┴──────────────┴──────────────┴─────────┴─────────┘             │
                                                                                     │                 │
                                                           ┌─────────────────────────▼─────────────────▼──┐
                                                           │           Is alert = TRUE?                    │
                                                           └──────────────┬────────────────────┬───────────┘
                                                                         YES                   NO
                                                                          │                    │
                                                              ┌──────────▼──────────┐  ┌──────▼────────────┐
                                                              │  EMERGENCY RESPONSE │  │   NORMAL STATE    │
                                                              │                     │  │                   │
                                                              │ • Red LED ON        │  │ • Green LED ON    │
                                                              │ • Green LED OFF     │  │ • Red LED OFF     │
                                                              │ • Buzzer BEEP       │  │ • Buzzer SILENT   │
                                                              │ • OLED: "ALERT!"   │  │ • OLED: "NORMAL"  │
                                                              │ • JSON alert=1      │  │ • JSON alert=0    │
                                                              │ • ESP32 → MQTT pub  │  │                   │
                                                              │ • ESP32 → DB store  │  │                   │
                                                              │ • Mobile notify     │  │                   │
                                                              └─────────────────────┘  └───────────────────┘
```

---

## 3. Fall Detection Algorithm Flowchart

```
                    ┌──────────────────────────┐
                    │     ADXL345 Read X,Y,Z   │ ← Every 200ms
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Compute Magnitude²       │
                    │  mag² = x²+y²+z²          │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  mag² < 300² (low-g)      │  ← Free-fall detection
                    │  (≈ < 90,000 LSB²)        │     threshold ~0.3g
                    └──────┬───────────────┬────┘
                          YES              NO
                           │               │
                    ┌──────▼──────┐        │
                    │ freeFall=   │        │
                    │    TRUE     │        │
                    │ Record time │        │
                    └──────┬──────┘        │
                           │               │
                    ┌──────▼──────────────────────────────────┐
                    │  freeFall == TRUE AND                   │
                    │  (now - freeFallTime) < 500ms?          │
                    └──────┬─────────────────────────────┬────┘
                          YES                             NO
                           │                              │
                    ┌──────▼────────────────┐     ┌──────▼──────┐
                    │  mag² > 1800² (high-g)│     │ Clear       │
                    │  (impact threshold)   │     │ freeFall    │
                    └──────┬────────────┬───┘     │ flag        │
                          YES           NO         └─────────────┘
                           │            │
                    ┌──────▼──────┐     │
                    │ FALL        │     │
                    │ DETECTED!   │     │
                    │             │     │
                    │ • Set flag  │     │
                    │ • Log time  │     │
                    │ • Alert     │     │
                    │ • Clear ff  │     │
                    └──────┬──────┘     │
                           └────────────┘
                                    │
                    ┌───────────────▼────────────────┐
                    │  Auto-clear fall after 10s     │
                    │  (fallClearTime + 10000 < now) │
                    └────────────────────────────────┘
```

---

## 4. ESP32 Wi-Fi Gateway Flowchart

```
                    ┌──────────────────────────┐
                    │       ESP32 START         │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Connect to Wi-Fi         │
                    │  (try up to 2 SSIDs)      │
                    └──────┬─────────────┬──────┘
                         OK            FAIL
                          │              │
                    ┌─────▼──────┐  ┌───▼──────────┐
                    │ Connect to │  │ Retry in 5s  │
                    │ MQTT Broker│  └──────────────┘
                    └──────┬─────┘
                           │
                    ┌──────▼──────┐
                    │ Start WS    │
                    │ Server :81  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Setup OTA   │
                    └──────┬──────┘
                           │
                    ╔══════▼══════╗
                    ║  MAIN LOOP  ║
                    ╚══════╦══════╝
                           ║
                    ┌──────▼──────┐
                    │ Wi-Fi still │
                    │ connected?  │
                    └──┬───────┬──┘
                      YES      NO
                       │        └──────► Reconnect
                       │
                    ┌──▼───────────┐
                    │ MQTT still   │
                    │ connected?   │
                    └──┬────────┬──┘
                      YES       NO
                       │         └──────► reconnectMQTT()
                       │
              ┌────────▼────────┐
              │ mqttClient.loop │  ← Maintain MQTT keep-alive
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ webSocket.loop  │  ← Handle WS events
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ ArduinoOTA.     │  ← Check for OTA
              │ handle()        │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ Read Serial2    │
              │ from Arduino    │
              └────────┬────────┘
                       │
              ┌────────▼─────────────────┐
              │  New complete JSON line? │
              └──────┬───────────────┬───┘
                    YES               NO
                     │                │
              ┌──────▼──────┐         │
              │ Parse JSON  │         │
              └──────┬──────┘         │
                     │                │
              ┌──────▼────────────┐   │
              │ MQTT Publish      │   │
              │ (smarthealth/     │   │
              │  vitals topic)    │   │
              └──────┬────────────┘   │
                     │                │
              ┌──────▼────────────┐   │
              │ WebSocket         │   │
              │ broadcastTXT()    │   │
              └──────┬────────────┘   │
                     │                │
              ┌──────▼────────────┐   │
              │ Is alert==1?      │   │
              └──┬────────────┬───┘   │
                YES            NO     │
                 │              │     │
         ┌───────▼─────┐        │     │
         │ MQTT Publish│        │     │
         │ alert topic │        │     │
         └───────┬─────┘        │     │
                 │               │     │
                 └───────────────┘     │
                         │             │
              ┌──────────▼────────────┘
              │  Firebase HTTP POST?
              │  (if FIREBASE_URL set)
              └──────────┬────────────
                         │
              ┌──────────▼────────────┐
              │  Heartbeat every 30s  │
              │  (device status pub)  │
              └──────────┬────────────┘
                         │
                         └──── (loop repeat)
```

---

## 5. Dashboard Web App Flowchart

```
Browser Load index.html
        │
        ▼
Load Chart.js + CSS
        │
        ▼
DOMContentLoaded
        │
        ├──► initCharts()      (HR sparkline, ECG mini, trend, history)
        ├──► startClock()      (header time display)
        ├──► startDemoSim()    (if CONFIG.demoMode == true)
        │    OR
        │    connectWebSocket() (if real hardware)
        │
        ▼
╔════════════════════════════════════════╗
║      EVERY 200ms (Demo Simulation)    ║
╚══════════════╦═════════════════════════╝
               ║
               ▼
       Random-walk vital signs
       Generate ECG PQRST sample
               │
               ▼
        processData(data)
               │
       ┌───────┴───────────────┐
       │                       │
       ▼                       ▼
updateVitalCards()       updateCharts()
• HR card + sparkline   • Push to history buffers
• SpO2 + gauge          • Update trend chart
• Temperature + thermo  • Shift old data off
• Pressure, Altitude
• Light ring
• Fall/Activity status
• ECG mini graph
       │
       ▼
  checkAlerts()
       │
  ┌────▼────────────────────────┐
  │  state.emergency == true?  │
  └──┬────────────────────────┬─┘
    YES                       NO
     │                        │
┌────▼──────────────────┐     │
│ addAlert(type,vals)   │     │
│ showAlertBanner()     │     │
│ showEmergencyOverlay()│     │
│ playAlertSound()      │     │
└────┬──────────────────┘     │
     └────────────────────────┘
                │
                ▼
           (continue loop)
```
