# Tài liệu ngữ cảnh và đặc tả chức năng hệ thống SmartHome ESP32

**Mục đích sử dụng:** Tài liệu này tổng hợp ngữ cảnh, đánh giá và danh sách chức năng cuối cho hệ thống SmartHome dùng ESP32. File có thể dùng làm ngữ cảnh cho Codex, làm cơ sở viết báo cáo, thiết kế server Node.js, xây dựng dashboard và triển khai database Firebase.

---

## 1. Tổng quan hệ thống

Hệ thống SmartHome được xây dựng theo mô hình nhà thông minh sử dụng ESP32 làm bộ điều khiển trung tâm. ESP32 kết nối với các cảm biến, thiết bị chấp hành và server Node.js thông qua WebSocket để vừa xử lý tự động tại chỗ, vừa gửi dữ liệu lên dashboard phục vụ giám sát, điều khiển và thống kê.

Hệ thống được thiết kế theo hướng vừa có khả năng chạy online, vừa duy trì các chức năng thiết yếu khi mất kết nối mạng. Các thao tác như xác thực thẻ RFID, nhập mật khẩu, tự động mở gara, bật/tắt đèn hành lang và điều khiển quạt môi trường cần được xử lý local trên ESP32. Server chủ yếu đóng vai trò quản lý cấu hình, hiển thị dashboard, lưu log, thống kê và đồng bộ dữ liệu.

### 1.1. Các nhóm chức năng chính

- **Access Control:** Quản lý cửa chính, gara, keypad, RFID, phân quyền thẻ/mật khẩu, chống dò truy cập.
- **Garage Automation:** Tự động mở gara khi xe từ bên trong tiến lại gần cảm biến siêu âm, hỗ trợ điều khiển từ web app.
- **Smart Lighting:** Tự động bật/tắt đèn hành lang bằng 2 cảm biến IR, hỗ trợ chế độ thủ công và hiệu ứng LED.
- **Environment Control:** Đo nhiệt độ/độ ẩm bằng DHT11, điều khiển quạt DC theo ngưỡng môi trường.
- **Monitoring & Data Platform:** WebSocket realtime, dashboard, lưu lịch sử, biểu đồ, event timeline và đồng bộ offline/online.

---

## 2. Đánh giá bản mô tả chức năng

Bản mô tả chức năng hiện tại có định hướng tốt, thực tế và phù hợp với phần cứng đang có. Điểm mạnh nhất là hệ thống không chỉ dừng ở mức điều khiển thiết bị đơn lẻ, mà đã chuyển sang mô hình có logic phân quyền, log sự kiện, thống kê dữ liệu và tự động hóa theo ngữ cảnh.

### 2.1. Điểm mạnh

- **Tận dụng tốt phần cứng hiện có:** Keypad, RFID, 2 servo, cảm biến siêu âm, 2 cảm biến IR, DHT11, động cơ DC và LED đều có vai trò rõ ràng.
- **Có tính ứng dụng thực tế:** Các tình huống như cấp thẻ cho người giúp việc, mật khẩu tạm thời, tự mở gara khi xe đi ra, bật đèn hành lang khi có người đều gần với nhu cầu nhà ở thực tế.
- **Có tư duy phân quyền:** RFID và mật khẩu không chỉ dùng để mở cửa, mà có quyền, tên, thời hạn và khung giờ truy cập.
- **Có bảo mật cơ bản:** Có chống nhập sai nhiều lần, khóa tạm thời, tăng thời gian chờ và cho phép chủ nhà mở khóa từ web app.
- **Có định hướng dữ liệu:** Log truy cập, log bật đèn, log quạt, dữ liệu nhiệt độ/độ ẩm và event timeline giúp hệ thống có cơ sở để thống kê và viết báo cáo.
- **Phù hợp với kiến trúc Node.js + Firebase:** Node.js xử lý WebSocket/API tốt, Firebase phù hợp để lưu realtime state, cấu hình, log và dữ liệu cảm biến.

### 2.2. Điểm cần làm rõ khi triển khai

