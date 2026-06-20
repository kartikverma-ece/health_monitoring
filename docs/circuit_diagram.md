# Circuit Diagram & Pin Connections

## Smart IoT-Based Health Monitoring & Emergency Alert System

---

## 1. OLED Display (SSD1306 0.96") → Arduino Mega

| OLED Pin | Arduino Mega Pin | Notes              |
|----------|------------------|--------------------|
| VCC      | 3.3V             | Use 3.3V supply    |
| GND      | GND              |                    |
| SDA      | Pin 20 (SDA)     | I2C Data           |
| SCL      | Pin 21 (SCL)     | I2C Clock          |

- **I2C Address:** 0x3C
- Place 10kΩ pull-up resistors on SDA and SCL lines to 3.3V

---

## 2. MAX30100 Heart Rate & SpO2 Sensor → Arduino Mega

| MAX30100 Pin | Arduino Mega Pin | Notes                       |
|--------------|------------------|-----------------------------|
| VIN          | 3.3V             | Do NOT connect to 5V!       |
| GND          | GND              |                             |
| SDA          | Pin 20 (SDA)     | Shared I2C bus              |
| SCL          | Pin 21 (SCL)     | Shared I2C bus              |
| INT          | Pin 22           | Interrupt (optional)        |

- **I2C Address:** 0x57
- Use 4.7kΩ pull-up resistors if not already on breakout board

---

## 3. BMP280 Atmospheric Pressure Sensor → Arduino Mega

| BMP280 Pin | Arduino Mega Pin | Notes                     |
|------------|------------------|---------------------------|
| VCC        | 3.3V             |                           |
| GND        | GND              |                           |
| SDA        | Pin 20 (SDA)     | Shared I2C bus            |
| SCL        | Pin 21 (SCL)     | Shared I2C bus            |
| CSB        | Not connected    | Leave floating for I2C    |
| SDO        | GND              | Sets I2C addr to 0x76     |

- **I2C Address:** 0x76 (SDO to GND) or 0x77 (SDO to VCC)

---

## 4. ADXL345 Accelerometer → Arduino Mega

| ADXL345 Pin | Arduino Mega Pin | Notes                    |
|-------------|------------------|--------------------------|
| VCC         | 3.3V             |                          |
| GND         | GND              |                          |
| SDA         | Pin 20 (SDA)     | Shared I2C bus           |
| SCL         | Pin 21 (SCL)     | Shared I2C bus           |
| CS          | 3.3V             | Pull HIGH for I2C mode   |
| SDO/ALT     | GND              | Sets I2C addr to 0x53    |
| INT1        | Pin 23           | Interrupt (optional)     |

- **I2C Address:** 0x53 (SDO/ALT to GND) or 0x1D (SDO/ALT to VCC)

---

## 5. AD8232 ECG Sensor → Arduino Mega

| AD8232 Pin | Arduino Mega Pin | Notes                              |
|------------|------------------|------------------------------------|
| VCC        | 3.3V             | 3.3V operation                     |
| GND        | GND              |                                    |
| OUTPUT     | A0               | Analog ECG signal (0–3.3V range)   |
| LO+        | Pin 10           | Leads-off detection positive       |
| LO-        | Pin 11           | Leads-off detection negative       |
| SDN        | Pin 12           | Shutdown pin (LOW = active)        |

**ECG Electrode Placement:**
- RA (Right Arm electrode) → AD8232 RA pin
- LA (Left Arm electrode)  → AD8232 LA pin
- RL (Right Leg electrode) → AD8232 RL pin (driven reference)

---

## 6. DHT22 Temperature & Humidity Sensor → Arduino Mega

```
DHT22
 ─────────────────────
|  VCC  DATA  NC  GND |
 ─────────────────────
    │     │         │
   5V   Pin 2     GND
         │
       10kΩ pull-up to 5V
```

| DHT22 Pin | Arduino Mega Pin | Notes                       |
|-----------|------------------|-----------------------------|
| VCC (1)   | 5V               |                             |
| DATA (2)  | Pin 2            | 10kΩ pull-up to 5V required |
| NC (3)    | Not connected    |                             |
| GND (4)   | GND              |                             |

---

## 7. Vibration Sensor → Arduino Mega

