#include <Arduino.h>

// ======================================================
// ESP32 DC MOTOR TEST
// Driver: L298N / L293D / module dieu khien DC tuong tu
// IN1 = GPIO13
// IN2 = GPIO23
// ENA = GPIO22
// ======================================================

// ================== MOTOR PINOUT ==================
#define MOTOR_IN1 13
#define MOTOR_IN2 23 // Đây chỉ là pin test, đổi thành GPIO1 khi chạy trong code chính thức
#define MOTOR_ENA 22 // Đây chỉ là pin test, đổi thành GPIO3 khi chạy trong code chính thức

// ================== PWM CONFIG ==================
#define PWM_FREQ 1000
#define PWM_BITS 8

// Nếu module của bạn bị ngược tốc độ:
// speed 255 -> dừng, speed 0 -> tối đa
// thì để true.
// Nếu module bình thường thì đổi thành false.
#define INVERT_PWM false

// ================== STATE ==================
int motorSpeed = 180;     // 0 - 255
int motorDir = 0;         // 0 = stop, 1 = forward, -1 = reverse

// ================== MENU ==================
void printMenu() {
  Serial.println();
  Serial.println("========== ESP32 DC MOTOR TEST ==========");
  Serial.println("help        : Hien menu");
  Serial.println("fwd         : Quay thuan");
  Serial.println("rev         : Quay nguoc");
  Serial.println("off         : Tat dong co");
  Serial.println("brake       : Ham dong co");
  Serial.println("speed 0     : Toc do 0, dung motor");
  Serial.println("speed 80    : Toc do cham");
  Serial.println("speed 150   : Toc do trung binh");
  Serial.println("speed 255   : Toc do toi da");
  Serial.println("test        : Test tu dong thuan/nguoc nhieu toc do");
  Serial.println("status      : Xem trang thai hien tai");
  Serial.println("=========================================");
  Serial.println();
}

// ================== PWM WRITE ==================
void writeMotorPWM(int speedValue) {
  speedValue = constrain(speedValue, 0, 255);

  int pwmOut;

  if (INVERT_PWM) {
    pwmOut = 255 - speedValue;
  } else {
    pwmOut = speedValue;
  }

  ledcWrite(MOTOR_ENA, pwmOut);
}

// ================== MOTOR LOW LEVEL ==================
void motorCoastStop() {
  // Dừng thả trôi
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);

  // Với module bị đảo PWM, speed 0 sẽ được chuyển thành mức PWM phù hợp
  writeMotorPWM(0);

  motorDir = 0;

  Serial.println("[MOTOR] Da tat dong co.");
}

void motorBrake() {
  // Phanh điện, một số driver hỗ trợ tốt, một số module thì hiệu quả tùy loại
  digitalWrite(MOTOR_IN1, HIGH);
  digitalWrite(MOTOR_IN2, HIGH);

  writeMotorPWM(255);

  motorDir = 0;

  Serial.println("[MOTOR] Da ham dong co.");
}

// ================== APPLY MOTOR ==================
void applyMotor() {
  motorSpeed = constrain(motorSpeed, 0, 255);

  // Quan trọng:
  // Nếu speed = 0 thì tắt hẳn IN1/IN2, không giữ chiều quay.
  // Điều này tránh lỗi speed 0 mà motor vẫn chạy.
  if (motorSpeed == 0 || motorDir == 0) {
    motorCoastStop();
    return;
  }

  if (motorDir == 1) {
    digitalWrite(MOTOR_IN1, HIGH);
    digitalWrite(MOTOR_IN2, LOW);
    writeMotorPWM(motorSpeed);

    Serial.print("[MOTOR] Quay thuan, speed = ");
    Serial.println(motorSpeed);
  }
  else if (motorDir == -1) {
    digitalWrite(MOTOR_IN1, LOW);
    digitalWrite(MOTOR_IN2, HIGH);
    writeMotorPWM(motorSpeed);

    Serial.print("[MOTOR] Quay nguoc, speed = ");
    Serial.println(motorSpeed);
  }
}

