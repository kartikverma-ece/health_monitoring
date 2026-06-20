/*
 * ============================================================
 *  Smart IoT-Based Health Monitoring & Emergency Alert System
 *  Arduino Mega 2560 – Main Firmware
 * ============================================================
 *  Author  : Smart Health Monitor
 *  Board   : Arduino Mega 2560
 *  IDE     : Arduino IDE 2.x
 *
 *  Hardware Connections (see docs/circuit_diagram.md):
 *   MAX30100  → I2C  (SDA=20, SCL=21)
 *   AD8232    → A0 (LO+→D10, LO-→D11, SDN→D12)
 *   DHT22     → D2
 *   BMP280    → I2C  (SDA=20, SCL=21)  addr 0x76
 *   ADXL345   → I2C  (SDA=20, SCL=21)  addr 0x53
 *   Vibration → D3
 *   LDR       → A1 (voltage divider with 10kΩ)
 *   OLED      → I2C  (SDA=20, SCL=21)  addr 0x3C
 *   Green LED → D4
 *   Red LED   → D5
 *   Buzzer    → D6
 *   ESP32 TX  → RX1 (D19)   Serial1
 *   ESP32 RX  → TX1 (D18)   Serial1
 * ============================================================
 *
 *  Required Libraries (install via Library Manager):
 *   - MAX30100lib by OXullo Intersecans
 *   - DHT sensor library by Adafruit
 *   - Adafruit BMP280 Library
 *   - SparkFun ADXL345 by SparkFun Electronics
 *   - Adafruit SSD1306
 *   - Adafruit GFX Library
 *   - ArduinoJson by Benoit Blanchon
 * ============================================================
 */

#include <Wire.h>
#include <Arduino.h>

// ── Sensor Libraries ──────────────────────────────────────
#include "MAX30100_PulseOximeter.h"
#include "DHT.h"
#include <Adafruit_BMP280.h>
#include <SparkFun_ADXL345.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_GFX.h>
#include <ArduinoJson.h>

// ═══════════════════════════════════════════════════════════
//  PIN DEFINITIONS
// ═══════════════════════════════════════════════════════════
#define PIN_ECG_OUT       A0   // AD8232 ECG analog output
#define PIN_ECG_LO_PLUS   10   // Leads-off detection +
#define PIN_ECG_LO_MINUS  11   // Leads-off detection -
#define PIN_ECG_SDN       12   // AD8232 shutdown (LOW = active)

#define PIN_DHT22         2    // DHT22 data
#define PIN_VIBRATION     3    // Vibration sensor (digital)
#define PIN_LDR           A1   // LDR voltage divider output

#define PIN_GREEN_LED     4
#define PIN_RED_LED       5
#define PIN_BUZZER        6

// OLED display size
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define OLED_RESET        -1

// ═══════════════════════════════════════════════════════════
//  THRESHOLDS / CONFIGURATION
// ═══════════════════════════════════════════════════════════
// Heart Rate
#define HR_HIGH_THRESHOLD       120   // BPM
#define HR_LOW_THRESHOLD        50    // BPM
// SpO2
#define SPO2_LOW_THRESHOLD      92    // %
// Temperature (°C)
#define TEMP_HIGH_THRESHOLD     38.0
// Fall detection – ADXL345 resultant acceleration delta (mg)
#define FALL_ACCEL_THRESHOLD    1800  // mg (free-fall + impact)
// Vibration
#define VIBRATION_COUNT_LIMIT   5     // counts per sampling window
// ECG leads-off
#define ECG_LEADS_OFF_ALERT     true

// Sampling intervals (ms)
#define INTERVAL_SENSOR_READ    200   // 5 Hz main loop
#define INTERVAL_OLED_UPDATE    500   // 2 Hz display refresh
#define INTERVAL_JSON_SEND      1000  // 1 Hz to ESP32
#define INTERVAL_BMP280_READ    2000  // 0.5 Hz (slow sensor)

