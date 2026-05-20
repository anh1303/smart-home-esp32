// ── THƯ VIỆN ─────────────────────────────────────────────────────────
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <Keypad.h>
#include <DHT.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WebSocketsClient.h>  // [V4.0] WebSocket client
#include <ArduinoJson.h>       // [V4.0] parse lệnh JSON từ server
#include <Preferences.h>

// ── CHẾ ĐỘ HOẠT ĐỘNG ─────────────────────────────────────────────────
// Doi dong NETWORK_MODE ben duoi de chon che do:
//   MODE_ONLINE_WS    : ket noi WiFi/WebSocket va van chay logic tu dong.
//   MODE_OFFLINE_AUTO : tat WiFi/WebSocket, chi chay logic cuc bo.
enum AppNetworkMode {
    MODE_ONLINE_WS,    // Ket noi WiFi/WebSocket de giao tiep server
    MODE_OFFLINE_AUTO  // Khong ket noi mang, chi chay logic tu dong cuc bo
};

static const AppNetworkMode NETWORK_MODE = MODE_ONLINE_WS;

bool networkEnabled() {
    return NETWORK_MODE == MODE_ONLINE_WS;
}

// ── CẤU HÌNH MẠNG ────────────────────────────────────────────────────
const char *WIFI_SSID      = "Quepa4";
const char *WIFI_PASSWORD  = "999999999";
const char *SERVER_HOST    = "10.218.174.92"; // IP LAN cua may chay Node.js server
const int   SERVER_WS_PORT = 3000;            // Khop PORT trong smartHome_web/.env

// ── PINOUT ────────────────────────────────────────────────────────────
#define I2C_SDA        21
#define I2C_SCL        22
#define SS_PIN          5
#define RST_PIN        -1
#define SERVO_DOOR     17
#define FAN_IN1        13
#define FAN_IN2         1
#define FAN_ENA         3
#define FAN_PWM_CHAN    7
#define FAN_PWM_FREQ   1000
#define FAN_PWM_BITS   8
#define LED_PWM_CHAN    6
#define LED_PWM_FREQ   5000
#define LED_PWM_BITS   8
#define SERVO_GARA     15
#define DHTPIN         27
#define PIR1_PIN       34
#define PIR2_PIN       35
#define ECHO_PIN       39
#define TRIG_PIN        4
#define LED_PIR         2

#define DOOR_CLOSE_ANGLE 90
#define DOOR_OPEN_ANGLE  0
#define GARA_OPEN_ANGLE   0
#define GARA_CLOSE_ANGLE 90

#define PIR_LIGHT_AVAILABLE (LED_PIR != FAN_ENA)

// ── KEYPAD ───────────────────────────────────────────────────────────
const byte ROWS = 4, COLS = 3;
char keys[ROWS][COLS] = {
    {'1','2','3'}, {'4','5','6'}, {'7','8','9'}, {'*','0','#'}
};
byte rowPins[ROWS] = {26, 32, 33, 25};
byte colPins[COLS] = {12, 16, 14};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ── ĐỐI TƯỢNG ────────────────────────────────────────────────────────
LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522           rfid(SS_PIN, RST_PIN);
DHT               dht(DHTPIN, DHT11);
Servo             sDoor, sGara;
WebSocketsClient  wsClient; 
Preferences       prefs;

// ── HẰNG SỐ ──────────────────────────────────────────────────────────
static const unsigned long KEYPAD_TIMEOUT    = 8000;
static const unsigned long WIFI_CHECK_INTV   = 10000;
static const unsigned long DHT_INTERVAL      = 2000;
static const unsigned long SONAR_INTERVAL    = 100;
static const unsigned long STATUS_INTERVAL   = 20000;
static const unsigned long STATUS_DIRTY_MIN_INTERVAL = 1500;
static const unsigned long COMMAND_COOLDOWN  = 800;
static const unsigned long GARA_CLOSE_DELAY  = 5000;
static const int           MAX_FAILS         = 3;
static const int           MAX_INPUT_LEN     = 16;
static const int           MIN_PASS_LEN      = 4;
static float               fanTempOnThresh   = 35.0f;
static float               fanHumOnThresh    = 40.0f;
static float               fanTempHyst       = 2.0f;
static float               fanHumHyst        = 5.0f;
static const int           FAN_PWM_MIN       = 100;
static const int           FAN_PWM_MAX       = 255;
static const float         FAN_TEMP_SCALE    = 10.0f;
static const float         FAN_HUM_SCALE     = 20.0f;
static const long          GARA_DIST_THRESH  = 7;
static const float         STATUS_TEMP_DELTA = 0.5f;
static const float         STATUS_HUM_DELTA  = 2.0f;
static const long          STATUS_DIST_DELTA = 3;
static const int           IR_ACTIVE_LEVEL   = LOW;
static unsigned long       pirOffDelay       = 5000;
static int                 lightBrightness   = 100;
static String              lightEffect       = "static";
static const unsigned long DOOR_FAST_CLOSE   = 1000;

// ── STATE MACHINE ─────────────────────────────────────────────────────
enum SystemState {
    MODE_NORMAL, MODE_CHECK_OLD_PASS, MODE_ENTER_NEW_PASS,
    MODE_CONFIRM_NEW_PASS, MODE_LOCKOUT
};
SystemState sysState = MODE_NORMAL;

// ── BIẾN SMARTLOCK ────────────────────────────────────────────────────
String        correctPassword   = "";
String        guestPassword     = "";
String        currentInput      = "";
String        newPassBuffer     = "";
unsigned long guestPassExpiryMs = 0;
char          mainDoorCardUID[16] = "23 4E F6 2F";
char          garageCardUID[16]   = "23 C0 EB 0C";

bool          isDoorOpen             = false;
unsigned long doorOpenTime           = 0;
unsigned long openDuration           = 5000;
bool          keypadActive           = false;
unsigned long lastKeyPressTime       = 0;
int           failedAttempts         = 0;
unsigned long lockoutStartTime       = 0;
unsigned long currentLockoutDuration = 30000;
int           lockoutCount           = 0;
unsigned long lastWiFiCheck          = 0;
unsigned long displayUntil           = 0;
String        pendingAction          = "";

// ── BIẾN HOME AUTOMATION ──────────────────────────────────────────────
float         temperature  = 0.0f;
float         humidity     = 0.0f;
bool          fanOn        = false;
int           fanDir       = 0;      // 0=off, 1=thuận, -1=ngược
int           fanSpeed     = 0;      // PWM duty 0–255
bool          garaOpen     = false;
bool          garaManualMode = false; // true = web dieu khien, false = sieu am auto
unsigned long garaOpenTime = 0;
long          lastDistanceCm = -1;
unsigned long dhtTimer     = 0;
unsigned long sonarTimer   = 0;
unsigned long lcdIdleTimer = 0;
bool          lcdLine2Alt  = false;

// [V4.0-F2] Quạt manual mode
bool          fanManualMode = false;  // true = web đang điều khiển quạt

