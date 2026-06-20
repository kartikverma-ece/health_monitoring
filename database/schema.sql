-- ============================================================
--  Smart IoT-Based Health Monitoring & Emergency Alert System
--  Cloud Database Schema (PostgreSQL / MySQL compatible)
-- ============================================================
--  Supports: PostgreSQL 14+, MySQL 8+, SQLite 3.35+
--  For MySQL: replace SERIAL with INT AUTO_INCREMENT,
--             TIMESTAMPTZ with DATETIME, BOOLEAN with TINYINT(1)
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  TABLE: devices
--  One row per physical monitoring device
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id              SERIAL          PRIMARY KEY,
    device_id       VARCHAR(64)     NOT NULL UNIQUE,   -- e.g. "ESP32_AA:BB:CC:DD"
    device_name     VARCHAR(128)    NOT NULL DEFAULT 'Health Monitor',
    firmware_ver    VARCHAR(32),
    mqtt_client_id  VARCHAR(128),
    ip_address      VARCHAR(45),
    last_seen       TIMESTAMPTZ,
    is_online       BOOLEAN         NOT NULL DEFAULT FALSE,
    location        VARCHAR(255),
    notes           TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
--  TABLE: patients
--  User / patient profile linked to a device
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id              SERIAL          PRIMARY KEY,
    device_id       INT             REFERENCES devices(id) ON DELETE SET NULL,
    full_name       VARCHAR(255)    NOT NULL,
    date_of_birth   DATE,
    gender          VARCHAR(16),
    blood_group     VARCHAR(8),
    contact_phone   VARCHAR(20),
    emergency_phone VARCHAR(20),                       -- emergency contact
    doctor_name     VARCHAR(255),
    doctor_phone    VARCHAR(20),
    medical_notes   TEXT,
    profile_photo   TEXT,                              -- URL or base64
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
--  TABLE: vital_readings
--  Time-series vital sign data (1 row per reading, ~1 Hz)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vital_readings (
    id              BIGSERIAL       PRIMARY KEY,
    device_id       INT             NOT NULL REFERENCES devices(id),
    patient_id      INT             REFERENCES patients(id),
    recorded_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Heart Rate & SpO2 (MAX30100)
    heart_rate      DECIMAL(6,2),                      -- BPM
    spo2            DECIMAL(5,2),                      -- %

    -- Temperature (DHT22 / DS18B20)
    temperature     DECIMAL(5,2),                      -- °C
    humidity        DECIMAL(5,2),                      -- % RH

    -- Pressure & Altitude (BMP280)
    pressure        DECIMAL(8,2),                      -- hPa
    altitude        DECIMAL(8,2),                      -- metres

    -- Ambient Light (LDR)
    light_level     SMALLINT,                          -- 0–100 %

    -- ECG status
    ecg_leads_off   BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Movement
    accel_x         SMALLINT,                          -- raw ADXL345 LSB
    accel_y         SMALLINT,
    accel_z         SMALLINT,

    -- Derived flags
    fall_detected   BOOLEAN         NOT NULL DEFAULT FALSE,
    vibration       BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Overall alert flag
    alert_triggered BOOLEAN         NOT NULL DEFAULT FALSE,
    alert_message   VARCHAR(128)
);