- **Trạng thái cửa/gara là trạng thái điều khiển servo:** Vì chưa có cảm biến từ hoặc công tắc hành trình, hệ thống không xác nhận vật lý 100% cửa đã đóng/mở. Trong báo cáo nên ghi là “trạng thái điều khiển cửa/gara”.
- **Một thẻ RFID chỉ gán một chức năng chính:** Do giới hạn giao diện/phần cứng hiện tại, mỗi thẻ nên được gán mục tiêu `main_door` hoặc `garage`. Quyền thời gian vẫn có thể linh hoạt.
- **Thời gian thực nên xử lý local:** ESP32 cần lưu cache danh sách thẻ/mật khẩu trong RAM để xác thực nhanh. Không nên mỗi lần quét thẻ lại chờ server phản hồi.
- **Flash chỉ dùng để lưu bền vững:** Danh sách thẻ, mật khẩu, quyền và cấu hình có thể lưu trong flash/NVS/LittleFS. Tuy nhiên không nên ghi flash liên tục cho mọi event.
- **Log dài hạn nên lưu trên server/Firebase:** ESP32 chỉ nên lưu queue tạm khi offline, sau đó đồng bộ lại khi online.
- **DHT11 có độ chính xác vừa phải:** Phù hợp mô hình và demo, nhưng không nên thuyết minh như cảm biến môi trường chuyên nghiệp.

### 2.3. Đánh giá khả thi

| Nhóm chức năng | Mức độ khả thi | Nhận xét |
|---|---:|---|
| Access Control | Cao | Phù hợp với keypad, RFID, servo, LCD và web app. |
| Phân quyền RFID/mật khẩu | Cao | Lưu local trong ESP32 và đồng bộ server được. |
| Tự động gara | Cao | Cảm biến siêu âm đủ để mô phỏng xe tiến gần cửa gara. |
| Smart Lighting | Cao | 2 cảm biến IR và LED đủ để làm tự động bật/tắt và hiệu ứng. |
| Environment Control | Cao | DHT11 + quạt DC đủ để mô phỏng điều khiển môi trường. |
| Dashboard realtime | Cao | Node.js + WebSocket phù hợp. |
| Firebase database | Cao | Phù hợp lưu cấu hình, trạng thái, log và dữ liệu cảm biến. |
| Offline/online sync | Trung bình - Cao | Cần thiết kế queue và cơ chế đồng bộ cẩn thận. |

---

## 3. Kiến trúc tổng thể đề xuất

### 3.1. Vai trò của ESP32

ESP32 là bộ điều khiển tại chỗ, chịu trách nhiệm:

- Đọc RFID, keypad, IR, siêu âm, DHT11.
- Điều khiển servo cửa chính, servo gara, LED và quạt DC.
- Xác thực thẻ/mật khẩu local bằng dữ liệu cache trong RAM.
- Lưu cấu hình quan trọng trong flash để hoạt động offline.
- Gửi event, trạng thái và dữ liệu cảm biến lên server khi online.
- Nhận lệnh điều khiển/cập nhật cấu hình từ web app thông qua server.
- Lưu tạm một số event khi offline để đồng bộ lại sau.

### 3.2. Vai trò của server Node.js

Server Node.js chịu trách nhiệm:

- Duy trì kết nối WebSocket với ESP32 và web app.
- Nhận event/state/sensor data từ ESP32.
- Ghi dữ liệu vào Firebase.
- Gửi lệnh điều khiển từ web app xuống ESP32.
- Quản lý cấu hình hệ thống: thẻ RFID, mật khẩu, quyền, thời hạn, ngưỡng môi trường, thời gian tự đóng cửa/gara, cấu hình đèn.
- Cung cấp API cho dashboard.
- Xử lý xác thực người dùng web app nếu có.

### 3.3. Vai trò của Firebase

Firebase dự kiến dùng để lưu:

- Trạng thái thiết bị hiện tại.
- Danh sách thẻ RFID và quyền.
- Danh sách mật khẩu phụ và thời hạn.
- Cấu hình hệ thống.
- Log truy cập.
- Log cảnh báo.
- Dữ liệu nhiệt độ/độ ẩm.
- Thống kê thời gian bật đèn/quạt.
- Event timeline.

### 3.4. Luồng dữ liệu tổng quát

```text
Cảm biến / Keypad / RFID
        ↓
      ESP32
        ↓ xử lý local
Thiết bị chấp hành: Servo / LED / Quạt / LCD
        ↓ nếu online
 WebSocket Node.js Server
        ↓
     Firebase
        ↓
    Web Dashboard
```

---

## 4. Nguyên tắc lưu trữ local trên ESP32

Các dữ liệu như UID thẻ RFID, tên thẻ, quyền, mật khẩu, thời hạn và rule truy cập có thể lưu trong flash ESP32. Tuy nhiên để đảm bảo phản hồi nhanh, ESP32 nên nạp dữ liệu từ flash vào RAM khi khởi động.

### 4.1. Nguyên tắc xử lý