// [V4.0-F3] Đèn hành lang manual override
bool          ledManualOverride = false; // true = web đang điều khiển LED
bool          ledManualState    = false; // trạng thái LED khi ở manual mode
bool          pirLightState     = false;
unsigned long lightEffectTimer  = 0;
int           lightFadeDuty     = 0;
int           lightFadeDir      = 1;

bool          motionDetected = false;
bool          motionPrev     = false;
unsigned long pirOffTime     = 0;

bool          doorByAuth        = false;
bool          doorPassDetected  = false;
int           sonarConfirmCount = 0;

// [V4.0-WS1] WebSocket state
bool          wsConnected       = false;
bool          wsStarted         = false;
unsigned long wsReconnectTimer  = 0;
unsigned long lastCommandAt      = 0;
bool          statusDirty        = false;
unsigned long lastStatusPush     = 0;
bool          statusSnapshotReady = false;
float         lastSentTemperature = 0.0f;
float         lastSentHumidity    = 0.0f;
bool          lastSentMotion      = false;
long          lastSentDistanceCm  = -1;

bool          authPending          = false;
String        authRequestId        = "";
String        authPendingTarget    = "";
unsigned long authRequestAt        = 0;
static const unsigned long AUTH_TIMEOUT = 5000;

// ── NOTIFY QUEUE (gửi event qua WebSocket, không blocking) ───────────
struct NotifyJob { bool pending; char type[24]; char source[24]; };
static NotifyJob notifyQueue[8];
static int notifyHead = 0, notifyTail = 0;

void scheduleNotify(const char *type, const char *source) {
    if (!networkEnabled()) return;

    int next = (notifyTail + 1) % 8;
    if (next == notifyHead) return;
    strncpy(notifyQueue[notifyTail].type,   type,   23);
    strncpy(notifyQueue[notifyTail].source, source, 23);
    notifyQueue[notifyTail].pending = true;
    notifyTail = next;
}

// [V4.0] flushNotify gửi qua WebSocket thay vì HTTP POST
void flushNotify() {
    if (!networkEnabled()) return;
    if (notifyHead == notifyTail) return;
    if (!wsConnected) return;  // Giữ queue đến khi kết nối lại

    NotifyJob &job = notifyQueue[notifyHead];
    if (!job.pending) { notifyHead = (notifyHead + 1) % 8; return; }

    String body = "{\"type\":\"event\",\"event\":\"";
    body += job.type;
    body += "\",\"source\":\"";
    body += job.source;
    body += "\"}";
    wsClient.sendTXT(body);

    job.pending = false;
    notifyHead  = (notifyHead + 1) % 8;
}

// ── TIỆN ÍCH ─────────────────────────────────────────────────────────
int lightBrightnessToDuty() {
    return map(constrain(lightBrightness, 0, 100), 0, 100, 0, 255);
}

void writePirLightDuty(int duty) {
    if (!PIR_LIGHT_AVAILABLE) return;
    ledcWrite(LED_PIR, constrain(duty, 0, 255));
}

void applyPirLightOutput(bool on) {
    if (!PIR_LIGHT_AVAILABLE) return;
    writePirLightDuty(on ? lightBrightnessToDuty() : 0);
}

void setPirLight(bool on) {
    bool wasOn = pirLightState;
    ledManualState = on;
    pirLightState = on;
    lightFadeDuty = on ? lightBrightnessToDuty() : 0;
    lightFadeDir = -1;
    applyPirLightOutput(on);
    if (wasOn != on) statusDirty = true;
}

bool getPirLightState() {
    return pirLightState;
}

void updateLightEffect() {
    if (!pirLightState || !PIR_LIGHT_AVAILABLE) return;
    int maxDuty = lightBrightnessToDuty();
    if (lightEffect == "blink") {
        if (millis() - lightEffectTimer >= 500) {
            lightEffectTimer = millis();
            static bool blinkOn = true;
            blinkOn = !blinkOn;
            writePirLightDuty(blinkOn ? maxDuty : 0);
        }
    } else if (lightEffect == "fading") {
        if (millis() - lightEffectTimer >= 30) {
            lightEffectTimer = millis();
            lightFadeDuty += lightFadeDir * 8;
            if (lightFadeDuty <= 12) { lightFadeDuty = 12; lightFadeDir = 1; }
            if (lightFadeDuty >= maxDuty) { lightFadeDuty = maxDuty; lightFadeDir = -1; }
            writePirLightDuty(lightFadeDuty);
        }
    } else {
        applyPirLightOutput(true);
    }
}

bool readMotionSensors() {
    return digitalRead(PIR1_PIN) == IR_ACTIVE_LEVEL
           || digitalRead(PIR2_PIN) == IR_ACTIVE_LEVEL;
}

long getDist() {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long d = pulseIn(ECHO_PIN, HIGH, 25000);
    return (d == 0) ? -1 : d * 0.034 / 2;
}

// ── LCD HELPERS ───────────────────────────────────────────────────────
void showIdleScreen() {
    lcd.clear(); lcd.setCursor(0, 0);
    if (!isnan(temperature) && temperature != 0.0f) {
        lcd.print("T:"); lcd.print((int)temperature); lcd.print("C ");
    } else { lcd.print("T:--C "); }
    lcd.print(motionDetected ? "MOV:ON " : "MOV:OFF");
    lcd.setCursor(0, 1);
    if (lcdLine2Alt) {
        lcd.print(garaOpen ? "Gara:MO " : "Gara:CLS");
        if (fanDir != 0) {
            char spd[9]; int pct = fanDutyToPercent();
            snprintf(spd, sizeof(spd), "%c:%3d%%", fanDir == 1 ? 'F' : 'R', pct);
            lcd.print(spd);
        } else { lcd.print(" Fan:OF"); }
    } else { lcd.print("PIN/The de vao  "); }
}

void displayMasked(int startCol, int row, int maxCols) {
    lcd.setCursor(startCol, row);
    int len = (int)currentInput.length();
    for (int i = 0; i < maxCols; i++) lcd.print(i < len ? '*' : ' ');
}

void updateLcdLine0() {
    char buf[17];
    snprintf(buf, sizeof(buf), "T:%-2dC %s",
             (int)temperature,
             motionDetected ? "MOV:ON " : "MOV:OFF");
    lcd.setCursor(0, 0); lcd.print(buf);
}

// ── ĐIỀU KHIỂN QUẠT ──────────────────────────────────────────────────
int calcFanDuty(float deviation, float scale) {
    float ratio = constrain(deviation / scale, 0.0f, 1.0f);
    return (int)(FAN_PWM_MIN + ratio * (FAN_PWM_MAX - FAN_PWM_MIN));
}

int fanDutyToPercent() {
    if (fanDir == 0 || fanSpeed <= 0) return 0;
    if (fanSpeed <= FAN_PWM_MIN) return 1;
    return constrain(
        (int)round((float)(fanSpeed - FAN_PWM_MIN) * 100.0f / (float)(FAN_PWM_MAX - FAN_PWM_MIN)),
        1,
        100
    );
}

