/*
 * ============================================================
 *  Smart IoT-Based Health Monitoring & Emergency Alert System
 *  ESP32 Wi-Fi Bridge Firmware
 * ============================================================
 *  Author  : Smart Health Monitor
 *  Board   : ESP32 Dev Module (30-pin or 38-pin)
 *  IDE     : Arduino IDE 2.x with ESP32 board package
 *
 *  Connections:
 *   ESP32 RX2 (GPIO16) ← Arduino Mega TX1 (pin 18)
 *   ESP32 TX2 (GPIO17) → Arduino Mega RX1 (pin 19)
 *   Common GND
 *   NOTE: Arduino Mega runs at 5V; use a 5V→3.3V level shifter
 *         on the TX line from Mega to ESP32 RX.
 *
 *  Required Libraries (Board Manager + Library Manager):
 *   - ESP32 Board Package by Espressif Systems
 *   - ArduinoJson (Benoit Blanchon) >= 6.21
 *   - PubSubClient (Nick O'Leary) >= 2.8  [MQTT]
 *   - WebSocketsServer by Links2004 >= 2.4 [WS]
 *   - ArduinoOTA (bundled with ESP32 core)
 *
 *  Features:
 *   ✔ Serial2 receive from Arduino Mega (JSON lines)
 *   ✔ Wi-Fi connection with reconnect logic
 *   ✔ MQTT publish to broker (HiveMQ public or local Mosquitto)
 *   ✔ HTTP POST to Firebase Realtime Database / REST API
 *   ✔ WebSocket server (port 81) for live dashboard
 *   ✔ OTA firmware update support
 *   ✔ Status LED on GPIO 2 (onboard LED)
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>

// ═══════════════════════════════════════════════════════════
//  USER CONFIGURATION  ← Edit these before flashing
// ═══════════════════════════════════════════════════════════
// Wi-Fi credentials (supports up to 3 networks)
const char* WIFI_SSID1 = "YOUR_WIFI_SSID";
const char* WIFI_PASS1 = "YOUR_WIFI_PASSWORD";
const char* WIFI_SSID2 = "BACKUP_SSID";      // optional
const char* WIFI_PASS2 = "BACKUP_PASSWORD";  // optional

// MQTT Broker (HiveMQ public broker – free, no auth)
const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT   = "SmartHealthMonitor_ESP32";
const char* MQTT_TOPIC_DATA  = "smarthealth/vitals";
const char* MQTT_TOPIC_ALERT = "smarthealth/alerts";

// Firebase Realtime Database REST endpoint
// Format: https://<project-id>-default-rtdb.firebaseio.com/health.json
// Leave empty to disable HTTP posting
const char* FIREBASE_URL = "";  // e.g., "https://myproject-default-rtdb.firebaseio.com/readings.json"
const char* FIREBASE_AUTH = ""; // Database secret or Bearer token

// OTA hostname and password
const char* OTA_HOSTNAME = "SmartHealth-ESP32";
const char* OTA_PASSWORD = "healthmonitor123";

// Serial2 baud rate (must match Arduino Mega Serial1)
#define SERIAL2_BAUD  115200

// Status LED (GPIO 2 = onboard LED on most ESP32 boards)
#define LED_STATUS    2

// ═══════════════════════════════════════════════════════════
//  OBJECTS
// ═══════════════════════════════════════════════════════════
WiFiMulti       wifiMulti;
WiFiClient      wifiClient;
PubSubClient    mqttClient(wifiClient);
WebSocketsServer webSocket(81);

// ═══════════════════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════════════════
String  serialBuffer  = "";
bool    newDataReady  = false;
String  latestPayload = "";

unsigned long lastMqttReconnect  = 0;
unsigned long lastHeartbeat      = 0;
unsigned long lastStatusBlink    = 0;
bool          ledState           = false;

// WebSocket connected clients bitmask
uint8_t wsClientsMask = 0;

// ═══════════════════════════════════════════════════════════
//  FORWARD DECLARATIONS
// ═══════════════════════════════════════════════════════════
void connectWiFi();
void connectMQTT();
void readSerial();
void publishMQTT(const String& payload);
void postHTTP(const String& payload);
void broadcastWebSocket(const String& payload);
void onWebSocketEvent(uint8_t num, WStype_t type,
                      uint8_t* payload, size_t length);
void setupOTA();
void blinkLED(int times, int ms);

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);          // USB debug
  Serial2.begin(SERIAL2_BAUD, SERIAL_8N1, 16, 17); // RX=GPIO16, TX=GPIO17

  pinMode(LED_STATUS, OUTPUT);
  blinkLED(3, 100);  // Startup signal

  Serial.println(F("\n=== Smart Health Monitor – ESP32 Wi-Fi Bridge v1.0 ==="));

  // Wi-Fi
  wifiMulti.addAP(WIFI_SSID1, WIFI_PASS1);
  if (strlen(WIFI_SSID2) > 0) wifiMulti.addAP(WIFI_SSID2, WIFI_PASS2);
  connectWiFi();

  // MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(1024);
  connectMQTT();

  // WebSocket server
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.printf("[WS] WebSocket server started on port 81\n");
  Serial.printf("[WS] Connect your dashboard to ws://%s:81\n",
                WiFi.localIP().toString().c_str());

  // OTA
  setupOTA();

  blinkLED(5, 80);
  Serial.println(F("[ESP32] Ready – waiting for Arduino data..."));
}

// ═══════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════
void loop() {
  // Maintain Wi-Fi
  if (wifiMulti.run() != WL_CONNECTED) {
    Serial.println(F("[WiFi] Reconnecting..."));
    delay(500);
    return;
  }

  // Maintain MQTT
  if (!mqttClient.connected()) {
    unsigned long now = millis();
    if (now - lastMqttReconnect >= 5000) {
      lastMqttReconnect = now;
      connectMQTT();
    }
  }
  mqttClient.loop();

  // Handle WebSocket
  webSocket.loop();

  // Handle OTA
  ArduinoOTA.handle();

  // Read from Arduino Mega
  readSerial();

  // Process new data
  if (newDataReady) {
    newDataReady = false;

    Serial.print(F("[DATA] "));
    Serial.println(latestPayload);

    // Publish to MQTT
    publishMQTT(latestPayload);

    // Broadcast to WebSocket clients
    broadcastWebSocket(latestPayload);

    // POST to Firebase (if configured)
    if (strlen(FIREBASE_URL) > 0) {
      postHTTP(latestPayload);
    }

    // Check for emergency alert in payload
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, latestPayload);
    if (!err && doc["alert"].as<int>() == 1) {
      String alertMsg = doc["msg"].as<String>();
      String alertPayload = "{\"type\":\"EMERGENCY\",\"msg\":\"" + alertMsg + "\"}";
      mqttClient.publish(MQTT_TOPIC_ALERT, alertPayload.c_str());
      Serial.printf("[ALERT] Emergency published: %s\n", alertMsg.c_str());
    }
  }

  // Heartbeat LED blink (1 Hz when connected)
  unsigned long now = millis();
  if (now - lastStatusBlink >= 1000) {
    lastStatusBlink = now;
    ledState = !ledState;
    digitalWrite(LED_STATUS, ledState);
  }

  // Heartbeat MQTT ping every 30 s
  if (now - lastHeartbeat >= 30000) {
    lastHeartbeat = now;
    String hb = "{\"device\":\"ESP32\",\"ip\":\"" +
                WiFi.localIP().toString() + "\",\"rssi\":" +
                String(WiFi.RSSI()) + "}";
    mqttClient.publish("smarthealth/device/status", hb.c_str());
  }
}

// ═══════════════════════════════════════════════════════════
//  Wi-Fi
// ═══════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.print(F("[WiFi] Connecting"));
  int attempts = 0;
  while (wifiMulti.run() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print('.');
    attempts++;
  }
  if (WiFi.isConnected()) {
    Serial.printf("\n[WiFi] Connected! IP: %s  RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    blinkLED(2, 150);
  } else {
    Serial.println(F("\n[WiFi] FAILED – will retry in loop"));
  }
}

// ═══════════════════════════════════════════════════════════
//  MQTT
// ═══════════════════════════════════════════════════════════
void connectMQTT() {
  Serial.printf("[MQTT] Connecting to %s ...\n", MQTT_BROKER);
  if (mqttClient.connect(MQTT_CLIENT)) {
    Serial.println(F("[MQTT] Connected!"));
    mqttClient.publish("smarthealth/device/status",
                       "{\"status\":\"online\",\"device\":\"ESP32\"}");
    mqttClient.subscribe("smarthealth/cmd/#");  // subscribe to commands
  } else {
    Serial.printf("[MQTT] Failed, rc=%d\n", mqttClient.state());
  }
}

// ═══════════════════════════════════════════════════════════
//  READ SERIAL FROM ARDUINO MEGA
// ═══════════════════════════════════════════════════════════
void readSerial() {
  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\n') {
      serialBuffer.trim();
      if (serialBuffer.length() > 10) {  // basic validity check
        latestPayload = serialBuffer;
        newDataReady  = true;
      }
      serialBuffer = "";
    } else {
      serialBuffer += c;
      if (serialBuffer.length() > 600) {  // overflow guard
        serialBuffer = "";
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  MQTT PUBLISH
// ═══════════════════════════════════════════════════════════
void publishMQTT(const String& payload) {
  if (!mqttClient.connected()) return;
  bool ok = mqttClient.publish(MQTT_TOPIC_DATA, payload.c_str(), false);
  if (!ok) {
    Serial.println(F("[MQTT] Publish failed (buffer overflow?)"));
  }
}

// ═══════════════════════════════════════════════════════════
//  HTTP POST TO FIREBASE
// ═══════════════════════════════════════════════════════════
void postHTTP(const String& payload) {
  HTTPClient http;
  String url = String(FIREBASE_URL);
  if (strlen(FIREBASE_AUTH) > 0) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  http.begin(wifiClient, url);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(payload);
  if (code > 0) {
    Serial.printf("[HTTP] POST %d\n", code);
  } else {
    Serial.printf("[HTTP] Error: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

// ═══════════════════════════════════════════════════════════
//  WEBSOCKET
// ═══════════════════════════════════════════════════════════
void broadcastWebSocket(const String& payload) {
  webSocket.broadcastTXT(payload);
}

void onWebSocketEvent(uint8_t num, WStype_t type,
                      uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u disconnected\n", num);
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Client #%u connected from %s\n",
                    num, webSocket.remoteIP(num).toString().c_str());
      // Send current data immediately
      if (latestPayload.length() > 0) {
        webSocket.sendTXT(num, latestPayload);
      }
      break;
    case WStype_TEXT:
      Serial.printf("[WS] Received from #%u: %s\n", num, payload);
      // Handle commands from dashboard (e.g., {"cmd":"reset_alerts"})
      break;
    default:
      break;
  }
}

// ═══════════════════════════════════════════════════════════
//  OTA UPDATE
// ═══════════════════════════════════════════════════════════
void setupOTA() {
  ArduinoOTA.setHostname(OTA_HOSTNAME);
  ArduinoOTA.setPassword(OTA_PASSWORD);

  ArduinoOTA.onStart([]() {
    Serial.println(F("[OTA] Starting update..."));
  });
  ArduinoOTA.onEnd([]() {
    Serial.println(F("\n[OTA] Complete!"));
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Error[%u]: ", error);
    if      (error == OTA_AUTH_ERROR)    Serial.println(F("Auth Failed"));
    else if (error == OTA_BEGIN_ERROR)   Serial.println(F("Begin Failed"));
    else if (error == OTA_CONNECT_ERROR) Serial.println(F("Connect Failed"));
    else if (error == OTA_RECEIVE_ERROR) Serial.println(F("Receive Failed"));
    else if (error == OTA_END_ERROR)     Serial.println(F("End Failed"));
  });

  ArduinoOTA.begin();
  Serial.printf("[OTA] Ready at hostname: %s\n", OTA_HOSTNAME);
}

// ═══════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════
void blinkLED(int times, int ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_STATUS, HIGH);
    delay(ms);
    digitalWrite(LED_STATUS, LOW);
    delay(ms);
  }
}

/* ─────────────────── END OF FILE ─────────────────── */
