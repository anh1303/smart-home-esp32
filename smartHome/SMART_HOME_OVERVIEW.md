# SmartHome ESP32 - Overview hệ thống

Tài liệu này mô tả tổng quan ngữ cảnh, thiết bị và mục tiêu của hệ thống SmartHome. Đây là bản overview phục vụ thuyết minh sản phẩm, không đi sâu vào pinout, tham số kỹ thuật hoặc chi tiết triển khai trong code.

## 1. Ý tưởng tổng quan

SmartHome là mô hình nhà thông minh dùng ESP32 làm bộ điều khiển trung tâm. Hệ thống kết hợp các cảm biến, thiết bị chấp hành và giao diện phần mềm để giải quyết các nhu cầu quen thuộc trong nhà ở:

- Kiểm soát ra vào cửa chính.
- Tự động mở/đóng gara theo tình huống sử dụng.
- Tự động bật đèn hành lang/cầu thang khi có người.
- Theo dõi môi trường trong nhà bằng nhiệt độ/độ ẩm.
- Điều khiển hoặc mô phỏng thiết bị xử lý không khí bằng động cơ DC.
- Giám sát, lưu trữ và trực quan hóa dữ liệu hệ thống.
- Hoạt động được cả khi có mạng và khi không có mạng.

Hệ thống được thiết kế theo hướng thực tế: các thiết bị không hoạt động rời rạc mà phối hợp với nhau theo ngữ cảnh sinh hoạt trong một ngôi nhà.

## 2. Bố trí thiết bị theo khu vực

### 2.1 Khu vực trước cửa nhà

Trước cửa nhà có ba thiết bị chính: LCD, keypad và RFID.

LCD là màn hình phản hồi tại chỗ cho người dùng. Khi người dùng nhập mật khẩu hoặc quét thẻ, LCD hiển thị trạng thái tương ứng như nhập đúng, nhập sai, cửa chính mở, gara mở, hệ thống đang chờ hoặc đang bị khóa tạm thời sau nhiều lần xác thực sai.

Keypad dùng để nhập mật khẩu. Hệ thống hỗ trợ mật khẩu chính cho chủ nhà và mật khẩu khách cho các tình huống cần cấp quyền tạm thời, ví dụ người thân, khách hoặc người giao hàng.

RFID dùng để xác thực bằng thẻ từ. Theo định hướng sản phẩm, mỗi thẻ có thể đại diện cho một quyền truy cập khác nhau: có thẻ dùng để mở cửa chính, có thẻ dùng để mở gara, hoặc có thẻ được cấp cho người dùng cụ thể. Cách tổ chức này giúp hệ thống dễ mở rộng sang quản lý người dùng và phân quyền truy cập.

### 2.2 Khu vực gara

Trong gara có servo điều khiển cửa gara và cảm biến siêu âm đặt gần cửa.

Cảm biến siêu âm có nhiệm vụ phát hiện xe được đưa đến sát cửa gara từ bên trong. Khi xe nằm trong vùng phát hiện, hệ thống tự động mở cửa gara để xe đi ra. Sau khi xe rời khỏi vùng phát hiện, cửa gara có thể tự đóng lại sau một khoảng thời gian chờ.

Logic này giúp gara hoạt động tự nhiên hơn: người dùng không cần bấm nút hoặc thao tác trên phần mềm trong tình huống xe đang chuẩn bị đi ra ngoài.

### 2.3 Khu vực hành lang/cầu thang

Trong hành lang có hai cảm biến PIR/IR, bố trí tương ứng với hai cửa phòng hoặc hai hướng di chuyển chính.

Khi một trong hai cảm biến phát hiện có người, hệ thống tự động bật đèn hành lang/cầu thang. Khi không còn chuyển động, đèn tự tắt sau một khoảng trễ. Chức năng này phù hợp với nhu cầu thực tế vào ban đêm hoặc khi người dùng di chuyển qua hành lang mà không muốn bật/tắt công tắc thủ công.

### 2.4 Khu vực trong nhà

Trong nhà có cảm biến nhiệt độ/độ ẩm DHT11 và một động cơ DC.

Cụm thiết bị này có thể được định hướng theo hai hướng:

- Quạt thông gió hoặc hút ẩm tự động.
- Mô hình giả lập điều hòa hoặc thiết bị điều tiết môi trường trong nhà.

Với phần cứng hiện tại, hướng quạt thông gió/hút ẩm thực tế hơn. Hệ thống có thể đọc nhiệt độ/độ ẩm rồi điều khiển động cơ DC để mô phỏng phản ứng tự động khi môi trường vượt ngưỡng mong muốn.