int fanPercentToDuty(int pct) {
    pct = constrain(pct, 0, 100);
    if (pct == 0) return 0;
    return map(pct, 0, 100, FAN_PWM_MIN, FAN_PWM_MAX);
}

void setFan(int dir, int duty = FAN_PWM_MAX) {
    bool changed = (fanDir != dir) || (fanSpeed != (dir != 0 ? duty : 0));
    fanDir   = dir;
    fanOn    = (dir != 0);
    fanSpeed = fanOn ? duty : 0;
    if (dir == 1)       { digitalWrite(FAN_IN1, HIGH); digitalWrite(FAN_IN2, LOW);  }
    else if (dir == -1) { digitalWrite(FAN_IN1, LOW);  digitalWrite(FAN_IN2, HIGH); }
    else                { digitalWrite(FAN_IN1, LOW);  digitalWrite(FAN_IN2, LOW);  }
    ledcWrite(FAN_ENA, fanSpeed);
    if (changed) statusDirty = true;
}

void setFanPercent(int dir, int pct) {
    pct = constrain(pct, 0, 100);
    if (dir == 0 || pct == 0) {
        setFan(0, 0);
        return;
    }
    int duty = fanPercentToDuty(pct);
    setFan(dir, duty);
}

// ── SMARTLOCK: KHÓA / MỞ CỬA ─────────────────────────────────────────
void lockDoor() {
    bool wasOpen      = isDoorOpen;
    isDoorOpen        = false;
    sysState          = MODE_NORMAL;
    currentInput      = "";
    newPassBuffer     = "";
    keypadActive      = false;
    displayUntil      = 0;
    pendingAction     = "";
    doorByAuth        = false;
    doorPassDetected  = false;
    sonarConfirmCount = 0;
    openDuration      = 5000;
    sDoor.write(DOOR_CLOSE_ANGLE);
    showIdleScreen();
    if (wasOpen) {
        scheduleNotify("close", "auto");
        statusDirty = true;
    }
}

void triggerOpenDoor(const char *source) {
    if (isDoorOpen) return;
    lockoutCount           = 0;
    currentLockoutDuration = 30000;
    isDoorOpen     = true;
    sysState       = MODE_NORMAL;
    failedAttempts = 0;
    doorOpenTime   = millis();
    keypadActive   = false;
    displayUntil   = 0;
    pendingAction  = "";
    doorByAuth       = true;
    doorPassDetected = false;
    sDoor.write(DOOR_OPEN_ANGLE);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(">>> CUA MO <<<");
    lcd.setCursor(0, 1); lcd.print(source);
    scheduleNotify("open", source);
    statusDirty = true;
}

void triggerLockout() {
    lockoutCount++;
    if      (lockoutCount == 1) currentLockoutDuration = 30000;
    else if (lockoutCount == 2) currentLockoutDuration = 60000;
    else                        currentLockoutDuration = 120000;
    sysState         = MODE_LOCKOUT;
    lockoutStartTime = millis();
    currentInput     = "";
    keypadActive     = false;
    displayUntil     = 0;
    pendingAction    = "";
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("!! CANH BAO !!");
    lcd.setCursor(0, 1); lcd.print("Khoa He Thong!");
    scheduleNotify("lockout", String(currentLockoutDuration / 1000).c_str());
    statusDirty = true;
}

void failedAuth() {
    failedAttempts++;
    if (failedAttempts >= MAX_FAILS) triggerLockout();
}

bool guestPassValid() {
    if (guestPassword.length() < (size_t)MIN_PASS_LEN) return false;
    if (guestPassExpiryMs == 0) return true;
    return (long)(guestPassExpiryMs - millis()) > 0;
}

void clearGuestPass() {
    guestPassword     = "";
    guestPassExpiryMs = 0;
    prefs.putString("guest_pass",  "");
    prefs.putULong("guest_expiry", 0);
}

String getOrInitPrefString(const char *key, const char *defaultValue) {
    String value = prefs.getString(key, "");
    value.trim();
    if (value.length() == 0) {
        value = defaultValue;
        prefs.putString(key, value);
    }
    return value;
}

void storeCardUid(const char *key, const String &uid, char *dest, size_t destSize) {
    String normalized = uid;
    normalized.trim();
    normalized.toUpperCase();
    normalized.toCharArray(dest, destSize);
    prefs.putString(key, normalized);
}

void closeGarage(const char *source) {
    if (!garaOpen) return;
    sGara.write(GARA_CLOSE_ANGLE);
    garaOpen = false;
    scheduleNotify("gara_close", source);
    if (!isDoorOpen && !keypadActive) showIdleScreen();
    statusDirty = true;
}

void openGarage(const char *source) {
    if (garaOpen) {
        garaOpenTime = millis();
        return;
    }
    sGara.write(GARA_OPEN_ANGLE);
    garaOpen = true;
    garaOpenTime = millis();
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Gara: DANG MO");
    lcd.setCursor(0, 1); lcd.print(source);
    scheduleNotify("gara", source);
    statusDirty = true;
}

bool distanceChangedEnough(long current, long previous) {
    if (current <= 0 && previous <= 0) return false;
    if ((current <= 0) != (previous <= 0)) return true;
    bool currentNear  = current > 0 && current <= GARA_DIST_THRESH;
    bool previousNear = previous > 0 && previous <= GARA_DIST_THRESH;
    if (currentNear != previousNear) return true;
    return labs(current - previous) >= STATUS_DIST_DELTA;
}

void markSensorStatusDirtyIfNeeded() {
    if (!statusSnapshotReady) {
        statusDirty = true;
        return;
    }
    if (fabs(temperature - lastSentTemperature) >= STATUS_TEMP_DELTA) statusDirty = true;
    if (fabs(humidity - lastSentHumidity) >= STATUS_HUM_DELTA) statusDirty = true;
    if (motionDetected != lastSentMotion) statusDirty = true;
    if (distanceChangedEnough(lastDistanceCm, lastSentDistanceCm)) statusDirty = true;
}

void rememberStatusSnapshot() {
    lastSentTemperature = temperature;
    lastSentHumidity    = humidity;
    lastSentMotion      = motionDetected;
    lastSentDistanceCm  = lastDistanceCm;
    statusSnapshotReady = true;
    lastStatusPush      = millis();
    statusDirty         = false;
}