// Buzzer alert pattern
#define BUZZER_ALERT_FREQ       2500  // Hz
#define BUZZER_ALERT_DURATION   300   // ms

// ═══════════════════════════════════════════════════════════
//  OBJECTS
// ═══════════════════════════════════════════════════════════
PulseOximeter           pulseOx;
DHT                     dht(PIN_DHT22, DHT22);
Adafruit_BMP280         bmp;
ADXL345                 adxl;
Adafruit_SSD1306        display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ═══════════════════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════════════════
struct HealthData {
  float   heartRate    = 0.0;
  float   spo2         = 0.0;
  float   temperature  = 0.0;
  float   humidity     = 0.0;
  float   pressure     = 0.0;
  float   altitude     = 0.0;
  int     ecgRaw       = 0;
  int     lightLevel   = 0;
  bool    ecgLeadsOff  = false;
  bool    fallDetected = false;
  bool    vibration    = false;
  bool    emergency    = false;
  String  alertMsg     = "";
  unsigned long timestamp = 0;
};

HealthData data;

// Fall detection variables
struct AccelHistory {
  int x[3], y[3], z[3];
  int idx = 0;
};
AccelHistory accelHist;

// Vibration counter
int  vibrationCount  = 0;
unsigned long vibrationWindowStart = 0;

// Timing
unsigned long lastSensorRead  = 0;
unsigned long lastOledUpdate  = 0;
unsigned long lastJsonSend    = 0;
unsigned long lastBmpRead     = 0;
unsigned long fallClearTime   = 0;   // auto-clear fall after 10s

// OLED page rotation
uint8_t oledPage = 0;
unsigned long lastPageFlip    = 0;

// ═══════════════════════════════════════════════════════════
//  FORWARD DECLARATIONS
// ═══════════════════════════════════════════════════════════
void readMAX30100();
void readECG();
void readDHT22();
void readBMP280();
void readADXL345();
void readVibration();
void readLDR();
void evaluateAlerts();
void updateOLED();
void updateLEDsBuzzer();
void sendJSON();
void onBeatDetected();
void displayPageVitals();
void displayPageEnvironment();
void displayPageStatus();

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);    // Debug
  Serial1.begin(115200);   // ESP32 communication

  Serial.println(F("=== Smart Health Monitor v1.0 ==="));
  Serial.println(F("Initializing subsystems..."));

  // ── GPIO ──────────────────────────────────────────────
  pinMode(PIN_GREEN_LED,    OUTPUT);
  pinMode(PIN_RED_LED,      OUTPUT);
  pinMode(PIN_BUZZER,       OUTPUT);
  pinMode(PIN_VIBRATION,    INPUT);
  pinMode(PIN_ECG_LO_PLUS,  INPUT);
  pinMode(PIN_ECG_LO_MINUS, INPUT);
  pinMode(PIN_ECG_SDN,      OUTPUT);
  digitalWrite(PIN_ECG_SDN, LOW);  // Enable AD8232

  // Startup LED test
  digitalWrite(PIN_GREEN_LED, HIGH);
  digitalWrite(PIN_RED_LED,   HIGH);
  tone(PIN_BUZZER, 1000, 200);
  delay(500);
  digitalWrite(PIN_GREEN_LED, LOW);
  digitalWrite(PIN_RED_LED,   LOW);

  // ── OLED ─────────────────────────────────────────────
  Wire.begin();
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("ERROR: OLED SSD1306 not found!"));
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println(F("Smart Health Monitor"));
    display.println(F("  Initializing..."));
    display.display();
    Serial.println(F("OLED OK"));
  }

  // ── MAX30100 ──────────────────────────────────────────
  if (!pulseOx.begin()) {
    Serial.println(F("ERROR: MAX30100 not found!"));
  } else {
    pulseOx.setOnBeatDetectedCallback(onBeatDetected);
    Serial.println(F("MAX30100 OK"));
  }

  // ── DHT22 ─────────────────────────────────────────────
  dht.begin();
  Serial.println(F("DHT22 OK"));

  // ── BMP280 ────────────────────────────────────────────
  if (!bmp.begin(0x76)) {
    Serial.println(F("ERROR: BMP280 not found!"));
  } else {
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                    Adafruit_BMP280::SAMPLING_X2,
                    Adafruit_BMP280::SAMPLING_X16,
                    Adafruit_BMP280::FILTER_X16,
                    Adafruit_BMP280::STANDBY_MS_500);
    Serial.println(F("BMP280 OK"));
  }

  // ── ADXL345 ───────────────────────────────────────────
  adxl.begin();
  adxl.setRangeSetting(16);     // ±16g for fall detection
  adxl.setSpiBit(0);            // I2C mode
  adxl.setActivityXYZ(1, 0, 0);
  adxl.setActivityThreshold(75);
  adxl.setInactivityThreshold(75);
  adxl.setTimeInactivity(10);
  adxl.setActivityAc(1);
  Serial.println(F("ADXL345 OK"));

  vibrationWindowStart = millis();

  Serial.println(F("All sensors initialized. Starting monitoring loop."));
  delay(2000);

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println(F("  System Ready!"));
  display.display();
  delay(1000);
}

