# Hướng dẫn Lắp đặt và Vận hành Smart Home ESP32 - Phiên bản Hoàn chỉnh

Tài liệu mô tả chi tiết sơ đồ đấu nối và kịch bản vận hành logic của hệ thống Nhà thông minh sử dụng ESP32. Phiên bản này đã được tối ưu hóa tài nguyên phần cứng và thiết lập các kịch bản tự động hóa thực tế.

## 1. Sơ đồ đấu nối chi tiết (Master Pinmap)

### 1.1. Hệ thống Hiển thị & Bảo mật
* **LCD 16x2 (I2C):** Kết nối chân SDA -> D21, SCL -> D22. Hiển thị thông tin môi trường và trạng thái hệ thống.
* **RFID RC522 (SPI):** SCK -> D18, MISO -> D19, MOSI -> D23, CS -> D5. Chân RST nối vào 3.3V. Dùng chung 1 module để kiểm soát ra vào.
* **Keypad 4x3:** 
  * 4 chân Hàng (Rows): D26, D32, D33, D25.
  * 3 chân Cột (Cols): D12, D16 (RX2), D2.

### 1.2. Hệ thống Cảm biến (Input)
* **DHT11/22:** Chân tín hiệu nối vào D36 (VP). 
* **02 PIR (Hồng ngoại):** Đặt ở 2 đầu hành lang. Chân Out nối vào D34 và D35.
* **Siêu âm HC-SR04:** 
  * Chân Trig -> D4.
  * Chân Echo (5V) -> Điện trở 1kΩ -> D39 (VN). Tại D39 nối thêm điện trở 2kΩ xuống GND (Mạch chia áp bảo vệ ESP32).
* **Quang trở XH-M131:** Đấu nối nguồn 5V độc lập, điều khiển đèn sân vườn.

### 1.3. Hệ thống Chấp hành (Output)
* **Servo Gara:** Tín hiệu nối vào D15.
* **Servo Cửa chính:** Tín hiệu nối vào TX2 (17).
* **LED Hành lang:** Nối vào D14.
* **Buzzer (Loa):** Nối vào D27.
* **Quạt thông gió (Qua mạch cầu H L298N):**
  * IN1 nối vào D13.
  * IN2 nối vào TX0 (D1).
  * ENA (Điều khiển tốc độ) nối vào RX0 (D3).

---

## 2. Kịch bản Vận hành Logic (Smart Logic)

Hệ thống hoạt động đa nhiệm với các kịch bản cụ thể như sau:

### 2.1. Quản lý Ra/Vào Gara & Cửa chính
* **Đi từ ngoài vào (Dùng RFID/Keypad):**
  * Quẹt thẻ từ hợp lệ, Servo Gara (hoặc cửa) mở.
  * Cửa tự động đóng lại sau **5 giây**.
  * **Trường hợp tối ưu:** Nếu cảm biến siêu âm phát hiện xe/người đã đi qua thành công, cửa sẽ lập tức đóng lại sau **1 giây** mà không cần chờ hết 5 giây.
* **Đi từ trong ra (Dùng Siêu âm):**
  * Cảm biến siêu âm phát hiện vật thể ở khoảng cách `< 5cm`, Servo Gara mở.
  * Cửa sẽ giữ trạng thái mở chừng nào vật thể còn trong vùng 5cm.
  * Khi vật thể rời đi (khoảng cách > 5cm), cửa tự động đóng lại sau **5 giây**.

### 2.2. Hệ thống Chiếu sáng & An ninh Hành lang
* **Chiếu sáng tự động:** Hai cảm biến PIR giám sát hai đầu hành lang. Nếu **1 trong 2** cảm biến phát hiện chuyển động, LED tại chân D14 bật sáng.
* **Tiết kiệm năng lượng:** Sau khi không còn nhận diện chuyển động nào, LED D14 duy trì sáng trong **5 giây** rồi tự động tắt.
* **Chiếu sáng sân vườn (Độc lập):** Module XH-M131 tự động đóng relay bật đèn khi trời tắt nắng và tắt đèn khi có nắng, không phụ thuộc vào code ESP32.

### 2.3. Điều hòa Không khí (Smart Fan)
* Màn hình LCD luôn hiển thị nhiệt độ (°C) và độ ẩm (%) theo thời gian thực từ DHT.
* **Hút gió mát vào:** Khi nhiệt độ phòng vượt quá ngưỡng cài đặt (VD: > 35°C), L298N điều khiển quạt quay chiều thuận để hút gió vào làm mát.
* **Đẩy hơi ẩm ra:** Khi độ ẩm xuống dưới ngưỡng cài đặt (VD: < 40%), L298N đảo chiều dòng điện (đổi logic IN1/IN2), quạt quay chiều ngược lại để đẩy không khí ra ngoài.

### 2.4. Phản hồi Âm thanh (Buzzer Events)
Loa sẽ phát ra các dải âm thanh khác nhau để phản hồi sự kiện thực tế:
* **Bíp ngắn:** Khi nhấn phím Keypad hoặc PIR phát hiện người.
* **Bíp dài/Vui tai:** Quẹt thẻ đúng, nhập đúng mật khẩu, hoặc cửa bắt đầu mở.
* **Tiếng trầm/Cảnh báo:** Quẹt thẻ sai, sai mật khẩu, hoặc nhiệt độ quá cao.

---

## 3. Lưu ý An toàn Phần cứng
1. **Chia sẻ GND:** Bắt buộc nối chung chân âm (GND) của nguồn ngoài (5V-3A), mạch L298N, các Servo và ESP32 để đồng bộ điện áp tín hiệu.
2. **Nguồn cấp:** Cấp nguồn ngoài cho L298N và Servo. Không lấy nguồn 5V từ chân VIN của ESP32 để nuôi động cơ, tránh gây sụt áp và reset vi điều khiển.