```text
Khi khởi động:
Flash/NVS/LittleFS -> đọc cấu hình -> đưa vào RAM cache

Khi quét RFID hoặc nhập mật khẩu:
Kiểm tra trong RAM -> ra quyết định ngay -> điều khiển thiết bị

Khi web app cập nhật cấu hình:
Cập nhật RAM -> ghi lại flash -> gửi xác nhận lên server
```

### 4.2. Phân loại dữ liệu lưu trữ

| Loại dữ liệu | Nơi lưu đề xuất | Lý do |
|---|---|---|
| Danh sách RFID | LittleFS hoặc NVS | Cần lưu bền vững, đọc khi boot. |
| Tên thẻ, quyền, thời hạn | LittleFS hoặc NVS | Có cấu trúc, cần đồng bộ server. |
| Mật khẩu master | NVS | Dữ liệu nhỏ, quan trọng. |
| Mật khẩu phụ | NVS hoặc LittleFS | Có thời hạn, cần tự động xóa khi hết hạn. |
| Ngưỡng nhiệt độ/độ ẩm | NVS | Cấu hình nhỏ. |
| Thời gian tự đóng cửa/gara | NVS | Cấu hình nhỏ. |
| Cấu hình đèn | NVS | Cấu hình nhỏ. |
| Log dài hạn | Firebase | Không nên lưu lâu dài trên ESP32. |
| Event offline tạm thời | LittleFS queue nhỏ | Dùng khi mất mạng. |

### 4.3. Quy mô bộ nhớ

Với quy mô 10 thẻ RFID và 10 mật khẩu, ESP32 đủ RAM để lưu và xử lý rất thoải mái. Dữ liệu này thường chỉ chiếm vài KB, nhỏ hơn rất nhiều so với RAM khả dụng của ESP32. Vì vậy vấn đề chính không phải là dung lượng RAM, mà là thiết kế đúng: flash để lưu bền vững, RAM để xử lý nhanh, server/Firebase để lưu lịch sử dài hạn.

---

## 5. Đặc tả chức năng nhóm Access Control

### 5.1. Phạm vi thiết bị

Nhóm Access Control sử dụng:

- Servo cửa chính.
- Servo gara.
- Keypad.
- RFID.
- LCD để hiển thị trạng thái.
- Web app để quản lý, điều khiển và mở khóa từ xa.

### 5.2. Quản lý thẻ RFID

Hệ thống hỗ trợ lưu nhiều thẻ RFID. Mỗi thẻ có thể được đặt tên để dễ quản lý trên web app, ví dụ:

- `Owner Card`.
- `Garage Card`.
- `Helper Card`.
- `Guest Card`.
- `Gardener Card`.

Mỗi thẻ có thể bị khóa, xóa hoặc thay đổi quyền. Do hạn chế phần cứng và để đơn giản hóa luồng sử dụng, mỗi thẻ chỉ nên được gán một chức năng chính:

- Mở cửa chính.
- Hoặc mở gara.

Tuy nhiên, quyền thời gian của mỗi thẻ vẫn có thể khác nhau:

- Truy cập toàn thời gian.
- Chỉ được truy cập trong một khung giờ cố định, ví dụ 08:00 - 10:00 hằng ngày.
- Chỉ được truy cập trong một khoảng ngày cụ thể, ví dụ từ 01/01/2026 đến 03/01/2026.
- Bị khóa tạm thời hoặc vô hiệu hóa hoàn toàn.

### 5.3. Quy trình thêm thẻ RFID

Khi người dùng vào chế độ thêm thẻ:

1. Web app hoặc thao tác local chuyển hệ thống sang `ADD_CARD_MODE`.
2. Người dùng đưa thẻ tới gần đầu đọc RFID.
3. ESP32 đọc UID của thẻ.
4. ESP32 kiểm tra UID đã tồn tại trong danh sách local hay chưa.
5. Nếu thẻ đã tồn tại, hệ thống hiển thị thông báo thẻ đã được ghi nhận trước đó.
6. Nếu thẻ chưa tồn tại, ESP32 thêm thẻ vào danh sách với quyền mặc định là `full_time`.
7. Server/Firebase lưu thông tin thẻ mới.
8. Người dùng có thể chỉnh tên, chức năng và quyền của thẻ trên web app.

### 5.4. Cấu trúc dữ liệu đề xuất cho RFID