// ── [V4.0-WS3] STATUS PUSH ───────────────────────────────────────────
//   Gửi trạng thái toàn hệ thống định kỳ và khi có thay đổi đáng kể.
void pushStatus(bool force = false) {
    if (!networkEnabled()) return;
    if (!wsConnected) return;
    if (!force && lastStatusPush > 0 && millis() - lastStatusPush < STATUS_DIRTY_MIN_INTERVAL) return;

    int  pct      = fanDutyToPercent();
    bool ledState = ledManualOverride
                    ? ledManualState
                    : getPirLightState();
    long dist     = lastDistanceCm;

    char buf[448];
    snprintf(buf, sizeof(buf),
        "{\"type\":\"status\","
        "\"door\":\"%s\","
        "\"temp\":%d,"
        "\"humidity\":%d,"
        "\"motion\":%s,"
        "\"gara\":\"%s\","
        "\"garageMode\":\"%s\","
        "\"fan\":\"%s\","
        "\"fanPct\":%d,"
        "\"fanMode\":\"%s\","
        "\"light\":%s,"
        "\"lightMode\":\"%s\","
        "\"lightBrightness\":%d,"
        "\"lightEffect\":\"%s\","
        "\"lightHold\":%lu,"
        "\"dist\":%ld}",
        (sysState == MODE_LOCKOUT) ? "LOCKED_OUT"
            : isDoorOpen ? "OPEN" : "CLOSED",
        (int)temperature,
        (int)humidity,
        motionDetected ? "true" : "false",
        garaOpen ? "OPEN" : "CLOSED",
        garaManualMode ? "MANUAL" : "AUTO",
        fanDir == 1 ? "FORWARD" : fanDir == -1 ? "REVERSE" : "OFF",
        pct,
        fanManualMode ? "MANUAL" : "AUTO",
        ledState ? "true" : "false",
        ledManualOverride ? "MANUAL" : "AUTO",
        lightBrightness,
        lightEffect.c_str(),
        pirOffDelay / 1000UL,
        dist
    );
    wsClient.sendTXT(buf);
    rememberStatusSnapshot();
}

void pushStatusIfDirty() {
    if (!statusDirty) return;
    if (!networkEnabled() || !wsConnected) return;
    pushStatus();
}

void pushStatusIfPeriodicDue() {
    if (!networkEnabled() || !wsConnected) return;
    if (millis() - lastStatusPush >= STATUS_INTERVAL) pushStatus();
}

void sendAuthRequest(const char *method, const String &credential, const char *target) {
    if (!networkEnabled() || !wsConnected) return;
    authRequestId = String(millis());
    authPendingTarget = target;
    authRequestAt = millis();
    authPending = true;

    StaticJsonDocument<256> doc;
    doc["type"] = "auth_request";
    doc["id"] = authRequestId;
    doc["method"] = method;
    doc["credential"] = credential;
    doc["target"] = target;
    String body;
    serializeJson(doc, body);
    wsClient.sendTXT(body);

    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Dang xac thuc");
    lcd.setCursor(0, 1); lcd.print(method);
}

void applyAuthResult(bool allowed, const char *target, const char *source, int seconds, const char *reason) {
    authPending = false;
    authRequestId = "";
    authPendingTarget = "";
    if (allowed) {
        if (seconds >= 1 && seconds <= 600) openDuration = (unsigned long)seconds * 1000UL;
        if (strcmp(target, "garageDoor") == 0) {
            garaManualMode = true;
            openGarage(source);
        } else {
            triggerOpenDoor(source);
        }
    } else {
        lcd.setCursor(0, 1);
        if (strcmp(reason, "card_enrolled") == 0) {
            lcd.print("Da them the RFID");
        } else {
            lcd.print("Tu choi truy cap");
            failedAuth();
        }
    }
    statusDirty = true;
}