| Vibration Sensor Pin | Arduino Mega Pin | Notes          |
|----------------------|------------------|----------------|
| VCC                  | 5V               |                |
| GND                  | GND              |                |
| DOUT (Digital)       | Pin 3            | Digital output |

---

## 8. LDR Light Sensor → Arduino Mega

```
       5V
        │
      [LDR]
        │────── A1 (Analog)
      [10kΩ]
        │
       GND
```

| Component      | Connection       | Notes                   |
|----------------|------------------|-------------------------|
| LDR top pin    | 5V               |                         |
| LDR bottom pin | A1 + 10kΩ to GND | Voltage divider midpoint|

---

## 9. Green LED → Arduino Mega

| LED Pin | Arduino Mega Pin | Notes                       |
|---------|------------------|-----------------------------|
| Anode(+)| Pin 4            | Via 220Ω current limit resistor |
| Cathode(-)| GND            |                             |

**Circuit:** Pin 4 → 220Ω → LED(+) → LED(-) → GND

---

## 10. Red LED → Arduino Mega

| LED Pin | Arduino Mega Pin | Notes                       |
|---------|------------------|-----------------------------|
| Anode(+)| Pin 5            | Via 220Ω current limit resistor |
| Cathode(-)| GND            |                             |

---

## 11. Buzzer → Arduino Mega

| Buzzer Pin | Arduino Mega Pin | Notes                   |
|------------|------------------|-------------------------|
| (+)        | Pin 6            | PWM capable pin         |
| (-)        | GND              |                         |

> Use an active buzzer (has internal oscillator). For passive buzzers, `tone()` function generates the frequency.

---

## 12. ESP32 ↔ Arduino Mega (UART Serial Bridge)

```
Arduino Mega          ESP32 Dev Module
────────────          ────────────────
TX1 (Pin 18) ──────→ RX2 (GPIO 16)
RX1 (Pin 19) ←────── TX2 (GPIO 17)
GND          ──────── GND
                ↑
    !! IMPORTANT: Level Shifter Required !!
    Arduino Mega = 5V logic
    ESP32        = 3.3V logic
    Use 5V→3.3V level shifter on TX1→RX2 line
    (Example: TXS0108E 8-channel level shifter)
```

---

## 13. Power Supply

| Component      | Voltage | Current (max) |
|----------------|---------|---------------|
| Arduino Mega   | 5V      | 500 mA        |
| ESP32          | 3.3V    | 600 mA        |
| MAX30100       | 3.3V    | 50 mA         |
| BMP280         | 3.3V    | 5 mA          |
| ADXL345        | 3.3V    | 23 mA         |
| AD8232         | 3.3V    | 170 µA        |
| DHT22          | 5V      | 2.5 mA        |
| OLED Display   | 3.3V    | 20 mA         |
| Total Estimate |         | ~1.3 A        |

**Recommended:** 5V 2A USB power adapter + 3.3V LDO regulator (AMS1117-3.3) for 3.3V rail.

---

## 14. I2C Bus Summary

All I2C devices share the same SDA (Pin 20) and SCL (Pin 21) lines on the Arduino Mega:

| Device   | I2C Address |
|----------|-------------|
| OLED     | 0x3C        |
| MAX30100 | 0x57        |
| BMP280   | 0x76        |
| ADXL345  | 0x53        |

> Ensure pull-up resistors (4.7kΩ) are present on the I2C bus. Most breakout boards already include them.

---

## 15. Complete Arduino Mega Pin Summary

| Pin     | Connected To      | Mode    |
|---------|-------------------|---------|
| 20(SDA) | I2C Bus (all)     | I2C     |
| 21(SCL) | I2C Bus (all)     | I2C     |
| A0      | AD8232 OUTPUT     | Analog  |
| A1      | LDR Voltage Div.  | Analog  |
| 2       | DHT22 DATA        | Digital |
| 3       | Vibration DOUT    | Digital |
| 4       | Green LED         | Output  |
| 5       | Red LED           | Output  |
| 6       | Buzzer            | PWM Out |
| 10      | AD8232 LO+        | Input   |
| 11      | AD8232 LO-        | Input   |
| 12      | AD8232 SDN        | Output  |
| 18(TX1) | ESP32 RX2         | UART TX |
| 19(RX1) | ESP32 TX2         | UART RX |
| 22      | MAX30100 INT      | Input   |
| 23      | ADXL345 INT1      | Input   |
