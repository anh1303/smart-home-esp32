#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <Keypad.h>
#include <DHT.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>

// ======================================================
// ESP32 SMART HOME - SERIAL COMPONENT TEST
// DC motor va buzzer da bo khoi code test tong
// DHT  -> GPIO27
// LED  -> GPIO2
// IR1  -> GPIO34
// IR2  -> GPIO35
// Keypad cot 3 -> GPIO14
// Động cơ DC được tháo ra để test serial, đầy đủ sẽ có thêm ENA cắm GPIO3, INPUT2 cắm GPIO1, INPUT1 cắm GPIO13
// ======================================================

// ================== WIFI ==================
const char *WIFI_SSID     = "Quepa4";
const char *WIFI_PASSWORD = "999999999";

// ================== PINOUT ==================
#define I2C_SDA        21
#define I2C_SCL        22

#define SS_PIN          5
#define RST_PIN        -1

#define SERVO_DOOR     17
#define SERVO_GARA     15

#define DHTPIN         27
#define DHTTYPE        DHT11

#define IR1_PIN        34
#define IR2_PIN        35

#define ECHO_PIN       39
#define TRIG_PIN        4

#define LED_PIR         2

// ================== SERVO ANGLES ==================
// Door: 90 = dong, 0 = mo
#define DOOR_CLOSE_ANGLE 90
#define DOOR_OPEN_ANGLE  0

// Gara: 0 = mo, 90 = dong
#define GARA_OPEN_ANGLE  0
#define GARA_CLOSE_ANGLE 90

#define SERVO_MIN_US 500
#define SERVO_MAX_US 2400

// ================== KEYPAD ==================
const byte ROWS = 4;
const byte COLS = 3;

char keys[ROWS][COLS] = {
  {'1','2','3'},
  {'4','5','6'},
  {'7','8','9'},
  {'*','0','#'}
};

byte rowPins[ROWS] = {26, 32, 33, 25};
byte colPins[COLS] = {12, 16, 14};

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ================== OBJECTS ==================
LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522 rfid(SS_PIN, RST_PIN);
DHT dht(DHTPIN, DHTTYPE);

Servo servoDoor;
Servo servoGara;

// ================== STATE ==================
int doorAngle = DOOR_CLOSE_ANGLE;
int garaAngle = GARA_CLOSE_ANGLE;

// ================== MENU ==================
void printMenu() {
  Serial.println();
  Serial.println("========== ESP32 SMART HOME TEST MENU ==========");
  Serial.println("help             : Hien menu");

  Serial.println();
  Serial.println("[LCD]");
  Serial.println("lcd              : Test LCD I2C");

  Serial.println();
  Serial.println("[LED]");
  Serial.println("led_on           : Bat LED GPIO2");
  Serial.println("led_off          : Tat LED GPIO2");
  Serial.println("led_blink        : Nhap nhay LED GPIO2");

  Serial.println();
  Serial.println("[SERVO]");
  Serial.println("door             : Test door dong/mo/dong");
  Serial.println("door_open        : Mo cua");
  Serial.println("door_close       : Dong cua");
  Serial.println("door_angle 45    : Dat door den goc bat ky");
  Serial.println("gara             : Test gara dong/mo/dong");
  Serial.println("gara_open        : Mo gara");
  Serial.println("gara_close       : Dong gara");
  Serial.println("gara_angle 45    : Dat gara den goc bat ky");
  Serial.println("servo_both       : Test ca 2 servo");
  Serial.println("servo_status     : Xem goc 2 servo");

  Serial.println();
  Serial.println("[SENSOR]");
  Serial.println("dht              : Doc DHT11 GPIO27");
  Serial.println("ir               : Doc IR1/IR2 trong 10 giay");
  Serial.println("sonar            : Doc sieu am 10 lan");
  Serial.println("rfid             : Quet RFID trong 15 giay");
  Serial.println("keypad           : Test keypad trong 15 giay");

  Serial.println();
  Serial.println("[WIFI]");
  Serial.println("wifi             : Test ket noi WiFi");
  Serial.println("================================================");
  Serial.println();
}