## 3. Các nhóm chức năng chính

### 3.1 Kiểm soát cửa chính

Cửa chính được điều khiển bằng servo và có thể mở thông qua:

- Mật khẩu chính nhập từ keypad.
- Mật khẩu khách nhập từ keypad.
- Thẻ RFID hợp lệ.
- Lệnh điều khiển từ giao diện phần mềm khi hệ thống chạy online.

Khi xác thực thành công, cửa chính mở trong một khoảng thời gian rồi tự đóng. Nếu người dùng nhập sai nhiều lần, hệ thống chuyển sang trạng thái khóa tạm thời để giảm nguy cơ dò mật khẩu.

### 3.2 Điều khiển gara

Gara có thể hoạt động theo hai cách:

- Tự động mở khi cảm biến siêu âm phát hiện xe ở gần cửa gara.
- Nhận lệnh mở/đóng từ giao diện phần mềm khi hệ thống chạy online.

Thiết kế này kết hợp cả tự động hóa tại chỗ và điều khiển từ xa, giúp gara thuận tiện hơn trong nhiều tình huống sử dụng.

### 3.3 Đèn hành lang tự động

Hai cảm biến PIR/IR phối hợp để phát hiện chuyển động ở hành lang/cầu thang. Chỉ cần một cảm biến phát hiện có người, đèn được bật. Khi không còn chuyển động, đèn tắt trễ để tránh nhấp nháy liên tục.

Chức năng này có tính ứng dụng rõ ràng: tiết kiệm điện, tăng tiện lợi và tăng an toàn khi di chuyển trong nhà.

### 3.4 Theo dõi môi trường và điều khiển động cơ DC

DHT11 cung cấp dữ liệu nhiệt độ và độ ẩm. Động cơ DC đóng vai trò thiết bị phản ứng với môi trường.

Ở chế độ tự động, hệ thống có thể dùng dữ liệu nhiệt độ/độ ẩm để quyết định bật, tắt hoặc đổi hướng/tốc độ động cơ. Trong phiên bản sản phẩm hoàn chỉnh, phần này có thể được phát triển thành:

- Quạt thông gió khi nhiệt độ tăng cao.
- Quạt hút ẩm hoặc điều tiết không khí khi độ ẩm bất thường.
- Mô hình điều hòa tự động trong phạm vi mô phỏng.

### 3.5 Giám sát và điều khiển từ xa

Khi chạy online, ESP32 giao tiếp với server qua WebSocket. Giao diện phần mềm có thể:

- Xem trạng thái cửa chính, gara, đèn, quạt và cảm biến.
- Gửi lệnh mở cửa, mở gara, điều khiển đèn hoặc điều khiển quạt.
- Cập nhật thông tin như mật khẩu khách, thẻ RFID hoặc thời gian mở cửa.
- Nhận sự kiện theo thời gian thực khi hệ thống thay đổi trạng thái.

### 3.6 Hoạt động offline

Hệ thống vẫn cần hoạt động được khi mất mạng hoặc không kết nối server.

Ở chế độ offline, các chức năng local vẫn tiếp tục chạy:

- Keypad và RFID vẫn dùng được để xác thực.
- Cửa chính vẫn tự mở/đóng theo logic local.
- Gara vẫn tự động theo cảm biến siêu âm.
- Đèn hành lang vẫn tự động theo PIR/IR.
- DHT11 và động cơ DC vẫn hoạt động theo logic tự động.

Điều này giúp các chức năng thiết yếu của nhà thông minh không bị phụ thuộc hoàn toàn vào mạng.

### 3.7 Quản lý quyền truy cập nâng cao

Phiên bản refactor dùng server và Firestore làm nguồn dữ liệu chính cho quyền truy cập khi hệ thống online. Khi người dùng nhập PIN hoặc quẹt RFID, ESP32 gửi yêu cầu xác thực qua WebSocket, server kiểm tra dữ liệu trong Firestore rồi trả kết quả cho ESP32.

Các quyền đang được mô hình hóa:

- RFID nhiều thẻ, mỗi thẻ có tên, UID, trạng thái bật/tắt và target là cửa chính hoặc gara.
- Mật khẩu keypad gồm một mật khẩu master và nhiều mật khẩu tạm.
- Quyền truy cập full-time, theo khung giờ hoặc theo khoảng ngày.
- Mật khẩu tạm có thể có thời hạn tương đối, ví dụ 30 phút kể từ lúc tạo.
- Log truy cập hợp lệ, truy cập sai, enroll thẻ và thao tác từ web app được lưu trong collection events.