```json
{
  "cardId": "rfid_001",
  "uid": "A1B2C3D4",
  "name": "Helper Card",
  "target": "main_door",
  "enabled": true,
  "accessMode": "time_window",
  "timeWindow": {
    "start": "08:00",
    "end": "10:00"
  },
  "dateRange": {
    "start": "2026-01-01",
    "end": "2026-01-03"
  },
  "createdAt": "2026-01-01T07:00:00Z",
  "updatedAt": "2026-01-01T07:00:00Z"
}
```

Trường `target` nên có các giá trị:

- `main_door`.
- `garage`.

Trường `accessMode` nên có các giá trị:

- `full_time`.
- `time_window`.
- `date_range`.
- `disabled`.

### 5.5. Keypad và mật khẩu

Keypad dùng để mở cửa chính. Hệ thống có logic mật khẩu tương tự thẻ RFID nhưng có một số ràng buộc riêng:

- Chỉ có duy nhất một mật khẩu chính `master`.
- Mật khẩu master có quyền truy cập full-time.
- Các mật khẩu còn lại là mật khẩu phụ/tạm thời.
- Mật khẩu phụ có thể bị giới hạn theo khung giờ, theo khoảng ngày hoặc theo thời lượng sau khi tạo.
- Mật khẩu hết hạn sẽ bị tự động xóa hoặc vô hiệu hóa.

Các loại mật khẩu phụ nên hỗ trợ:

- Mật khẩu chỉ dùng trong một khung giờ cố định.
- Mật khẩu chỉ có hiệu lực trong một khoảng ngày.
- Mật khẩu có hiệu lực trong 30 phút kể từ thời điểm tạo.
- Mật khẩu dùng một lần nếu muốn mở rộng sau này.

### 5.6. Cấu trúc dữ liệu đề xuất cho mật khẩu

```json
{
  "passwordId": "pwd_001",
  "label": "Guest 30 minutes",
  "passwordHash": "hash_value_here",
  "type": "temporary",
  "target": "main_door",
  "enabled": true,
  "accessMode": "duration",
  "validFrom": "2026-01-01T08:00:00Z",
  "validUntil": "2026-01-01T08:30:00Z",
  "createdAt": "2026-01-01T08:00:00Z"
}
```

Mật khẩu master nên được lưu riêng và không nên có nhiều bản ghi master.

### 5.7. Log sự kiện Access Control

Mỗi khi có sự kiện liên quan đến truy cập, hệ thống cần gửi log lên server:

- Nhập mật khẩu sai.
- Quét thẻ không hợp lệ.
- Quét thẻ đã bị khóa.
- Quét thẻ hết hạn.
- Mở cửa thành công bằng RFID.
- Mở cửa thành công bằng keypad.
- Mở gara thành công bằng RFID.
- Mở cửa/gara từ web app.
- Hệ thống bị khóa do sai quá nhiều lần.
- Chủ nhà mở khóa từ web app.

Ví dụ log:

```json
{
  "eventType": "access_granted",
  "method": "rfid",
  "target": "main_door",
  "actorName": "Helper Card",
  "timestamp": "2026-01-01T08:05:20Z",
  "source": "esp32"
}
```

### 5.8. Cơ chế tự đóng cửa/gara

Vì đây là hệ thống mô hình, cửa chính và gara có thể tự đóng sau một khoảng thời gian cấu hình, mặc định là 30 giây.

Cơ chế:

```text
Mở cửa/gara thành công -> bắt đầu đếm thời gian -> hết 30 giây -> tự đóng
```

Người dùng có thể đóng ngay từ web app. Thời gian tự đóng nên được cấu hình trong dashboard.

### 5.9. Chống nhập sai và khóa truy cập

Hệ thống cần đếm số lần xác thực sai, bao gồm:

- Nhập sai mật khẩu.
- Quét thẻ không hợp lệ.
- Quét thẻ sai quyền.
- Quét thẻ hết hạn.

Cơ chế khóa đề xuất:

- Sau 3 lần sai: khóa truy cập trong 30 giây.
- Mỗi 3 lần sai tiếp theo: thời gian khóa gấp đôi.
- Trong thời gian khóa, LCD hiển thị trạng thái bị khóa.
- Server ghi nhận log cảnh báo.
- Chủ nhà vẫn có thể mở cửa trực tiếp từ web app.
- Khi chủ nhà mở cửa từ web app, hệ thống giải trừ trạng thái khóa ngay lập tức.

Ví dụ tăng thời gian khóa:

| Tổng số lần sai | Thời gian khóa |
|---:|---:|
| 3 | 30 giây |
| 6 | 60 giây |
| 9 | 120 giây |
| 12 | 240 giây |

Mục tiêu của cơ chế này là chống dò mật khẩu nhưng vẫn tránh tình huống bị người khác cố tình nhập sai để khóa chủ nhà bên ngoài.