// ═══════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();
  data.timestamp = now;

  // MAX30100 must be called every loop iteration
  pulseOx.update();

  // ── Sensor reads at 5 Hz ──────────────────────────────
  if (now - lastSensorRead >= INTERVAL_SENSOR_READ) {
    lastSensorRead = now;
    readMAX30100();
    readECG();
    readADXL345();
    readVibration();
    readLDR();
  }

  // ── Slow sensors (DHT22, BMP280) ─────────────────────
  if (now - lastBmpRead >= INTERVAL_BMP280_READ) {
    lastBmpRead = now;
    readDHT22();
    readBMP280();
  }

  // ── Auto-clear fall after 10 s ─────────────────────
  if (data.fallDetected && (now - fallClearTime >= 10000)) {
    data.fallDetected = false;
  }

  // ── Evaluate alert conditions ─────────────────────────
  evaluateAlerts();
  updateLEDsBuzzer();

  // ── OLED update at 2 Hz ───────────────────────────────
  if (now - lastOledUpdate >= INTERVAL_OLED_UPDATE) {
    lastOledUpdate = now;
    updateOLED();
  }

  // ── Send JSON to ESP32 at 1 Hz ────────────────────────
  if (now - lastJsonSend >= INTERVAL_JSON_SEND) {
    lastJsonSend = now;
    sendJSON();
  }
}

// ═══════════════════════════════════════════════════════════
//  SENSOR READERS
// ═══════════════════════════════════════════════════════════

// MAX30100: Heart Rate + SpO2
void readMAX30100() {
  float hr   = pulseOx.getHeartRate();
  float spo2 = pulseOx.getSpO2();
  if (hr > 20 && hr < 250)  data.heartRate = hr;
  if (spo2 > 50 && spo2 <= 100) data.spo2 = spo2;
}

// Beat callback from MAX30100
void onBeatDetected() {
  // Flash green LED briefly on each beat (non-blocking)
  digitalWrite(PIN_GREEN_LED, HIGH);
}

// AD8232 ECG
void readECG() {
  // Check leads-off detection pins
  if (digitalRead(PIN_ECG_LO_PLUS) == 1 ||
      digitalRead(PIN_ECG_LO_MINUS) == 1) {
    data.ecgLeadsOff = true;
    data.ecgRaw = 0;
  } else {
    data.ecgLeadsOff = false;
    data.ecgRaw = analogRead(PIN_ECG_OUT);
  }
}

// DHT22 Temperature & Humidity
void readDHT22() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) data.temperature = t;
  if (!isnan(h)) data.humidity    = h;
}

// BMP280 Pressure & Altitude
void readBMP280() {
  data.pressure = bmp.readPressure() / 100.0F;  // hPa
  data.altitude = bmp.readAltitude(1013.25F);   // m (standard sea level)
}