Khi offline, ESP32 vẫn giữ fallback local bằng mật khẩu/thẻ đã lưu trong Preferences để mô hình tiếp tục vận hành được.

### 3.8 Cấu trúc giao tiếp ESP32 và server

ESP32 kết nối tới server Node.js bằng WebSocket tại:

```text
ws://<SERVER_HOST>:<PORT>/ws/esp32
```

Giao tiếp dùng JSON và chia thành bốn nhóm message chính.

**1. ESP32 gửi trạng thái lên server**

ESP32 gửi `type: "status"` khi có thay đổi đáng kể hoặc theo heartbeat định kỳ. Server dùng gói này để cập nhật cache realtime, phát SSE cho dashboard và ghi Firestore theo nhịp đã throttle.

```json
{
  "type": "status",
  "door": "CLOSED",
  "temp": 31,
  "humidity": 72,
  "motion": true,
  "gara": "CLOSED",
  "garageMode": "AUTO",
  "fan": "OFF",
  "fanPct": 0,
  "fanMode": "AUTO",
  "light": true,
  "lightMode": "AUTO",
  "lightBrightness": 70,
  "lightEffect": "static",
  "lightHold": 20,
  "dist": 18
}
```

Giá trị quy ước:

- `door`: `CLOSED`, `OPEN`, `LOCKED_OUT`.
- `gara`: `CLOSED`, `OPEN`.
- `garageMode`, `fanMode`, `lightMode`: `AUTO` hoặc `MANUAL`.
- `fan`: `OFF`, `FORWARD`, `REVERSE`; `fanPct` là 0-100.
- `light`: boolean; `lightBrightness` là 10-100; `lightEffect` là `static`, `blink`, `fading`.

**2. ESP32 gửi event lên server**

Event là các sự kiện có ý nghĩa nghiệp vụ, không phải dữ liệu cảm biến liên tục.

```json
{
  "type": "event",
  "event": "open",
  "source": "Mat Khau"
}
```

Các event đang dùng gồm: `open`, `close`, `lockout`, `lockout_reset`, `motion`, `gara`, `gara_close`, `door_fastclose`, `fan`, `warn_otp_expired`.

**3. ESP32 yêu cầu server xác thực quyền truy cập**

Khi online, keypad/RFID không tự quyết định bằng dữ liệu local trước. ESP32 gửi yêu cầu lên server, server kiểm tra Firestore rồi trả kết quả.

```json
{
  "type": "auth_request",
  "id": "123456",
  "method": "password",
  "credential": "123456",
  "target": "mainDoor"
}
```

Với RFID:

```json
{
  "type": "auth_request",
  "id": "123457",
  "method": "rfid",
  "credential": "23 4E F6 2F",
  "target": "any"
}
```

Server trả:

```json
{
  "type": "auth_result",
  "requestId": "123456",
  "allowed": true,
  "target": "mainDoor",
  "source": "Mat Khau",
  "seconds": 30,
  "reason": null
}
```

Nếu Add Card Mode đang bật và ESP32 quẹt thẻ mới, server lưu thẻ vào Firestore rồi trả `allowed: false`, `reason: "card_enrolled"` để ESP32 chỉ hiển thị đã ghi nhận thẻ, không mở cửa.

**4. Server gửi lệnh điều khiển xuống ESP32**

Mọi lệnh từ web xuống ESP32 có correlation ID. ESP32 phải trả lại `{ "id": "...", "result": "..." }`.

```json
{
  "id": "1716200000000_ab12c",
  "cmd": "light_config",
  "payload": "20:70:static"
}
```

Các command chính:

- Cửa chính: `unlock`, `open`, `close`, `lock`, `duration`.
- Gara: `gara_open`, `gara_close`, `gara_auto`, `gara_manual`.
- Quạt: `fan_auto`, `fan_set` với payload `dir:speed_pct`, `fan_config` với payload `temp_on:temp_off:hum_on:hum_off`.
- Đèn: `light_on`, `light_off`, `light_auto`, `light_config` với payload `hold_seconds:brightness:effect`.
- Local fallback/config cũ: `guest`, `card_main`, `card_garage`, `passwd`.
- Đồng bộ nhanh: `status`.

### 3.9 Cấu trúc Firestore