---

## 6. Đặc tả chức năng nhóm Garage Automation

### 6.1. Phạm vi thiết bị

Nhóm Garage Automation sử dụng:

- Servo điều khiển cửa gara.
- Cảm biến siêu âm đặt ở vị trí gần cửa gara.
- RFID để mở gara từ bên ngoài.
- Web app để đóng/mở gara từ xa.

### 6.2. Luồng từ bên ngoài vào gara

Khi đi từ bên ngoài vào gara, người dùng sử dụng thẻ RFID có quyền `garage`.

Luồng xử lý:

1. Người dùng quét thẻ RFID.
2. ESP32 kiểm tra UID, quyền và thời hạn.
3. Nếu hợp lệ, ESP32 mở cửa gara.
4. LCD hoặc dashboard hiển thị trạng thái mở gara.
5. Server ghi log `garage_opened_by_rfid`.
6. Gara tự đóng sau thời gian cấu hình hoặc khi người dùng đóng từ web app.

### 6.3. Luồng từ bên trong ra ngoài

Cảm biến siêu âm được đặt gần cửa gara để phát hiện xe tiến lại gần cổng từ phía bên trong.

Luồng xử lý:

1. Cảm biến siêu âm đo khoảng cách định kỳ.
2. Nếu khoảng cách nhỏ hơn ngưỡng trong nhiều lần đo liên tiếp, ESP32 xác định có xe đang tiến gần.
3. ESP32 mở cửa gara.
4. Khi không còn vật ở trước cảm biến và đã qua thời gian mở tối thiểu, ESP32 đóng cửa gara.
5. Server ghi log mở/đóng gara tự động.

### 6.4. Chống đóng gara quá sớm

Để tránh gara đóng khi vẫn còn xe/vật cản trước cảm biến, cần có điều kiện đóng:

```text
Chỉ đóng gara khi:
- Đã qua thời gian mở tối thiểu;
- Và cảm biến siêu âm không còn phát hiện vật trong vùng gần cửa;
- Và trạng thái không bị giữ mở từ web app.
```

### 6.5. Điều khiển từ web app

Web app cần hỗ trợ:

- Mở gara.
- Đóng gara.
- Xem trạng thái điều khiển gara.
- Cấu hình thời gian tự đóng.
- Cấu hình ngưỡng khoảng cách phát hiện xe.
- Bật/tắt chế độ tự động nếu cần.

---

## 7. Đặc tả chức năng nhóm Smart Lighting

### 7.1. Phạm vi thiết bị

Nhóm Smart Lighting sử dụng:

- 2 cảm biến IR ở hành lang.
- Hệ thống đèn LED.
- Web app để cấu hình chế độ, độ sáng và hiệu ứng.

### 7.2. Tự động bật/tắt đèn hành lang

Khi một trong hai cảm biến IR phát hiện có người ở hành lang, đèn sẽ tự bật. Khi không còn phát hiện người, hệ thống bắt đầu đếm thời gian chờ. Nếu hết thời gian chờ mà vẫn không phát hiện người, đèn sẽ tắt.

Logic:

```text
IR1 hoặc IR2 phát hiện người -> bật đèn
Không còn phát hiện người -> bắt đầu đếm thời gian chờ
Trong khi chờ, nếu phát hiện người lại -> reset thời gian chờ
Hết thời gian chờ -> tắt đèn
```

### 7.3. Cấu hình từ web app

Web app cần hỗ trợ:

- Thiết lập thời gian mở đèn tối thiểu/thời gian chờ.
- Chuyển giữa chế độ tự động và thủ công.
- Bật/tắt đèn thủ công.
- Chọn hiệu ứng LED:
  - Tĩnh.
  - Blink.
  - Fading.
- Điều chỉnh độ sáng tối đa.

Độ sáng tối đa không được đặt về 0 để tránh nhầm lẫn giữa cấu hình độ sáng và thao tác tắt đèn. Nếu muốn tắt đèn, hệ thống nên dùng trạng thái `off` thay vì đặt brightness bằng 0.

### 7.4. Lưu trữ và thống kê

Server cần lưu:

- Thời điểm đèn bật.
- Thời điểm đèn tắt.
- Lý do bật: tự động do IR hoặc thủ công từ web app.
- Tổng thời gian bật đèn mỗi ngày.
- Số lần bật đèn mỗi ngày.

Ví dụ log:

```json
{
  "eventType": "light_on",
  "reason": "ir_detected",
  "timestamp": "2026-01-01T19:30:00Z"
}
```