// ADXL345 Fall Detection
void readADXL345() {
  int x, y, z;
  adxl.readAccel(&x, &y, &z);

  // Store history (ring buffer, 3 samples)
  int idx = accelHist.idx % 3;
  accelHist.x[idx] = x;
  accelHist.y[idx] = y;
  accelHist.z[idx] = z;
  accelHist.idx++;

  // Resultant magnitude squared (avoid sqrt for speed)
  long magSq = (long)x*x + (long)y*y + (long)z*z;

  // Free-fall: total accel ≈ 0 → magSq very small
  // Impact:    total accel spike → magSq very large
  static bool freeFallDetected = false;
  static unsigned long freeFallTime = 0;

  // Free-fall threshold: ~250 mg → 256 LSB at ±16g (≈ 16 mg/LSB)
  if (magSq < 300L * 300L) {
    freeFallDetected = true;
    freeFallTime = millis();
  }

  // Impact after free-fall within 500 ms window
  if (freeFallDetected && (millis() - freeFallTime < 500)) {
    if (magSq > (long)FALL_ACCEL_THRESHOLD * FALL_ACCEL_THRESHOLD) {
      data.fallDetected = true;
      fallClearTime = millis();
      freeFallDetected = false;
      Serial.println(F(">>> FALL DETECTED <<<"));
    }
  } else {
    freeFallDetected = false;
  }
}

// Vibration Sensor
void readVibration() {
  bool vib = digitalRead(PIN_VIBRATION);
  unsigned long now = millis();

  if (vib) vibrationCount++;

  // Reset window every 2 seconds
  if (now - vibrationWindowStart >= 2000) {
    data.vibration = (vibrationCount >= VIBRATION_COUNT_LIMIT);
    vibrationCount = 0;
    vibrationWindowStart = now;
  }
}

// LDR Light Sensor
void readLDR() {
  int raw = analogRead(PIN_LDR);            // 0–1023
  data.lightLevel = map(raw, 0, 1023, 0, 100); // 0–100 %
}

// ═══════════════════════════════════════════════════════════
//  ALERT EVALUATION
// ═══════════════════════════════════════════════════════════
void evaluateAlerts() {
  data.emergency = false;
  data.alertMsg  = "";

  if (data.heartRate > 0) {
    if (data.heartRate > HR_HIGH_THRESHOLD) {
      data.emergency = true;
      data.alertMsg  = "HIGH HEART RATE";
    } else if (data.heartRate < HR_LOW_THRESHOLD) {
      data.emergency = true;
      data.alertMsg  = "LOW HEART RATE";
    }
  }

  if (data.spo2 > 0 && data.spo2 < SPO2_LOW_THRESHOLD) {
    data.emergency = true;
    data.alertMsg  = "LOW SpO2";
  }

  if (data.temperature > TEMP_HIGH_THRESHOLD) {
    data.emergency = true;
    data.alertMsg  = "HIGH TEMPERATURE";
  }

  if (data.fallDetected) {
    data.emergency = true;
    data.alertMsg  = "FALL DETECTED";
  }

  if (data.ecgLeadsOff && ECG_LEADS_OFF_ALERT) {
    data.emergency = true;
    data.alertMsg  = "ECG LEADS OFF";
  }

  if (data.vibration) {
    data.emergency = true;
    data.alertMsg  = "ABNORMAL VIBRATION";
  }
}