// ── [V4.0-WS1] XỬ LÝ LỆNH TỪ SERVER ────────────────────────────────
//   Server gửi: { id, cmd, payload? }
//   ESP32 reply: { id, result }
void handleWsCommand(const char* json) {
    if (!networkEnabled()) return;

    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return;
    }

    String msgType = doc["type"]    | "";
    if (msgType == "auth_result") {
        String requestId = doc["requestId"] | "";
        if (!authPending || requestId != authRequestId) return;
        bool allowed = doc["allowed"] | false;
        const char *target = doc["target"] | authPendingTarget.c_str();
        const char *source = doc["source"] | "Server";
        const char *reason = doc["reason"] | "";
        int seconds = doc["seconds"] | 30;
        applyAuthResult(allowed, target, source, seconds, reason);
        pushStatus(true);
        return;
    }

    String id      = doc["id"]      | "";
    String cmd     = doc["cmd"]     | "";
    String payload = doc["payload"] | "";
    String result  = "OK";

    unsigned long now = millis();
    if (now - lastCommandAt < COMMAND_COOLDOWN && cmd != "status") {
        result = "COMMAND_COOLDOWN";
        if (id.length() > 0) {
            String resp = "{\"id\":\"" + id + "\",\"result\":\"" + result + "\"}";
            wsClient.sendTXT(resp);
        }
        return;
    }
    if (cmd != "status") lastCommandAt = now;

    // ─── LỆNH CỬA CHÍNH ─────────────────────────────────────────────
    if (cmd == "unlock") {
        if (sysState == MODE_LOCKOUT) {
            failedAttempts = 0; sysState = MODE_NORMAL;
            scheduleNotify("lockout_reset", "App/Web");
        }
        if (isDoorOpen) { result = "ALREADY_OPEN"; }
        else {
            if (payload.length() > 0) {
                int sec = payload.toInt();
                if (sec >= 1 && sec <= 600) openDuration = (unsigned long)sec * 1000UL;
            }
            triggerOpenDoor("App/Web");
            result = "DOOR_OPENED";
        }
    }
    else if (cmd == "open") {
        if (sysState == MODE_LOCKOUT) { result = "SYSTEM_LOCKED"; }
        else if (isDoorOpen)          { result = "ALREADY_OPEN"; }
        else {
            if (payload.length() > 0) {
                int sec = payload.toInt();
                if (sec >= 1 && sec <= 600) openDuration = (unsigned long)sec * 1000UL;
            }
            triggerOpenDoor("App/Web");
            result = "DOOR_OPENED";
        }
    }
    else if (cmd == "close" || cmd == "lock") {
        if (isDoorOpen) {
            lockDoor();
            result = "DOOR_CLOSED";
        } else {
            result = "DOOR_ALREADY_CLOSED";
        }
    }
    // ─── LỆNH GUEST PIN ─────────────────────────────────────────────
    else if (cmd == "guest") {
        if (sysState == MODE_LOCKOUT) { result = "SYSTEM_LOCKED"; }
        else if (payload.length() == 0) {
            clearGuestPass(); result = "GUEST_PASS_REVOKED";
        } else {
            int    sep     = payload.indexOf(':');
            String pin     = (sep == -1) ? payload : payload.substring(0, sep);
            int    minutes = (sep == -1) ? 0        : payload.substring(sep + 1).toInt();
            if ((int)pin.length() < MIN_PASS_LEN)            { result = "PASS_TOO_SHORT"; }
            else if (pin.indexOf(':') != -1 || pin.indexOf('"') != -1) { result = "INVALID_PIN_CHARS"; }
            else {
                guestPassword     = pin;
                prefs.putString("guest_pass", guestPassword);
                guestPassExpiryMs = (minutes > 0)
                    ? millis() + (unsigned long)minutes * 60000UL : 0;
                result = "GUEST_PASS_SAVED";
            }
        }
    }
    // ─── LỆNH THẺ RFID ──────────────────────────────────────────────
    else if (cmd == "card" || cmd == "card_main") {
        if (sysState == MODE_LOCKOUT) { result = "SYSTEM_LOCKED"; }
        else {
            payload.trim(); payload.toUpperCase();
            if (payload.length() == 0 || payload.length() >= sizeof(mainDoorCardUID)) {
                result = "PAYLOAD_INVALID";
            } else {
                storeCardUid("card_main_uid", payload, mainDoorCardUID, sizeof(mainDoorCardUID));
                result = "MAIN_CARD_UID_SAVED";
            }
        }
    }
    else if (cmd == "card_garage") {
        if (sysState == MODE_LOCKOUT) { result = "SYSTEM_LOCKED"; }
        else {
            payload.trim(); payload.toUpperCase();
            if (payload.length() == 0 || payload.length() >= sizeof(garageCardUID)) {
                result = "PAYLOAD_INVALID";
            } else {
                storeCardUid("card_gara_uid", payload, garageCardUID, sizeof(garageCardUID));
                result = "GARAGE_CARD_UID_SAVED";
            }
        }
    }
    // ─── LỆNH ĐỔI MẬT KHẨU ─────────────────────────────────────────
    else if (cmd == "passwd") {
        if (sysState == MODE_LOCKOUT) { result = "SYSTEM_LOCKED"; }
        else {
            int sep = payload.indexOf(':');
            if (sep == -1) { result = "PAYLOAD_INVALID"; }
            else {
                String oldPass = payload.substring(0, sep);
                String newPass = payload.substring(sep + 1);
                if (oldPass != correctPassword)                                    { result = "WRONG_OLD_PASS"; }
                else if ((int)newPass.length() < MIN_PASS_LEN
                         || (int)newPass.length() > MAX_INPUT_LEN)                 { result = "PASS_LENGTH_ERROR"; }
                else {
                    correctPassword = newPass;
                    prefs.putString("password", correctPassword);
                    result = "PASS_CHANGED";
                }
            }
        }
    }
    // ─── LỆNH THỜI GIAN MỞ CỬA ─────────────────────────────────────
    else if (cmd == "duration") {
        int sec = payload.toInt();
        if (sec < 1 || sec > 600) { result = "INVALID_DURATION"; }
        else {
            openDuration = (unsigned long)sec * 1000UL;
            if (isDoorOpen) doorOpenTime = millis();
            result = "DURATION_SET";
        }
    }
    // ─── LỆNH STATUS (server yêu cầu push ngay) ─────────────────────
    else if (cmd == "status") {
        pushStatus(true);
        result = "STATUS_SENT";
    }
    // ─── [V4.0-F1] LỆNH CỔNG GARA ───────────────────────────────────
    else if (cmd == "gara_open") {
        garaManualMode = true;
        if (!garaOpen) {
            openGarage("App/Web");
            result = "GARA_OPENED";
        } else {
            result = "GARA_ALREADY_OPEN";
        }
    }
    else if (cmd == "gara_close") {
        garaManualMode = true;
        if (garaOpen) {
            closeGarage("App/Web");
            result = "GARA_CLOSED";
        } else {
            result = "GARA_ALREADY_CLOSED";
        }
    }
    else if (cmd == "gara_auto") {
        if (garaManualMode) statusDirty = true;
        garaManualMode = false;
        result = "GARA_AUTO_ON";
    }
    else if (cmd == "gara_manual") {
        if (!garaManualMode) statusDirty = true;
        garaManualMode = true;
        result = "GARA_MANUAL_ON";
    }
    // ─── [V4.0-F2] LỆNH QUẠT ────────────────────────────────────────
    else if (cmd == "fan_auto") {
        if (fanManualMode) statusDirty = true;
        fanManualMode = false;
        result = "FAN_AUTO_ON";
    }
    else if (cmd == "fan_set") {
        // payload: "dir:speed_pct"  (e.g. "1:80", "0:0", "-1:60")
        int sep = payload.indexOf(':');
        if (sep == -1) { result = "PAYLOAD_INVALID"; }
        else {
            int d   = payload.substring(0, sep).toInt();
            int pct = payload.substring(sep + 1).toInt();
            if (d < -1 || d > 1)      { result = "INVALID_DIR"; }
            else if (pct < 0 || pct > 100) { result = "INVALID_SPEED"; }
            else {
                if (!fanManualMode) statusDirty = true;
                fanManualMode = true;
                if (pct == 0) d = 0;
                setFanPercent(d, pct);
                result = "FAN_SET";
            }
        }
    }
    // ─── [V4.0-F3] LỆNH ĐÈN HÀNH LANG ──────────────────────────────
    else if (cmd == "light_on") {
        if (!ledManualOverride || !ledManualState) statusDirty = true;
        ledManualOverride = true;
        ledManualState    = true;
        setPirLight(true);
        result = "LIGHT_ON";
    }
    else if (cmd == "light_off") {
        if (!ledManualOverride || ledManualState) statusDirty = true;
        ledManualOverride = true;
        ledManualState    = false;
        setPirLight(false);
        result = "LIGHT_OFF";
    }
    else if (cmd == "light_auto") {
        if (ledManualOverride) statusDirty = true;
        ledManualOverride = false;
        pirOffTime = 0;
        bool m = readMotionSensors();
        motionDetected = m;
        if (m) {
            setPirLight(true);
            pirOffTime = millis() + pirOffDelay;
        } else {
            setPirLight(false);
        }
        // LED sẽ trở lại chế độ PIR tự động ở block [G]
        result = "LIGHT_AUTO";
    }
    else if (cmd == "light_config") {
        // payload: "hold_seconds:brightness:effect"
        int sep1 = payload.indexOf(':');
        int sep2 = payload.indexOf(':', sep1 + 1);
        if (sep1 == -1 || sep2 == -1) { result = "PAYLOAD_INVALID"; }
        else {
            int holdSec = payload.substring(0, sep1).toInt();
            int brightness = payload.substring(sep1 + 1, sep2).toInt();
            String effect = payload.substring(sep2 + 1);
            effect.trim();
            effect.toLowerCase();
            if (holdSec < 1 || holdSec > 600) { result = "INVALID_HOLD"; }
            else if (brightness < 10 || brightness > 100) { result = "INVALID_BRIGHTNESS"; }
            else if (effect != "static" && effect != "blink" && effect != "fading") { result = "INVALID_EFFECT"; }
            else {
                pirOffDelay = (unsigned long)holdSec * 1000UL;
                lightBrightness = brightness;
                lightEffect = effect;
                if (pirLightState) applyPirLightOutput(true);
                statusDirty = true;
                result = "LIGHT_CONFIG_SET";
            }
        }
    }
    else if (cmd == "fan_config") {
        // payload: "temp_on:temp_off:hum_on:hum_off"
        float vals[4];
        int start = 0;
        bool ok = true;
        for (int i = 0; i < 4; i++) {
            int sep = (i == 3) ? -1 : payload.indexOf(':', start);
            String part = (sep == -1) ? payload.substring(start) : payload.substring(start, sep);
            if (part.length() == 0) { ok = false; break; }
            vals[i] = part.toFloat();
            start = sep + 1;
        }
        if (!ok || vals[1] >= vals[0] || vals[3] >= vals[2]) {
            result = "INVALID_THRESHOLDS";
        } else {
            fanTempOnThresh = vals[0];
            fanTempHyst = vals[0] - vals[1];
            fanHumOnThresh = vals[2];
            fanHumHyst = vals[2] - vals[3];
            result = "FAN_CONFIG_SET";
        }
    }
    else {
        result = "UNKNOWN_CMD";
    }

    // Gửi response về server (có id = correlation)
    if (id.length() > 0) {
        String resp = "{\"id\":\"" + id + "\",\"result\":\"" + result + "\"}";
        wsClient.sendTXT(resp);
    }
    pushStatusIfDirty();
}