// ================== LCD ==================
void testLCD() {
  Serial.println("[LCD] Dang test LCD...");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("LCD TEST OK");
  lcd.setCursor(0, 1);
  lcd.print("Serial Ready");

  Serial.println("[LCD] Neu man hinh hien chu thi LCD OK.");
}

// ================== LED ==================
void ledBlink() {
  Serial.println("[LED] Blink 5 lan...");

  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_PIR, HIGH);
    delay(300);
    digitalWrite(LED_PIR, LOW);
    delay(300);
  }

  Serial.println("[LED] Test xong.");
}

// ================== SERVO ==================
void setDoorAngle(int angle) {
  angle = constrain(angle, 0, 180);
  doorAngle = angle;
  servoDoor.write(doorAngle);

  Serial.print("[DOOR] Angle = ");
  Serial.println(doorAngle);
}

void setGaraAngle(int angle) {
  angle = constrain(angle, 0, 180);
  garaAngle = angle;
  servoGara.write(garaAngle);

  Serial.print("[GARA] Angle = ");
  Serial.println(garaAngle);
}

void doorOpen() {
  Serial.print("[DOOR] Mo cua: ");
  Serial.print(DOOR_OPEN_ANGLE);
  Serial.println(" do");
  setDoorAngle(DOOR_OPEN_ANGLE);
}

void doorClose() {
  Serial.print("[DOOR] Dong cua: ");
  Serial.print(DOOR_CLOSE_ANGLE);
  Serial.println(" do");
  setDoorAngle(DOOR_CLOSE_ANGLE);
}

void garaOpen() {
  Serial.print("[GARA] Mo gara: ");
  Serial.print(GARA_OPEN_ANGLE);
  Serial.println(" do");
  setGaraAngle(GARA_OPEN_ANGLE);
}

void garaClose() {
  Serial.print("[GARA] Dong gara: ");
  Serial.print(GARA_CLOSE_ANGLE);
  Serial.println(" do");
  setGaraAngle(GARA_CLOSE_ANGLE);
}

void testDoorServo() {
  Serial.println("[DOOR] Test: dong -> mo -> dong");

  doorClose();
  delay(1000);

  doorOpen();
  delay(1000);

  doorClose();
  delay(1000);

  Serial.println("[DOOR] Test xong.");
}

void testGaraServo() {
  Serial.println("[GARA] Test: dong -> mo -> dong");

  garaClose();
  delay(1000);

  garaOpen();
  delay(1000);

  garaClose();
  delay(1000);

  Serial.println("[GARA] Test xong.");
}

void testBothServo() {
  Serial.println("[SERVO] Test ca 2 servo...");

  Serial.println("[SERVO] Trang thai dong");
  doorClose();
  garaClose();
  delay(1000);

  Serial.println("[SERVO] Trang thai mo");
  doorOpen();
  garaOpen();
  delay(1000);

  Serial.println("[SERVO] Ve trang thai dong");
  doorClose();
  garaClose();
  delay(1000);

  Serial.println("[SERVO] Test xong.");
}

void printServoStatus() {
  Serial.println();
  Serial.println("========== SERVO STATUS ==========");
  Serial.print("Door GPIO: ");
  Serial.println(SERVO_DOOR);
  Serial.print("Door angle: ");
  Serial.println(doorAngle);
  Serial.print("Door close angle: ");
  Serial.println(DOOR_CLOSE_ANGLE);
  Serial.print("Door open angle: ");
  Serial.println(DOOR_OPEN_ANGLE);

  Serial.print("Gara GPIO: ");
  Serial.println(SERVO_GARA);
  Serial.print("Gara angle: ");
  Serial.println(garaAngle);
  Serial.print("Gara close angle: ");
  Serial.println(GARA_CLOSE_ANGLE);
  Serial.print("Gara open angle: ");
  Serial.println(GARA_OPEN_ANGLE);
  Serial.println("==================================");
  Serial.println();
}