// ═══════════════════════════════════════════════════════════
//  LED + BUZZER
// ═══════════════════════════════════════════════════════════
void updateLEDsBuzzer() {
  static unsigned long lastBuzzer = 0;
  static bool buzzerState = false;

  if (data.emergency) {
    digitalWrite(PIN_RED_LED,   HIGH);
    digitalWrite(PIN_GREEN_LED, LOW);
    // Beep buzzer pattern: ON 300ms / OFF 200ms
    unsigned long now = millis();
    if (!buzzerState && now - lastBuzzer >= 500) {
      tone(PIN_BUZZER, BUZZER_ALERT_FREQ, BUZZER_ALERT_DURATION);
      buzzerState = true;
      lastBuzzer  = now;
    } else if (buzzerState && now - lastBuzzer >= BUZZER_ALERT_DURATION + 50) {
      buzzerState = false;
    }
  } else {
    digitalWrite(PIN_RED_LED,   LOW);
    digitalWrite(PIN_GREEN_LED, HIGH);
    noTone(PIN_BUZZER);
  }
}

// ═══════════════════════════════════════════════════════════
//  OLED DISPLAY (3 rotating pages)
// ═══════════════════════════════════════════════════════════
void updateOLED() {
  unsigned long now = millis();

  // Rotate page every 3 seconds
  if (now - lastPageFlip >= 3000) {
    oledPage = (oledPage + 1) % 3;
    lastPageFlip = now;
  }

  display.clearDisplay();

  switch (oledPage) {
    case 0: displayPageVitals();      break;
    case 1: displayPageEnvironment(); break;
    case 2: displayPageStatus();      break;
  }

  display.display();
}

void displayPageVitals() {
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("=== VITAL SIGNS ==="));

  display.print(F("HR:  "));
  display.print((int)data.heartRate);
  display.println(F(" BPM"));

  display.print(F("SpO2:"));
  display.print((int)data.spo2);
  display.println(F(" %"));

  display.print(F("Temp:"));
  display.print(data.temperature, 1);
  display.println(F(" C"));

  display.print(F("ECG: "));
  display.println(data.ecgLeadsOff ? F("LEADS OFF") : F("Connected"));

  display.print(F("Fall:"));
  display.println(data.fallDetected ? F("DETECTED!") : F("No"));
}

void displayPageEnvironment() {
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("=== ENVIRONMENT ==="));

  display.print(F("Pres:"));
  display.print((int)data.pressure);
  display.println(F(" hPa"));

  display.print(F("Alt: "));
  display.print((int)data.altitude);
  display.println(F(" m"));

  display.print(F("Hum: "));
  display.print((int)data.humidity);
  display.println(F(" %"));

  display.print(F("Lght:"));
  display.print(data.lightLevel);
  display.println(F(" %"));
}

void displayPageStatus() {
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("=== SYS STATUS ==="));

  if (data.emergency) {
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.println(F("ALERT!"));
    display.setTextSize(1);
    display.println(data.alertMsg);
  } else {
    display.setTextSize(2);
    display.println(F("NORMAL"));
    display.setTextSize(1);
    display.println(F("All vitals OK"));
    display.print(F("Uptime: "));
    display.print(millis() / 1000);
    display.println(F("s"));
  }
}

// ═══════════════════════════════════════════════════════════
//  JSON SERIAL OUTPUT TO ESP32
// ═══════════════════════════════════════════════════════════
void sendJSON() {
  StaticJsonDocument<512> doc;

  doc["ts"]    = data.timestamp;
  doc["hr"]    = data.heartRate;
  doc["spo2"]  = data.spo2;
  doc["temp"]  = data.temperature;
  doc["hum"]   = data.humidity;
  doc["pres"]  = data.pressure;
  doc["alt"]   = data.altitude;
  doc["ecg"]   = data.ecgRaw;
  doc["lgt"]   = data.lightLevel;
  doc["fall"]  = data.fallDetected ? 1 : 0;
  doc["vib"]   = data.vibration    ? 1 : 0;
  doc["ecgOff"]= data.ecgLeadsOff  ? 1 : 0;
  doc["alert"] = data.emergency    ? 1 : 0;
  doc["msg"]   = data.alertMsg;

  serializeJson(doc, Serial1);
  Serial1.println();  // newline delimiter

  // Also echo to USB serial for debugging
  serializeJson(doc, Serial);
  Serial.println();
}
/* ─────────────────── END OF FILE ─────────────────── */