// ── [V4.0-WS1] WEBSOCKET EVENT HANDLER ──────────────────────────────
void wsEvent(WStype_t type, uint8_t *payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            wsConnected = true;
            lcd.setCursor(0, 0); lcd.print("WS: Connected!");
            pushStatus(true);  // Push trạng thái ngay khi kết nối
            break;

        case WStype_DISCONNECTED:
            wsConnected = false;
            break;

        case WStype_TEXT:
            handleWsCommand((char*)payload);
            break;

        case WStype_ERROR:
            break;

        case WStype_PING:
        case WStype_PONG:
            break;  // WebSocket heartbeat — tự động xử lý bởi thư viện

        default:
            break;
    }
}

// ── WiFi + WebSocket ──────────────────────────────────────────────────
void maintainWiFi() {
    if (!networkEnabled()) {
        wsConnected = false;
        wsStarted   = false;
        return;
    }

    if (WiFi.status() != WL_CONNECTED) {
        if (millis() - lastWiFiCheck >= WIFI_CHECK_INTV) {
            WiFi.disconnect(); WiFi.reconnect();
            lastWiFiCheck = millis();
            wsConnected   = false;
            wsStarted     = false;  // Force re-init WS khi WiFi reconnect
        }
        return;
    }

    // Khởi tạo WebSocket client lần đầu (hoặc sau khi WiFi reconnect)
    if (!wsStarted) {
        wsClient.begin(SERVER_HOST, SERVER_WS_PORT, "/ws/esp32");
        wsClient.onEvent(wsEvent);
        wsClient.setReconnectInterval(5000);      // Retry mỗi 5s khi mất kết nối
        wsClient.enableHeartbeat(15000, 3000, 2); // Ping 15s, timeout 3s, 2 lần
        wsStarted = true;
    }
}

// ── KEYPAD HANDLERS (giữ nguyên từ V3.7) ─────────────────────────────
void handleKeyModeNormal(char key) {
    if (key == '*') {
        if (currentInput.length() > 0) {
            currentInput.remove(currentInput.length() - 1);
            lcd.setCursor(0, 1); lcd.print("PIN: ");
            displayMasked(5, 1, 11);
        } else { keypadActive = false; showIdleScreen(); }
    } else if (key == '#') {
        if (currentInput.length() == 0) return;
        if (networkEnabled() && wsConnected) {
            sendAuthRequest("password", currentInput, "mainDoor");
        } else if (currentInput == correctPassword) {
            triggerOpenDoor("Mat Khau");
        } else if (guestPassValid() && currentInput == guestPassword) {
            triggerOpenDoor("Khach(OTP)");
            clearGuestPass();
        } else {
            bool expired = (guestPassword.length() >= (size_t)MIN_PASS_LEN
                            && currentInput == guestPassword && !guestPassValid());
            if (expired) clearGuestPass();
            lcd.setCursor(0, 1);
            lcd.print(expired ? "OTP het han!    " : "Sai Mat Khau!   ");
            failedAuth();
        }
        currentInput = "";
    } else {
        if ((int)currentInput.length() < MAX_INPUT_LEN) {
            currentInput += key;
            lcd.setCursor(0, 1); lcd.print("PIN: ");
            displayMasked(5, 1, 11);
        }
    }
}

void handleKeyModeCheckOld(char key) {
    if (key == '*') { lockDoor(); return; }
    if (key == '#') {
        if (currentInput.length() == 0) return;
        if (currentInput == correctPassword) {
            sysState = MODE_ENTER_NEW_PASS; currentInput = "";
            lcd.clear();
            lcd.setCursor(0, 0); lcd.print("---Doi Pass---");
            lcd.setCursor(0, 1); lcd.print("Pass moi:  ");
        } else {
            lcd.clear(); lcd.setCursor(0, 0); lcd.print("Sai Pass Cu!");
            sysState = MODE_NORMAL; currentInput = "";
            displayUntil = millis() + 1500; pendingAction = "lock";
            failedAuth();
        }
    } else {
        if ((int)currentInput.length() < MAX_INPUT_LEN) {
            currentInput += key; displayMasked(9, 1, 7);
        }
    }
}

void handleKeyModeEnterNew(char key) {
    if (key == '*') { lockDoor(); return; }
    if (key == '#') {
        if ((int)currentInput.length() >= MIN_PASS_LEN) {
            newPassBuffer = currentInput; currentInput = "";
            sysState = MODE_CONFIRM_NEW_PASS;
            lcd.clear();
            lcd.setCursor(0, 0); lcd.print("Nhap lai pass:");
            lcd.setCursor(0, 1); lcd.print("Confirm:  ");
        } else {
            lcd.clear(); lcd.setCursor(0, 0); lcd.print("Pass qua ngan!");
            lcd.setCursor(0, 1); lcd.print("Toi thieu 4 ky");
            currentInput = ""; displayUntil = millis() + 1500; pendingAction = "enter_new";
        }
    } else {
        if ((int)currentInput.length() < MAX_INPUT_LEN) {
            currentInput += key; displayMasked(10, 1, 6);
        }
    }
}

void handleKeyModeConfirm(char key) {
    if (key == '*') { newPassBuffer = ""; lockDoor(); return; }
    if (key == '#') {
        if (currentInput == newPassBuffer) {
            correctPassword = currentInput;
            prefs.putString("password", correctPassword);
            lcd.clear();
            lcd.setCursor(0, 0); lcd.print("Doi Pass OK!");
            lcd.setCursor(0, 1); lcd.print("Da luu!");
            displayUntil = millis() + 2000; pendingAction = "lock";
        } else {
            lcd.clear(); lcd.setCursor(0, 0); lcd.print("Khong khop!");
            lcd.setCursor(0, 1); lcd.print("Thu lai...");
            currentInput = ""; newPassBuffer = "";
            displayUntil = millis() + 1800; pendingAction = "enter_new";
        }
    } else {
        if ((int)currentInput.length() < MAX_INPUT_LEN) {
            currentInput += key; displayMasked(9, 1, 7);
        }
    }
}

void keypadEvent(KeypadEvent key) {
    if (keypad.getState() == HOLD && key == '*'
        && !isDoorOpen && sysState == MODE_NORMAL) {
        sysState = MODE_CHECK_OLD_PASS; currentInput = "";
        keypadActive = true; lastKeyPressTime = millis();
        lcd.clear();
        lcd.setCursor(0, 0); lcd.print("---Doi Pass---");
        lcd.setCursor(0, 1); lcd.print("Pass cu: ");
    }
}