-- Index for fast time-range queries
CREATE INDEX IF NOT EXISTS idx_vital_device_time
    ON vital_readings (device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_vital_patient_time
    ON vital_readings (patient_id, recorded_at DESC);

-- ────────────────────────────────────────────────────────────
--  TABLE: ecg_data
--  Raw ECG sample buffer (higher frequency – push in batches)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecg_data (
    id              BIGSERIAL       PRIMARY KEY,
    device_id       INT             NOT NULL REFERENCES devices(id),
    patient_id      INT             REFERENCES patients(id),
    session_id      BIGINT,                            -- groups a continuous recording
    sample_time     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    sample_index    INT             NOT NULL,          -- sequential within session
    ecg_value       SMALLINT        NOT NULL,          -- raw ADC 0–1023
    ecg_mv          DECIMAL(6,3)                       -- converted millivolts (optional)
);

CREATE INDEX IF NOT EXISTS idx_ecg_session
    ON ecg_data (session_id, sample_index);

-- ────────────────────────────────────────────────────────────
--  TABLE: fall_events
--  Dedicated table for fall detection events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fall_events (
    id              SERIAL          PRIMARY KEY,
    device_id       INT             NOT NULL REFERENCES devices(id),
    patient_id      INT             REFERENCES patients(id),
    detected_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    accel_peak_mg   INT,                               -- peak acceleration (mg)
    confirmed       BOOLEAN         NOT NULL DEFAULT FALSE,  -- manually confirmed
    response_time_s INT,                               -- seconds until response
    notes           TEXT
);

-- ────────────────────────────────────────────────────────────
--  TABLE: alerts
--  All emergency alert events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL          PRIMARY KEY,
    device_id       INT             NOT NULL REFERENCES devices(id),
    patient_id      INT             REFERENCES patients(id),
    triggered_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,

    -- Alert classification
    alert_type      VARCHAR(64)     NOT NULL,
    -- Values: HEART_RATE_HIGH | HEART_RATE_LOW | SPO2_LOW |
    --         TEMP_HIGH | FALL_DETECTED | ECG_LEADS_OFF |
    --         ABNORMAL_VIBRATION | DEVICE_OFFLINE

    severity        VARCHAR(16)     NOT NULL DEFAULT 'HIGH',
    -- Values: LOW | MEDIUM | HIGH | CRITICAL

    -- Snapshot of readings at time of alert
    hr_at_alert     DECIMAL(6,2),
    spo2_at_alert   DECIMAL(5,2),
    temp_at_alert   DECIMAL(5,2),
    alert_message   VARCHAR(255),

    -- Resolution
    is_resolved     BOOLEAN         NOT NULL DEFAULT FALSE,
    resolved_by     VARCHAR(128),
    resolution_note TEXT,

    -- Notification delivery
    notification_sent       BOOLEAN NOT NULL DEFAULT FALSE,
    notification_channel    VARCHAR(64),  -- 'mqtt' | 'push' | 'sms' | 'email'
    notification_sent_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_device_time
    ON alerts (device_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_unresolved
    ON alerts (is_resolved, triggered_at DESC)
    WHERE is_resolved = FALSE;

-- ────────────────────────────────────────────────────────────
--  TABLE: notification_log
--  Track every outgoing push/SMS/email notification
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_log (
    id              SERIAL          PRIMARY KEY,
    alert_id        INT             REFERENCES alerts(id),
    patient_id      INT             REFERENCES patients(id),
    sent_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    channel         VARCHAR(32)     NOT NULL,  -- 'push' | 'sms' | 'email'
    recipient       VARCHAR(255),
    message         TEXT,
    status          VARCHAR(32)     NOT NULL DEFAULT 'SENT',
    -- Values: SENT | DELIVERED | FAILED | ACKNOWLEDGED
    error_detail    TEXT
);

-- ────────────────────────────────────────────────────────────
--  TABLE: system_logs
--  Device diagnostics, firmware updates, connectivity events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_logs (
    id              BIGSERIAL       PRIMARY KEY,
    device_id       INT             NOT NULL REFERENCES devices(id),
    logged_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    log_level       VARCHAR(16)     NOT NULL DEFAULT 'INFO',
    -- Values: DEBUG | INFO | WARNING | ERROR | CRITICAL
    component       VARCHAR(64),   -- 'WIFI' | 'MQTT' | 'SENSOR' | 'OTA'
    message         TEXT            NOT NULL,
    extra_data      JSONB           -- flexible extra fields
);

-- ════════════════════════════════════════════════════════════
--  VIEWS
-- ════════════════════════════════════════════════════════════

-- Latest reading per device
CREATE OR REPLACE VIEW v_latest_vitals AS
SELECT DISTINCT ON (device_id)
    vr.*,
    p.full_name,
    p.blood_group,
    d.device_name,
    d.is_online
FROM vital_readings vr
LEFT JOIN patients  p ON p.id = vr.patient_id
LEFT JOIN devices   d ON d.id = vr.device_id
ORDER BY device_id, recorded_at DESC;

-- Active (unresolved) alerts with patient info
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT
    a.*,
    p.full_name,
    p.emergency_phone,
    d.device_name
FROM alerts       a
LEFT JOIN patients p ON p.id = a.patient_id
LEFT JOIN devices  d ON d.id = a.device_id
WHERE a.is_resolved = FALSE
ORDER BY a.triggered_at DESC;

-- Hourly average vitals per device (last 24 h)
CREATE OR REPLACE VIEW v_hourly_vitals AS
SELECT
    device_id,
    date_trunc('hour', recorded_at) AS hour,
    ROUND(AVG(heart_rate)::NUMERIC, 1)  AS avg_hr,
    ROUND(AVG(spo2)::NUMERIC, 1)        AS avg_spo2,
    ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temp,
    ROUND(AVG(pressure)::NUMERIC, 1)    AS avg_pressure,
    COUNT(*)                            AS sample_count
FROM vital_readings
WHERE recorded_at >= NOW() - INTERVAL '24 hours'
GROUP BY device_id, hour
ORDER BY device_id, hour DESC;

-- ════════════════════════════════════════════════════════════
--  SEED DATA  (demo device + patient)
-- ════════════════════════════════════════════════════════════
INSERT INTO devices (device_id, device_name, firmware_ver, is_online, location)
VALUES ('ESP32_DEMO_001', 'Ward-1 Monitor', 'v1.0.0', TRUE, 'ICU Ward 1')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO patients (device_id, full_name, date_of_birth, gender, blood_group,
                      contact_phone, emergency_phone, doctor_name)
SELECT d.id, 'Demo Patient', '1980-06-15', 'Male', 'O+',
       '+91-9876543210', '+91-9876543211', 'Dr. Smith'
FROM devices d WHERE d.device_id = 'ESP32_DEMO_001'
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════
--  USEFUL QUERIES (reference)
-- ════════════════════════════════════════════════════════════
/*
-- Last 60 vital readings for a device:
SELECT recorded_at, heart_rate, spo2, temperature, pressure, altitude
FROM vital_readings
WHERE device_id = 1
ORDER BY recorded_at DESC
LIMIT 60;

-- All unresolved alerts today:
SELECT * FROM v_active_alerts
WHERE triggered_at >= CURRENT_DATE;

-- Fall events in last 7 days:
SELECT fe.*, p.full_name
FROM fall_events fe JOIN patients p ON p.id = fe.patient_id
WHERE fe.detected_at >= NOW() - INTERVAL '7 days';

-- ECG session data:
SELECT sample_index, ecg_value, sample_time
FROM ecg_data
WHERE session_id = 12345
ORDER BY sample_index;
*/