---

## 8. Đặc tả chức năng nhóm Environment Control

### 8.1. Phạm vi thiết bị

Nhóm Environment Control sử dụng:

- Cảm biến nhiệt độ/độ ẩm DHT11.
- Động cơ DC đóng vai trò quạt.
- Web app để cấu hình ngưỡng và tốc độ quạt.

### 8.2. Đo và gửi dữ liệu môi trường

DHT11 đo nhiệt độ và độ ẩm định kỳ. ESP32 gửi dữ liệu này lên server để lưu trữ và thống kê.

Dữ liệu gửi lên nên gồm:

- Nhiệt độ.
- Độ ẩm.
- Thời điểm đo.
- Trạng thái quạt hiện tại.
- Chế độ quạt: auto hoặc manual.

Ví dụ:

```json
{
  "temperature": 32.5,
  "humidity": 78,
  "fanState": "on",
  "fanMode": "auto",
  "timestamp": "2026-01-01T12:00:00Z"
}
```

### 8.3. Điều khiển quạt tự động

Nếu nhiệt độ hoặc độ ẩm vượt quá giá trị giới hạn, hệ thống sẽ bật quạt. Quạt chỉ tự tắt khi cả nhiệt độ và độ ẩm đều trở lại trạng thái ổn định.

Logic đề xuất:

```text
Nếu temperature >= TEMP_ON hoặc humidity >= HUMIDITY_ON:
    bật quạt

Nếu temperature <= TEMP_OFF và humidity <= HUMIDITY_OFF:
    tắt quạt
```

Nên dùng hai ngưỡng bật/tắt khác nhau để tránh quạt bật/tắt liên tục. Ví dụ:

| Điều kiện | Hành động |
|---|---|
| Nhiệt độ >= 32°C hoặc độ ẩm >= 75% | Bật quạt |
| Nhiệt độ <= 30°C và độ ẩm <= 65% | Tắt quạt |
| Nằm giữa hai ngưỡng | Giữ trạng thái hiện tại |

### 8.4. Điều chỉnh tốc độ quạt

Tốc độ quạt có thể được điều chỉnh qua web app. Nếu dùng điều khiển PWM, dashboard có thể cho phép chọn mức tốc độ:

- Low.
- Medium.
- High.
- Hoặc phần trăm từ 1% đến 100%.

Khi quạt ở chế độ auto, tốc độ có thể tự chọn theo mức vượt ngưỡng. Khi ở chế độ manual, người dùng chọn tốc độ trực tiếp.

### 8.5. Lưu trữ và thống kê thời gian bật quạt

Server cần lưu:

- Thời điểm quạt bật.
- Thời điểm quạt tắt.
- Lý do bật: nhiệt độ cao, độ ẩm cao, hoặc thủ công.
- Tốc độ quạt.
- Tổng thời gian quạt bật trong ngày.
- Các khoảng thời gian quạt hoạt động.

---

## 9. Đặc tả nhóm Monitoring & Data Platform

### 9.1. WebSocket realtime

Hệ thống sử dụng WebSocket để truyền dữ liệu realtime giữa ESP32, server Node.js và web dashboard.

Các loại message chính:

- ESP32 gửi trạng thái thiết bị.
- ESP32 gửi dữ liệu cảm biến.
- ESP32 gửi event log.
- Server gửi lệnh điều khiển từ web app xuống ESP32.
- Server gửi cấu hình mới xuống ESP32.
- ESP32 gửi phản hồi xác nhận lệnh.

### 9.2. Dashboard

Dashboard cần hiển thị:

- Trạng thái cửa chính.
- Trạng thái gara.
- Trạng thái đèn.
- Trạng thái quạt.
- Nhiệt độ hiện tại.
- Độ ẩm hiện tại.
- Trạng thái kết nối ESP32.
- Trạng thái khóa truy cập.
- Event timeline.
- Biểu đồ dữ liệu.

### 9.3. Lưu lịch sử

Firebase cần lưu lịch sử cho các nhóm dữ liệu:

- Access logs.
- Door/garage logs.
- Lighting logs.
- Fan logs.
- Sensor readings.
- System alerts.
- Device state snapshots.

### 9.4. Biểu đồ

Dashboard nên có các biểu đồ:

- Nhiệt độ theo thời gian.
- Độ ẩm theo thời gian.
- Tổng thời gian bật quạt theo ngày.
- Tổng thời gian bật đèn theo ngày.
- Số lần mở cửa theo ngày.
- Số lần mở gara theo ngày.
- Số lần nhập sai mật khẩu/thẻ.