// ── SETUP ─────────────────────────────────────────────────────────────
void setup() {
    // Dua motor ve trang thai tat cang som cang tot.
    // Production khong dung Serial vi GPIO1/GPIO3 dang cap cho motor.
    pinMode(FAN_ENA, OUTPUT); digitalWrite(FAN_ENA, LOW);
    pinMode(FAN_IN1, OUTPUT); digitalWrite(FAN_IN1, LOW);
    pinMode(FAN_IN2, OUTPUT); digitalWrite(FAN_IN2, LOW);
    prefs.begin("smarthome", false);

    correctPassword   = getOrInitPrefString("password", "123456");
    guestPassword     = prefs.getString("guest_pass", "");
    guestPassExpiryMs = 0;
    String legacyUID  = prefs.getString("card_uid", "");
    legacyUID.trim();
    String mainDefault = legacyUID.length() > 0 ? legacyUID : "23 4E F6 2F";
    String mainUID    = getOrInitPrefString("card_main_uid", mainDefault.c_str());
    String garaUID    = getOrInitPrefString("card_gara_uid", "23 C0 EB 0C");
    mainUID.toCharArray(mainDoorCardUID, sizeof(mainDoorCardUID));
    garaUID.toCharArray(garageCardUID, sizeof(garageCardUID));

    memset(notifyQueue, 0, sizeof(notifyQueue));
    notifyHead = notifyTail = 0;

    keypad.setHoldTime(1500);
    keypad.addEventListener(keypadEvent);

    // GPIO
    pinMode(LED_PIR,    OUTPUT);
    pinMode(TRIG_PIN,   OUTPUT); digitalWrite(TRIG_PIN, LOW);
    pinMode(ECHO_PIN,   INPUT);
    pinMode(FAN_IN1,    OUTPUT); digitalWrite(FAN_IN1, LOW);
    pinMode(FAN_IN2,    OUTPUT); digitalWrite(FAN_IN2, LOW);
    digitalWrite(FAN_ENA, LOW);
    pinMode(PIR1_PIN, INPUT);
    pinMode(PIR2_PIN, INPUT);

    // Servo khoi tao truoc PWM motor de tranh tranh LEDC timer/channel.
    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);
    sDoor.setPeriodHertz(50); sDoor.attach(SERVO_DOOR, 500, 2400);
    sGara.setPeriodHertz(50); sGara.attach(SERVO_GARA, 500, 2400);
    sDoor.write(DOOR_CLOSE_ANGLE); sGara.write(GARA_CLOSE_ANGLE);

    // PWM motor dung channel rieng de khong tranh channel servo.
    if (PIR_LIGHT_AVAILABLE) {
        ledcAttachChannel(LED_PIR, LED_PWM_FREQ, LED_PWM_BITS, LED_PWM_CHAN);
        ledcWrite(LED_PIR, 0);
    }
    ledcAttachChannel(FAN_ENA, FAN_PWM_FREQ, FAN_PWM_BITS, FAN_PWM_CHAN);
    ledcWrite(FAN_ENA, 0);
    setPirLight(false);

    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init(); lcd.backlight();
    lcd.setCursor(0, 0); lcd.print("SMART HOME V4.0");
    lcd.setCursor(0, 1);
    lcd.print(networkEnabled() ? "WebSocket Mode" : "Offline Mode   ");

    dht.begin();

    SPI.begin(18, 19, 23, SS_PIN);
    rfid.PCD_Init(); delay(50);

    if (networkEnabled()) {
        // [V4.0] WiFi non-blocking, WS sẽ start khi WiFi connected (trong maintainWiFi)
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    } else {
        WiFi.mode(WIFI_OFF);
        wsConnected = false;
        wsStarted   = false;
    }

    delay(1500);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("T:--C  MOV:OFF");
    lcd.setCursor(0, 1);
    lcd.print(networkEnabled() ? "Dang ket noi..." : "Offline ready  ");
}