// ================== DHT ==================
void testDHT() {
  Serial.println("[DHT] Dang doc DHT11 o GPIO27...");

  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    Serial.println("[DHT] Loi doc DHT!");
    Serial.println("[DHT] Kiem tra: DATA -> GPIO27, VCC, GND.");
    Serial.println("[DHT] Neu la DHT 4 chan roi, can dien tro keo len 4.7k-10k giua DATA va VCC.");
    return;
  }

  Serial.print("[DHT] Nhiet do: ");
  Serial.print(t);
  Serial.println(" *C");

  Serial.print("[DHT] Do am: ");
  Serial.print(h);
  Serial.println(" %");
}

// ================== IR ==================
void printIRState(const char *name, int value) {
  Serial.print(name);
  Serial.print(" = ");
  Serial.print(value);

  if (value == 1) {
    Serial.print(" | Khong co vat");
  } else {
    Serial.print(" | Co vat");
  }
}

void testIR() {
  Serial.println("[IR] Doc IR1 GPIO34 va IR2 GPIO35 trong 10 giay...");
  Serial.println("[IR] Theo module cua ban: 1 = khong co vat, 0 = co vat.");

  unsigned long start = millis();

  while (millis() - start < 10000) {
    int ir1 = digitalRead(IR1_PIN);
    int ir2 = digitalRead(IR2_PIN);

    Serial.print("[IR] ");
    printIRState("IR1", ir1);
    Serial.print(" || ");
    printIRState("IR2", ir2);
    Serial.println();

    delay(300);
  }

  Serial.println("[IR] Test xong.");
}

// ================== SONAR ==================
long getDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 25000);

  if (duration == 0) {
    return -1;
  }

  return duration * 0.034 / 2;
}

void testSonar() {
  Serial.println("[SONAR] Doc khoang cach 10 lan...");

  for (int i = 0; i < 10; i++) {
    long d = getDistanceCm();

    Serial.print("[SONAR] Distance = ");

    if (d < 0) {
      Serial.println("Khong doc duoc");
    } else {
      Serial.print(d);
      Serial.println(" cm");
    }

    delay(500);
  }

  Serial.println("[SONAR] Test xong.");
}

// ================== RFID ==================
void testRFID() {
  Serial.println("[RFID] Init lai RFID...");
  rfid.PCD_Init();
  delay(100);

  Serial.println("[RFID] Hay dua the RFID vao dau doc trong 15 giay...");

  unsigned long start = millis();

  while (millis() - start < 15000) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      Serial.print("[RFID] UID: ");

      for (byte i = 0; i < rfid.uid.size; i++) {
        if (rfid.uid.uidByte[i] < 0x10) {
          Serial.print("0");
        }

        Serial.print(rfid.uid.uidByte[i], HEX);

        if (i < rfid.uid.size - 1) {
          Serial.print(" ");
        }
      }

      Serial.println();

      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();

      Serial.println("[RFID] Doc the thanh cong.");
      return;
    }

    delay(10);
  }

  Serial.println("[RFID] Het thoi gian, khong thay the.");
}

// ================== KEYPAD ==================
void testKeypad() {
  Serial.println("[KEYPAD] Nhan phim bat ky trong 15 giay...");
  Serial.println("[KEYPAD] Moi phim nhan duoc se hien tren Serial.");
  Serial.println("[KEYPAD] Pin: rows = 26,32,33,25 | cols = 12,16,14");

  unsigned long start = millis();

  while (millis() - start < 15000) {
    char key = keypad.getKey();

    if (key) {
      Serial.print("[KEYPAD] Key = ");
      Serial.println(key);
    }

    delay(10);
  }

  Serial.println("[KEYPAD] Test xong.");
}

// ================== WIFI ==================
void testWiFi() {
  Serial.println("[WIFI] Dang ket noi WiFi...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    Serial.print(".");
    delay(500);
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] Ket noi thanh cong.");
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WIFI] Ket noi that bai.");
  }
}