### 9.5. Event timeline

Event timeline giúp người dùng xem lại chuỗi sự kiện theo thời gian:

```text
08:00 - Helper Card opened main door
08:01 - Main door auto closed
12:00 - Temperature high, fan turned on
12:30 - Fan turned off
19:30 - IR detected motion, hallway light turned on
19:35 - Hallway light turned off
```

### 9.6. Offline/online synchronization

Khi ESP32 mất kết nối server:

- Các chức năng local vẫn hoạt động.
- ESP32 tiếp tục xử lý RFID, keypad, gara, đèn và quạt.
- ESP32 có thể lưu tạm một số event quan trọng vào queue local.
- Dashboard hiển thị trạng thái offline nếu phát hiện mất heartbeat.

Khi ESP32 online lại:

- ESP32 gửi trạng thái hiện tại lên server.
- ESP32 đồng bộ các event tạm đã lưu.
- Server gửi cấu hình mới nhất nếu có thay đổi.
- ESP32 cập nhật RAM cache và flash nếu cấu hình thay đổi.

---

## 10. Đề xuất cấu trúc Firebase

Dưới đây là cấu trúc dữ liệu gợi ý. Có thể dùng Firestore hoặc Realtime Database tùy cách triển khai. Với log và dashboard, Firestore thường dễ tổ chức hơn.

```text
homes/{homeId}
  config/
    accessControl
    garage
    lighting
    environment
  devices/
    esp32_main
  states/
    current
  rfidCards/{cardId}
  passwords/{passwordId}
  logs/{logId}
  sensorReadings/{readingId}
  statistics/{date}
```

### 10.1. Current state

```json
{
  "mainDoor": "closed",
  "garageDoor": "closed",
  "light": {
    "state": "off",
    "mode": "auto",
    "effect": "static",
    "brightnessMax": 80
  },
  "fan": {
    "state": "off",
    "mode": "auto",
    "speed": 60
  },
  "environment": {
    "temperature": 30.5,
    "humidity": 70
  },
  "accessLock": {
    "locked": false,
    "lockedUntil": null,
    "failedAttempts": 0
  },
  "connection": {
    "esp32Online": true,
    "lastHeartbeat": "2026-01-01T08:00:00Z"
  }
}
```

### 10.2. Event log

```json
{
  "eventType": "access_denied",
  "category": "access_control",
  "method": "keypad",
  "target": "main_door",
  "reason": "wrong_password",
  "timestamp": "2026-01-01T08:00:00Z",
  "source": "esp32"
}
```

---

## 11. Đề xuất WebSocket message format

### 11.1. ESP32 gửi trạng thái

```json
{
  "type": "state_update",
  "deviceId": "esp32_main",
  "payload": {
    "mainDoor": "closed",
    "garageDoor": "open",
    "lightState": "on",
    "fanState": "off"
  },
  "timestamp": "2026-01-01T08:00:00Z"
}
```

### 11.2. ESP32 gửi dữ liệu cảm biến

```json
{
  "type": "sensor_reading",
  "deviceId": "esp32_main",
  "payload": {
    "temperature": 32.5,
    "humidity": 78
  },
  "timestamp": "2026-01-01T08:00:00Z"
}
```

### 11.3. ESP32 gửi event

```json
{
  "type": "event_log",
  "deviceId": "esp32_main",
  "payload": {
    "eventType": "garage_opened",
    "reason": "ultrasonic_detected"
  },
  "timestamp": "2026-01-01T08:00:00Z"
}
```

### 11.4. Server gửi lệnh điều khiển

```json
{
  "type": "command",
  "commandId": "cmd_001",
  "target": "garage",
  "action": "open",
  "params": {},
  "timestamp": "2026-01-01T08:00:00Z"
}
```

### 11.5. ESP32 phản hồi lệnh

```json
{
  "type": "command_ack",
  "commandId": "cmd_001",
  "status": "success",
  "message": "Garage opened",
  "timestamp": "2026-01-01T08:00:01Z"
}
```

---

## 12. Các trạng thái hệ thống nên chuẩn hóa

### 12.1. Trạng thái cửa/gara

- `open`.
- `closed`.
- `opening`.
- `closing`.
- `unknown`.

Vì hệ thống mô hình dùng servo, trạng thái này là trạng thái điều khiển, không phải xác nhận vật lý tuyệt đối.

### 12.2. Trạng thái truy cập

- `access_granted`.
- `access_denied`.
- `access_locked`.
- `card_added`.
- `card_updated`.
- `card_deleted`.
- `password_created`.
- `password_expired`.