Firestore là nguồn dữ liệu chính cho web app và xác thực online. Các collection/document nền tảng:

```text
devices/mainDoor
devices/garageDoor
devices/hallwayLight
devices/environmentFan
devices/esp32
systemState/current
systemSettings/main
webUsers/{userId}
accessCards/{cardId}
accessPasswords/{passwordId}
events/{eventId}
dailyStats/{yyyy-mm-dd}
schemaDocs/{name}
```

`systemState/current` là snapshot mới nhất để dashboard đọc nhanh:

```json
{
  "door": "CLOSED",
  "temp": 31,
  "humidity": 72,
  "motion": true,
  "gara": "CLOSED",
  "garageMode": "AUTO",
  "fan": "OFF",
  "fanPct": 0,
  "fanMode": "AUTO",
  "light": true,
  "lightMode": "AUTO",
  "lightBrightness": 70,
  "lightEffect": "static",
  "lightHold": 20,
  "dist": 18,
  "updatedAt": "serverTimestamp",
  "updatedAtIso": "ISO string"
}
```

`devices/esp32` lưu trạng thái kết nối và `lastStatus`. Các document `devices/mainDoor`, `devices/garageDoor`, `devices/hallwayLight`, `devices/environmentFan` lưu cấu hình/thiết lập mong muốn. Ví dụ đèn:

```json
{
  "deviceId": "hallwayLight",
  "type": "led_light",
  "state": "off",
  "controlMode": "auto",
  "minOnSeconds": 20,
  "maxBrightness": 70,
  "effect": "static"
}
```

`accessCards` lưu thẻ RFID:

```json
{
  "uid": "23 4E F6 2F",
  "name": "Thẻ chủ nhà",
  "enabled": true,
  "target": "mainDoor",
  "accessType": "full_time",
  "timeWindow": null,
  "dateRange": null
}
```

`accessPasswords` lưu PIN bằng bcrypt hash, không lưu plain text:

```json
{
  "name": "Mã khách 30 phút",
  "type": "guest",
  "target": "mainDoor",
  "enabled": true,
  "accessType": "full_time",
  "expiresAtIso": "2026-05-20T10:30:00.000Z",
  "autoDeleteWhenExpired": true,
  "passwordHash": "bcrypt hash",
  "passwordHashAlgo": "bcrypt"
}
```

`dailyStats/{yyyy-mm-dd}` là nguồn chính cho dashboard thống kê. Mỗi ngày chỉ có một document:

```json
{
  "date": "2026-05-20",
  "avgTemperature": 30.5,
  "avgHumidity": 68,
  "minTemperature": 27.8,
  "maxTemperature": 35.2,
  "lastTemperature": 31,
  "lastHumidity": 70,
  "lightOnMinutes": 18,
  "fanOnMinutes": 25,
  "statusUpdates": 300,
  "unlocks": 4,
  "failedAccess": 1,
  "garageEvents": 2,
  "lockouts": 0,
  "anomalies": 0,
  "hourly": {
    "00": {
      "sampleCount": 3,
      "tempSum": 87.6,
      "tempCount": 3,
      "humiditySum": 210,
      "humidityCount": 3,
      "avgTemperature": 29.2,
      "avgHumidity": 70,
      "lightOnMinutes": 4,
      "fanOnMinutes": 0,
      "unlocks": 0,
      "failedAccess": 0,
      "garageEvents": 0,
      "lockouts": 0,
      "anomalies": 0
    }
  }
}
```

Server cập nhật `dailyStats` liên tục trong ngày theo bucket giờ. Nhờ vậy dashboard có thể xem dữ liệu theo 24 tiếng mà không cần tạo hàng nghìn bản ghi cảm biến. Cuối ngày hoặc ngày hôm sau, document này đã là bản tổng hợp; nếu cần có thể chạy lại job batch để chuẩn hóa lại average từ `hourly`.

`events` chỉ lưu timeline nghiệp vụ quan trọng như xác thực thành công/thất bại, lockout, enroll/xóa thẻ, tạo mật khẩu, cảnh báo bất thường hoặc kết nối ESP32. Hệ thống không lưu từng status/cảm biến thành document riêng và không lưu command log mặc định; các log chi tiết ngắn hạn nằm ở server console/SSE.

Thiết kế hiện tại ưu tiên:

- Dashboard realtime đọc từ SSE/cache server để nhanh.
- Firestore chỉ lưu cấu hình, snapshot hiện tại, quyền truy cập, event quan trọng và thống kê theo ngày.
- Xác thực online luôn kiểm tra `accessCards` và `accessPasswords` trong Firestore.
- Offline fallback dùng dữ liệu Preferences trên ESP32, chưa tự mirror đầy đủ mọi thẻ/mật khẩu web xuống ESP32.

## 4. Luồng phối hợp giữa các thiết bị

Hệ thống được thiết kế theo các luồng phối hợp chính:

- Người dùng đứng trước cửa, nhập mật khẩu hoặc quét thẻ. Nếu online, ESP32 gửi yêu cầu xác thực lên server để kiểm tra quyền theo Firestore; nếu offline, ESP32 dùng fallback local. Sau khi hợp lệ, ESP32 điều khiển servo cửa chính/gara, hiển thị kết quả trên LCD và gửi event.
- Xe được đưa sát cửa gara từ bên trong. Cảm biến siêu âm phát hiện khoảng cách gần, ESP32 mở cửa gara bằng servo, sau đó tự đóng khi xe rời khỏi vùng phát hiện.
- Người đi qua hành lang hoặc cầu thang. Một trong hai cảm biến PIR/IR phát hiện chuyển động, ESP32 bật đèn và tự tắt khi không còn người.
- Nhiệt độ hoặc độ ẩm trong nhà thay đổi. DHT11 cung cấp dữ liệu môi trường, ESP32 điều khiển động cơ DC theo logic tự động hoặc theo lệnh từ giao diện phần mềm.
- Server nhận dữ liệu trạng thái/event từ ESP32, lưu lại lịch sử và hiển thị trên dashboard cho người dùng.
- Web app quản lý thẻ RFID, mật khẩu tạm, điều khiển thiết bị, xem event timeline và nhận dữ liệu realtime qua SSE/WebSocket gateway.

## 5. Yêu cầu dự án

Dự án hướng đến một hệ thống SmartHome có cả phần nhúng, phần giao tiếp mạng và phần giao diện giám sát.

Các yêu cầu chính:

- Có khả năng giám sát và điều khiển từ xa thông qua phần mềm.
- Có khả năng chạy offline để đảm bảo các chức năng thiết yếu vẫn hoạt động khi mất mạng.
- Có lưu trữ dữ liệu cảm biến và trạng thái thiết bị để xem lại lịch sử.
- Có trực quan hóa dữ liệu lịch sử, ví dụ nhiệt độ, độ ẩm, trạng thái cửa, gara, đèn, quạt và chuyển động.
- Có theo dõi dữ liệu online theo thời gian thực, mỗi bản ghi/event nên có timestamp.
- Có cảnh báo bất thường hoặc đột biến, ví dụ cửa mở quá lâu, gara mở bất thường, nhiều lần nhập sai mật khẩu, nhiệt độ/độ ẩm vượt ngưỡng.
- Các chức năng nên có tính ứng dụng thực tế, giải quyết nhu cầu cụ thể trong ngữ cảnh nhà ở.

## 6. Định hướng phát triển tiếp theo

Một số hướng phát triển phù hợp với mục tiêu sản phẩm:

- Phân quyền RFID theo từng thẻ: thẻ mở cửa chính, thẻ mở gara, thẻ khách, thẻ quản trị.
- Hoàn thiện hệ thống lưu dữ liệu lịch sử cho cảm biến và trạng thái thiết bị.
- Bổ sung dashboard trực quan hóa dữ liệu theo thời gian.
- Bổ sung cảnh báo realtime trên giao diện khi có dữ liệu bất thường.
- Thêm timestamp chuẩn cho tất cả event và bản ghi cảm biến.
- Làm rõ vai trò của động cơ DC: quạt thông gió/hút ẩm hoặc mô hình điều hòa tự động.
- Bổ sung cơ chế bảo mật cho điều khiển từ xa: xác thực người dùng, phân quyền lệnh, hạn chế thao tác nguy hiểm.

## 7. Cơ sở tham khảo định hướng

Một số nền tảng và hướng triển khai thực tế có thể tham khảo:

- Home Assistant: nền tảng nhà thông minh mở, tập trung vào tích hợp thiết bị và automation local.
- InfluxDB hoặc các time-series database: phù hợp để lưu dữ liệu cảm biến theo thời gian.
- Grafana hoặc dashboard tương tự: phù hợp để trực quan hóa dữ liệu và cấu hình cảnh báo.
- Các khuyến nghị bảo mật IoT: hữu ích khi hệ thống có điều khiển từ xa và lưu dữ liệu người dùng.