// ================== MOTOR COMMANDS ==================
void motorForward() {
  if (motorSpeed == 0) {
    motorSpeed = 180;
    Serial.println("[MOTOR] Speed dang = 0, tu dong dat ve 180.");
  }

  motorDir = 1;
  applyMotor();
}

void motorReverse() {
  if (motorSpeed == 0) {
    motorSpeed = 180;
    Serial.println("[MOTOR] Speed dang = 0, tu dong dat ve 180.");
  }

  motorDir = -1;
  applyMotor();
}

void setMotorSpeed(int value) {
  if (value < 0 || value > 255) {
    Serial.println("[ERROR] Toc do phai tu 0 den 255.");
    return;
  }

  motorSpeed = value;

  Serial.print("[MOTOR] Da dat speed = ");
  Serial.println(motorSpeed);

  if (motorSpeed == 0) {
    motorCoastStop();
    return;
  }

  if (motorDir != 0) {
    applyMotor();
  } else {
    Serial.println("[MOTOR] Dong co dang tat. Go fwd hoac rev de chay.");
  }
}

void printStatus() {
  Serial.println();
  Serial.println("========== MOTOR STATUS ==========");

  Serial.print("Direction: ");
  if (motorDir == 1) {
    Serial.println("FORWARD");
  } else if (motorDir == -1) {
    Serial.println("REVERSE");
  } else {
    Serial.println("OFF");
  }

  Serial.print("Speed: ");
  Serial.println(motorSpeed);

  Serial.print("INVERT_PWM: ");
  Serial.println(INVERT_PWM ? "true" : "false");

  Serial.print("IN1 GPIO: ");
  Serial.println(MOTOR_IN1);

  Serial.print("IN2 GPIO: ");
  Serial.println(MOTOR_IN2);

  Serial.print("ENA GPIO: ");
  Serial.println(MOTOR_ENA);

  Serial.println("==================================");
  Serial.println();
}

// ================== AUTO TEST ==================
void autoTestMotor() {
  Serial.println("[TEST] Bat dau test dong co DC...");

  int speeds[] = {80, 120, 180, 220, 255};
  int count = sizeof(speeds) / sizeof(speeds[0]);

  Serial.println("[TEST] Quay thuan voi nhieu toc do...");

  motorDir = 1;

  for (int i = 0; i < count; i++) {
    motorSpeed = speeds[i];
    applyMotor();
    delay(2000);
  }

  motorCoastStop();
  delay(1000);

  Serial.println("[TEST] Quay nguoc voi nhieu toc do...");

  motorDir = -1;

  for (int i = 0; i < count; i++) {
    motorSpeed = speeds[i];
    applyMotor();
    delay(2000);
  }

  motorCoastStop();

  Serial.println("[TEST] Test xong.");
}

// ================== COMMAND HANDLER ==================
void handleCommand(String cmd) {
  cmd.trim();
  cmd.toLowerCase();

  if (cmd == "help") {
    printMenu();
  }
  else if (cmd == "fwd") {
    motorForward();
  }
  else if (cmd == "rev") {
    motorReverse();
  }
  else if (cmd == "off") {
    motorCoastStop();
  }
  else if (cmd == "brake") {
    motorBrake();
  }
  else if (cmd == "test") {
    autoTestMotor();
  }
  else if (cmd == "status") {
    printStatus();
  }
  else if (cmd.startsWith("speed")) {
    int spaceIndex = cmd.indexOf(' ');

    if (spaceIndex == -1) {
      Serial.println("[ERROR] Dung cu phap: speed 180");
      return;
    }

    String valueText = cmd.substring(spaceIndex + 1);
    valueText.trim();

    int value = valueText.toInt();
    setMotorSpeed(value);
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
  Serial.println("ESP32 DC MOTOR TEST - CLEAN VERSION");
  Serial.println("IN1 = GPIO13");
  Serial.println("IN2 = GPIO23");
  Serial.println("ENA = GPIO22");

  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);

  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);

  // ESP32 Arduino Core 3.x
  ledcAttach(MOTOR_ENA, PWM_FREQ, PWM_BITS);

  motorSpeed = 0;
  motorDir = 0;
  motorCoastStop();

  printMenu();
}

// ================== LOOP ==================
void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    handleCommand(cmd);
  }
}