### 12.3. Chế độ đèn

- `auto`.
- `manual`.

Hiệu ứng đèn:

- `static`.
- `blink`.
- `fading`.

### 12.4. Chế độ quạt

- `auto`.
- `manual`.

Tốc độ quạt:

- `low`.
- `medium`.
- `high`.
- Hoặc giá trị phần trăm từ 1 đến 100.

---

## 13. Các chức năng ưu tiên triển khai

### 13.1. Ưu tiên cao

- Mở cửa chính bằng keypad.
- Mở cửa chính/gara bằng RFID theo quyền.
- Quản lý thẻ RFID: thêm, đặt tên, khóa, xóa, đổi quyền.
- Quản lý mật khẩu master và mật khẩu phụ.
- Tự động khóa truy cập sau 3 lần sai.
- Chủ nhà mở khóa từ web app.
- Tự động đóng cửa/gara sau thời gian cấu hình.
- Mở/đóng cửa và gara từ web app.
- Gara tự mở bằng cảm biến siêu âm khi xe từ trong đi ra.
- Đèn hành lang tự động bật/tắt bằng IR.
- Quạt tự động theo nhiệt độ/độ ẩm.
- Gửi log và trạng thái realtime qua WebSocket.
- Lưu dữ liệu vào Firebase.

### 13.2. Ưu tiên trung bình

- Cấu hình khung giờ truy cập cho RFID/mật khẩu.
- Cấu hình khoảng ngày hiệu lực.
- Mật khẩu hiệu lực 30 phút sau khi tạo.
- Tự động xóa/vô hiệu hóa mật khẩu hết hạn.
- Chọn hiệu ứng LED từ web app.
- Thống kê thời gian bật đèn/quạt.
- Biểu đồ nhiệt độ/độ ẩm.
- Event timeline.
- Offline event queue và đồng bộ khi online lại.

### 13.3. Có thể mở rộng sau

- Mật khẩu dùng một lần.
- Nhận biết hướng di chuyển bằng 2 cảm biến IR.
- Cảnh báo bất thường nâng cao.
- Phân quyền người dùng web app.
- Thông báo qua email/Telegram/Firebase Cloud Messaging.
- Cảm biến cửa thật để xác nhận trạng thái vật lý.

---

## 14. Ràng buộc và lưu ý kỹ thuật

- Không nên dùng `delay()` dài trong ESP32 vì sẽ ảnh hưởng đến WebSocket, cảm biến và logic realtime.
- Nên dùng `millis()` để quản lý thời gian tự đóng cửa, timeout đèn, timeout khóa truy cập và chu kỳ đọc DHT11.
- Không nên ghi flash liên tục; chỉ ghi khi cấu hình thay đổi hoặc khi cần lưu event offline quan trọng.
- Không nên phụ thuộc hoàn toàn vào server để mở cửa; xác thực RFID/mật khẩu cần xử lý local.
- Mật khẩu nên lưu dạng hash nếu muốn tăng tính bảo mật.
- Cần có heartbeat giữa ESP32 và server để biết trạng thái online/offline.
- Cần có `commandId` cho lệnh từ web app để tránh xử lý trùng lặp.
- Cần có `configVersion` để đồng bộ cấu hình giữa Firebase/server và ESP32.
- Các log nên có timestamp chuẩn. Khi online, timestamp nên lấy từ server hoặc NTP.

---

## 15. Kết luận

Danh sách chức năng cuối hiện tại là hợp lý, vừa đủ sâu để thể hiện năng lực của một hệ thống IoT SmartHome, vừa phù hợp với phần cứng đang có. Hệ thống có đầy đủ các thành phần quan trọng: điều khiển thiết bị, cảm biến, tự động hóa, phân quyền, bảo mật cơ bản, dashboard realtime, lưu trữ lịch sử và khả năng hoạt động offline.

Hướng triển khai tốt nhất là xem ESP32 như bộ điều khiển local đáng tin cậy, server Node.js là trung gian realtime và Firebase là nền tảng lưu trữ dữ liệu. Các chức năng truy cập, gara, đèn và quạt nên chạy độc lập tại ESP32 để đảm bảo phản hồi nhanh. Server và Firebase dùng để quản lý, giám sát, thống kê, điều khiển từ xa và đồng bộ cấu hình.

Tài liệu này có thể được dùng làm ngữ cảnh cho Codex khi viết code firmware ESP32, server Node.js, cấu trúc Firebase và giao diện web dashboard.