// ── LOOP ──────────────────────────────────────────────────────────────
void loop() {

    // [A] WiFi + WebSocket chỉ chạy ở chế độ online
    if (networkEnabled()) {
        maintainWiFi();
        wsClient.loop();  // [V4.0] xử lý WS events: nhận lệnh, heartbeat, reconnect
        pushStatusIfDirty();
        pushStatusIfPeriodicDue();
    }

    // [B] Tự động đóng cửa
    if (isDoorOpen && (millis() - doorOpenTime >= openDuration)) {
        lockDoor();
    }

    // [C] Non-blocking display timer
    if (displayUntil > 0 && millis() >= displayUntil) {
        displayUntil = 0;
        String action = pendingAction; pendingAction = "";
        if (action == "lock") {
            lockDoor();
        } else if (action == "enter_new") {
            sysState = MODE_ENTER_NEW_PASS; currentInput = "";
            lcd.clear();
            lcd.setCursor(0, 0); lcd.print("---Doi Pass---");
            lcd.setCursor(0, 1); lcd.print("Pass moi:  ");
        }
        pushStatusIfDirty();
        return;
    }

    // [D] Lockout countdown
    if (sysState == MODE_LOCKOUT) {
        long timeLeft = (long)(currentLockoutDuration -
                        (unsigned long)(millis() - lockoutStartTime)) / 1000;
        if (timeLeft <= 0) {
            failedAttempts = 0; lockDoor();
        } else {
            lcd.setCursor(0, 1);
            lcd.print("Thu lai sau:");
            lcd.print(timeLeft);
            lcd.print("s   ");
        }
        // PIR vẫn hoạt động khi lockout
        // [V4.0-F3] Respect ledManualOverride
        bool m = readMotionSensors();
        if (!ledManualOverride) {
            if (m) { setPirLight(true); pirOffTime = millis() + pirOffDelay; }
            else if (millis() >= pirOffTime) { setPirLight(false); }
        }
        updateLightEffect();
        motionDetected = m;
        flushNotify();
        pushStatusIfDirty();
        return;
    }

    if (authPending) {
        if (millis() - authRequestAt > AUTH_TIMEOUT) {
            authPending = false;
            authRequestId = "";
            authPendingTarget = "";
            lcd.setCursor(0, 1); lcd.print("Server timeout ");
            failedAuth();
            statusDirty = true;
        } else {
            flushNotify();
            pushStatusIfDirty();
            return;
        }
    }

    if (displayUntil > 0) return;

    // [E] Keypad timeout
    if (keypadActive && (millis() - lastKeyPressTime > KEYPAD_TIMEOUT)) {
        lockDoor(); pushStatusIfDirty(); return;
    }

    // ── [G] PIR ──────────────────────────────────────────────────────
    {
        bool m = readMotionSensors();

        // [V4.0-F3] Chỉ điều khiển LED tự động khi không có manual override
        if (!ledManualOverride) {
            if (m) {
                setPirLight(true);
                pirOffTime = millis() + pirOffDelay;
            } else if (millis() >= pirOffTime) {
                setPirLight(false);
            }
        }
        updateLightEffect();

        if (m && !motionPrev) {
            scheduleNotify("motion", "pir");
            if (!keypadActive && !isDoorOpen) updateLcdLine0();
            statusDirty = true;
        } else if (!m && motionPrev) {
            if (!keypadActive && !isDoorOpen) updateLcdLine0();
            statusDirty = true;
        }
        motionPrev     = m;
        motionDetected = m;
    }

    // ── [H] DHT + Quạt mỗi 2s ────────────────────────────────────────
    if (millis() - dhtTimer > DHT_INTERVAL) {
        dhtTimer = millis();

        float t = dht.readTemperature();
        float h = dht.readHumidity();
        if (!isnan(t)) temperature = t;
        if (!isnan(h)) humidity    = h;

        // [V4.0-F2] Chỉ chạy logic auto khi không ở manual mode
        if (!fanManualMode) {
            int shouldDir  = fanDir;
            int shouldDuty = fanSpeed;

            if (fanDir != 1 && temperature > fanTempOnThresh) {
                shouldDir  = 1;
                shouldDuty = calcFanDuty(temperature - fanTempOnThresh, FAN_TEMP_SCALE);
            } else if (fanDir == 1 && temperature < fanTempOnThresh - fanTempHyst) {
                shouldDir  = 0; shouldDuty = 0;
            } else if (fanDir == 1) {
                shouldDuty = calcFanDuty(temperature - fanTempOnThresh, FAN_TEMP_SCALE);
            } else if (fanDir != -1 && humidity > 0.0f && humidity < fanHumOnThresh) {
                shouldDir  = -1;
                shouldDuty = calcFanDuty(fanHumOnThresh - humidity, FAN_HUM_SCALE);
            } else if (fanDir == -1 && humidity > fanHumOnThresh + fanHumHyst) {
                shouldDir  = 0; shouldDuty = 0;
            } else if (fanDir == -1 && humidity > 0.0f) {
                shouldDuty = calcFanDuty(fanHumOnThresh - humidity, FAN_HUM_SCALE);
            }

            bool dirChanged  = (shouldDir  != fanDir);
            bool dutyChanged = (shouldDuty != fanSpeed) && (fanDir != 0);
            if (dirChanged || dutyChanged) {
                setFan(shouldDir, shouldDuty);
                if (dirChanged) {
                    if (shouldDir == 1)       scheduleNotify("fan", "heat_fwd");
                    else if (shouldDir == -1)  scheduleNotify("fan", "hum_rev");
                    else                       scheduleNotify("fan", "off");
                }
            }
        }

        markSensorStatusDirtyIfNeeded();
        pushStatusIfDirty();
        pushStatusIfPeriodicDue();

        // LCD idle update
        if (!isDoorOpen && !keypadActive && !garaOpen) {
            if (millis() - lcdIdleTimer > 3000) {
                lcdIdleTimer = millis();
                lcdLine2Alt  = !lcdLine2Alt;
            }
            updateLcdLine0();
            lcd.setCursor(0, 1);
            if (lcdLine2Alt) {
                lcd.print(garaOpen ? "Gara:MO " : "Gara:CLS");
                if (fanDir != 0) {
                    char spd[9]; int pct = fanDutyToPercent();
                    snprintf(spd, sizeof(spd), "%c:%3d%%", fanDir == 1 ? 'F' : 'R', pct);
                    lcd.print(spd);
                } else { lcd.print(" Fan:OF"); }
            } else {
                lcd.print("PIN/The de vao  ");
            }
        }
    }

    // ── [I] Siêu âm Gara (throttle 100ms) ───────────────────────────
    if (millis() - sonarTimer > SONAR_INTERVAL) {
        sonarTimer = millis();
        long dist  = getDist();
        if (!statusSnapshotReady || distanceChangedEnough(dist, lastSentDistanceCm)) {
            statusDirty = true;
        }
        lastDistanceCm = dist;

        // Mở gara từ siêu âm (phát hiện xe áp sát)
        if (!garaManualMode && !isDoorOpen && dist > 0 && dist <= GARA_DIST_THRESH) {
            if (!garaOpen) {
                openGarage("ultrasonic");
            } else {
                garaOpenTime = millis();
            }
        } else if (!garaManualMode && garaOpen && (millis() - garaOpenTime > GARA_CLOSE_DELAY)) {
            closeGarage("auto");
        }

        // Fast-close
        if (isDoorOpen && doorByAuth) {
            static const int SONAR_CONFIRM_NEEDED = 3;
            if (!doorPassDetected && dist > 0 && dist <= GARA_DIST_THRESH) {
                sonarConfirmCount++;
                if (sonarConfirmCount >= SONAR_CONFIRM_NEEDED) {
                    doorPassDetected  = true;
                    sonarConfirmCount = 0;
                }
            } else if (dist > GARA_DIST_THRESH || dist < 0) {
                sonarConfirmCount = 0;
                if (doorPassDetected) {
                    openDuration     = DOOR_FAST_CLOSE;
                    doorOpenTime     = millis();
                    doorPassDetected = false;
                    scheduleNotify("door_fastclose", "sonar");
                }
            }
        }
        pushStatusIfDirty();
    }

    // ── [J] RFID ─────────────────────────────────────────────────────
    if (!isDoorOpen && sysState != MODE_LOCKOUT
        && rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
        char cardUID[16] = "";
        for (byte i = 0; i < rfid.uid.size; i++) {
            char buf[4];
            snprintf(buf, sizeof(buf), i == 0 ? "%02X" : " %02X", rfid.uid.uidByte[i]);
            strncat(cardUID, buf, sizeof(cardUID) - strlen(cardUID) - 1);
        }
        String uidString = String(cardUID);
        if (networkEnabled() && wsConnected) {
            sendAuthRequest("rfid", uidString, "any");
        } else if (strcmp(cardUID, mainDoorCardUID) == 0) {
            triggerOpenDoor("The Tu");
        } else if (strcmp(cardUID, garageCardUID) == 0) {
            garaManualMode = true;
            openGarage("The Gara");
        } else {
            lcd.setCursor(0, 1); lcd.print("The khong hop le");
            failedAuth();
        }
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        flushNotify();
        pushStatusIfDirty();
        return;
    }

    // ── [K] Keypad ────────────────────────────────────────────────────
    char key = keypad.getKey();
    if (!key || isDoorOpen) { flushNotify(); pushStatusIfDirty(); return; }

    lastKeyPressTime = millis();
    keypadActive     = true;

    if (sysState == MODE_NORMAL && currentInput.length() == 0
        && key != '#' && key != '*') {
        lcd.setCursor(0, 1); lcd.print("PIN:            ");
    }

    switch (sysState) {
        case MODE_NORMAL:           handleKeyModeNormal(key);   break;
        case MODE_CHECK_OLD_PASS:   handleKeyModeCheckOld(key); break;
        case MODE_ENTER_NEW_PASS:   handleKeyModeEnterNew(key); break;
        case MODE_CONFIRM_NEW_PASS: handleKeyModeConfirm(key);  break;
        default: break;
    }

    flushNotify();
    pushStatusIfDirty();
}