// ================== COMMAND HANDLER ==================
void handleCommand(String cmd) {
  cmd.trim();
  cmd.toLowerCase();

  if (cmd == "help") {
    printMenu();
  }

  else if (cmd == "lcd") {
    testLCD();
  }

  else if (cmd == "led_on") {
    digitalWrite(LED_PIR, HIGH);
    Serial.println("[LED] Da bat LED GPIO2.");
  }
  else if (cmd == "led_off") {
    digitalWrite(LED_PIR, LOW);
    Serial.println("[LED] Da tat LED GPIO2.");
  }
  else if (cmd == "led_blink") {
    ledBlink();
  }

  else if (cmd == "door") {
    testDoorServo();
  }
  else if (cmd == "door_open") {
    doorOpen();
  }
  else if (cmd == "door_close") {
    doorClose();
  }
  else if (cmd.startsWith("door_angle")) {
    int spaceIndex = cmd.indexOf(' ');

    if (spaceIndex == -1) {
      Serial.println("[ERROR] Dung cu phap: door_angle 90");
      return;
    }

    int angle = cmd.substring(spaceIndex + 1).toInt();
    setDoorAngle(angle);
  }

  else if (cmd == "gara") {
    testGaraServo();
  }
  else if (cmd == "gara_open") {
    garaOpen();
  }
  else if (cmd == "gara_close") {
    garaClose();
  }
  else if (cmd.startsWith("gara_angle")) {
    int spaceIndex = cmd.indexOf(' ');

    if (spaceIndex == -1) {
      Serial.println("[ERROR] Dung cu phap: gara_angle 90");
      return;
    }

    int angle = cmd.substring(spaceIndex + 1).toInt();
    setGaraAngle(angle);
  }

  else if (cmd == "servo_both") {
    testBothServo();
  }
  else if (cmd == "servo_status") {
    printServoStatus();
  }

  else if (cmd == "dht") {
    testDHT();
  }
  else if (cmd == "ir") {
    testIR();
  }
  else if (cmd == "sonar") {
    testSonar();
  }
  else if (cmd == "rfid") {
    testRFID();
  }
  else if (cmd == "keypad") {
    testKeypad();
  }

  else if (cmd == "wifi") {
    testWiFi();
  }

  else if (cmd.length() == 0) {
    // Bo qua dong trong
  }

  else {
    Serial.print("[ERROR] Lenh khong hop le: ");
    Serial.println(cmd);
    Serial.println("Go 'help' de xem danh sach lenh.");
  }
}

// ================== SETUP ==================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32 SMART HOME SERIAL TEST");
  Serial.println("DC motor va buzzer da duoc bo khoi code test tong.");
  Serial.println("DHT11 DATA = GPIO27");
  Serial.println("LED = GPIO2");
  Serial.println("IR1 OUT = GPIO34");
  Serial.println("IR2 OUT = GPIO35");
  Serial.println("Keypad cols = GPIO12, GPIO16, GPIO14");
  Serial.println("Servo rule:");
  Serial.print("Door close=");
  Serial.print(DOOR_CLOSE_ANGLE);
  Serial.print(" open=");
  Serial.println(DOOR_OPEN_ANGLE);
  Serial.print("Gara close=");
  Serial.print(GARA_CLOSE_ANGLE);
  Serial.print(" open=");
  Serial.println(GARA_OPEN_ANGLE);

  pinMode(LED_PIR, OUTPUT);
  digitalWrite(LED_PIR, LOW);

  pinMode(IR1_PIN, INPUT);
  pinMode(IR2_PIN, INPUT);

  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);

  pinMode(ECHO_PIN, INPUT);

  // ----- SERVO -----
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);

  servoDoor.setPeriodHertz(50);
  servoGara.setPeriodHertz(50);

  servoDoor.attach(SERVO_DOOR, SERVO_MIN_US, SERVO_MAX_US);
  servoGara.attach(SERVO_GARA, SERVO_MIN_US, SERVO_MAX_US);

  doorClose();
  garaClose();

  // ----- LCD I2C -----
  Wire.begin(I2C_SDA, I2C_SCL);

  lcd.init();
  lcd.backlight();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("TEST MODE");
  lcd.setCursor(0, 1);
  lcd.print("IR 34/35");

  // ----- DHT -----
  dht.begin();

  // ----- RFID -----
  SPI.begin(18, 19, 23, SS_PIN);
  rfid.PCD_Init();

  delay(500);

  printMenu();
}

// ================== LOOP ==================
void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    handleCommand(cmd);
  }
}
