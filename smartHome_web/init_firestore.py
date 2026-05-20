"""
init_firestore.py

Khởi tạo cấu trúc dữ liệu Firebase Cloud Firestore cho hệ thống SmartHome ESP32.

Kiến trúc đề xuất:
ESP32 <-> Node.js WebSocket/API <-> Firebase Firestore <-> Web App

Script này sẽ tạo/cập nhật các document nền tảng:
- devices/mainDoor
- devices/garageDoor
- devices/hallwayLight
- devices/environmentFan
- devices/esp32
- systemSettings/main
- webUsers/{admin username}
- accessPasswords/master
- schemaDocs/* để ghi chú cấu trúc các collection chính
- dailyStats/{yyyy-mm-dd} để dashboard thống kê theo ngày

Yêu cầu:
    pip install firebase-admin python-dotenv bcrypt

Cách chạy:
    python init_firestore.py

Tạo mock data thống kê 7 ngày:
    python seed_mock_stats.py

Xóa dữ liệu SmartHome cũ rồi seed lại:
    python init_firestore.py --reset

Tạo web user mặc định:
    python init_firestore.py --admin-username admin --admin-password your-password

Hoặc khai báo trong .env:
    WEB_ADMIN_USERNAME=admin
    WEB_ADMIN_PASSWORD=your-password
    WEB_ADMIN_DISPLAY_NAME=Chủ nhà

Hoặc sửa trực tiếp các biến DEFAULT_WEB_USERNAME / DEFAULT_WEB_PASSWORD bên dưới.
Mật khẩu master mặc định cho keypad là DEFAULT_KEYPAD_MASTER_PASSWORD = "123456".

Hoặc chỉ định file service account:
    python init_firestore.py --service-account ./config/firebase-service-account.json

Lưu ý bảo mật:
- Không lưu mật khẩu thật dạng plain text trong Firestore.
- Nếu có WEB_ADMIN_PASSWORD hoặc --admin-password, script sẽ lưu bcrypt hash.
- Nếu không truyền password, passwordHash chỉ là placeholder.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any, Dict

import firebase_admin
from firebase_admin import credentials, firestore

try:
    import bcrypt
except ImportError:
    bcrypt = None

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


def load_environment() -> None:
    """Load .env nếu đã cài python-dotenv."""
    if load_dotenv is not None:
        load_dotenv()


def get_service_account_path(cli_path: str | None) -> Path:
    """Lấy đường dẫn service account từ CLI hoặc biến môi trường."""
    raw_path = cli_path or os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")

    if not raw_path:
        raise ValueError(
            "Thiếu FIREBASE_SERVICE_ACCOUNT_PATH. "
            "Hãy khai báo trong .env hoặc truyền --service-account."
        )

    path = Path(raw_path).expanduser().resolve()

    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy service account JSON: {path}")

    return path


def init_firebase(service_account_path: Path) -> firestore.Client:
    """Khởi tạo Firebase Admin SDK và trả về Firestore client."""
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(service_account_path))
        firebase_admin.initialize_app(cred)

    return firestore.client()


def server_timestamp() -> Any:
    return firestore.SERVER_TIMESTAMP


DEFAULT_WEB_USERNAME = "admin"
DEFAULT_WEB_PASSWORD = "12345678"
DEFAULT_WEB_DISPLAY_NAME = "Chủ nhà"
DEFAULT_KEYPAD_MASTER_PASSWORD = "123456"


SMART_HOME_COLLECTIONS = [
    "devices",
    "systemSettings",
    "webUsers",
    "accessPasswords",
    "schemaDocs",
    "events",
    "dailyStats",
    "accessCards",
    "systemState",
]


def firestore_doc_id(raw: str) -> str:
    """Chuyển username thành Firestore document id hợp lệ."""
    doc_id = raw.strip()
    if not doc_id:
        raise ValueError("Admin username không được để trống.")
    if "/" in doc_id:
        raise ValueError("Admin username không được chứa ký tự '/'.")
    if doc_id in {".", ".."}:
        raise ValueError("Admin username không được là '.' hoặc '..'.")
    return doc_id


def hash_password(password: str) -> str:
    """Hash password bằng bcrypt để Node.js có thể verify bằng package bcrypt."""
    if bcrypt is None:
        raise RuntimeError(
            "Thiếu package bcrypt cho Python. "
            "Hãy chạy: pip install bcrypt"
        )
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def build_admin_user(username: str, password: str | None, display_name: str) -> tuple[str, Dict[str, Any]]:
    """Tạo document webUsers mặc định từ CLI/env."""
    user_id = firestore_doc_id(username)
    password_hash = (
        hash_password(password)
        if password
        else "CHANGE_ME_BCRYPT_HASH_FOR_WEB_LOGIN"
    )

    return user_id, {
        "userId": user_id,
        "username": username.strip(),
        "displayName": display_name.strip() or "Chủ nhà",
        "role": "owner",
        "enabled": True,
        "passwordHash": password_hash,
        "passwordHashAlgo": "bcrypt" if password else "placeholder",
        "lastLoginAt": None,
        "createdAt": server_timestamp(),
        "updatedAt": server_timestamp(),
    }


def build_keypad_master_password() -> Dict[str, Any]:
    """Tạo document mật khẩu master mặc định cho keypad."""
    return {
        "name": "Mật khẩu chính",
        "type": "master",
        "enabled": True,
        "target": "mainDoor",
        "accessType": "full_time",
        "passwordHash": hash_password(DEFAULT_KEYPAD_MASTER_PASSWORD),
        "passwordHashAlgo": "bcrypt",
        "defaultLength": 6,
        "timeWindow": None,
        "dateRange": None,
        "autoDeleteWhenExpired": False,
        "createdAt": server_timestamp(),
        "updatedAt": server_timestamp(),
    }


def seed_documents(admin_user: tuple[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Các document mặc định cho hệ thống SmartHome."""
    admin_user_id, admin_user_data = admin_user

    return {
        "devices/mainDoor": {
            "deviceId": "mainDoor",
            "type": "servo_door",
            "name": "Cửa chính",
            "state": "closed",
            "controlMode": "auto",
            "autoCloseSeconds": 30,
            "lockedUntil": None,
            "updatedAt": server_timestamp(),
        },
        "devices/garageDoor": {
            "deviceId": "garageDoor",
            "type": "servo_garage",
            "name": "Cửa gara",
            "state": "closed",
            "controlMode": "auto",
            "autoCloseSeconds": 30,
            "ultrasonicEnabled": True,
            "updatedAt": server_timestamp(),
        },
        "devices/hallwayLight": {
            "deviceId": "hallwayLight",
            "type": "led_light",
            "name": "Đèn hành lang",
            "state": "off",
            "controlMode": "auto",
            "minOnSeconds": 20,
            "effect": "static",
            "maxBrightness": 70,
            "updatedAt": server_timestamp(),
        },
        "devices/environmentFan": {
            "deviceId": "environmentFan",
            "type": "dc_fan",
            "name": "Quạt môi trường",
            "state": "off",
            "controlMode": "auto",
            "speed": 180,
            "temperatureOnThreshold": 32,
            "temperatureOffThreshold": 30,
            "humidityOnThreshold": 75,
            "humidityOffThreshold": 65,
            "updatedAt": server_timestamp(),
        },
        "devices/esp32": {
            "deviceId": os.getenv("ESP32_DEVICE_ID", "esp32-main"),
            "type": "controller",
            "name": "ESP32 trung tâm",
            "online": False,
            "lastSeenAt": None,
            "lastSeenAtIso": None,
            "lastStatus": None,
            "firmwareVersion": None,
            "configVersion": 1,
            "updatedAt": server_timestamp(),
        },
        "systemState/current": {
            "door": "CLOSED",
            "temp": None,
            "humidity": None,
            "motion": False,
            "gara": "CLOSED",
            "garageMode": "AUTO",
            "fan": "OFF",
            "fanPct": 0,
            "fanMode": "AUTO",
            "light": False,
            "lightMode": "AUTO",
            "lightBrightness": 70,
            "lightEffect": "static",
            "lightHold": 20,
            "dist": None,
            "updatedAt": server_timestamp(),
            "updatedAtIso": None,
        },
        "systemSettings/main": {
            "systemName": "SmartHome ESP32",
            "timezone": os.getenv("APP_TIMEZONE", "Asia/Ho_Chi_Minh"),
            "configVersion": 1,
            "accessLockout": {
                "maxFailedAttempts": 3,
                "initialLockSeconds": 30,
                "multiplierAfterEachLock": 2,
                "unlockByWebApp": True,
            },
            "offlineMode": {
                "enabled": True,
                "syncWhenOnline": True,
                "maxQueuedEvents": 500,
            },
            "createdAt": server_timestamp(),
            "updatedAt": server_timestamp(),
        },
        f"webUsers/{admin_user_id}": admin_user_data,
        "accessPasswords/master": build_keypad_master_password(),
        "schemaDocs/accessCards": {
            "collection": "accessCards",
            "description": "Lưu thông tin thẻ RFID, tên thẻ, trạng thái, target, quyền và thời hạn.",
            "example": {
                "uid": "A1B2C3D4",
                "name": "Thẻ chủ nhà",
                "enabled": True,
                "target": "mainDoor",
                "accessType": "full_time",
                "timeWindow": None,
                "dateRange": None,
                "createdAtIso": "2026-05-20T10:00:00.000Z",
                "updatedAtIso": "2026-05-20T10:00:00.000Z",
            },
            "updatedAt": server_timestamp(),
        },
        "schemaDocs/accessPasswords": {
            "collection": "accessPasswords",
            "description": "Lưu PIN keypad dạng bcrypt hash; chỉ có một master, các PIN khác có thể full_time, theo khung giờ, theo khoảng ngày hoặc hết hạn tương đối.",
            "example": {
                "name": "Mã khách 30 phút",
                "type": "guest",
                "target": "mainDoor",
                "enabled": True,
                "accessType": "full_time",
                "expiresAtIso": "2026-05-20T10:30:00.000Z",
                "autoDeleteWhenExpired": True,
                "passwordHash": "bcrypt",
                "passwordHashAlgo": "bcrypt",
            },
            "updatedAt": server_timestamp(),
        },
        "schemaDocs/systemState": {
            "collection": "systemState",
            "document": "current",
            "description": "Snapshot mới nhất của ESP32 để dashboard đọc nhanh. Server cập nhật có throttle; dashboard realtime vẫn nhận qua SSE.",
            "example": {
                "door": "CLOSED",
                "temp": 31,
                "humidity": 72,
                "motion": True,
                "gara": "CLOSED",
                "garageMode": "AUTO",
                "fan": "OFF",
                "fanPct": 0,
                "fanMode": "AUTO",
                "light": True,
                "lightMode": "AUTO",
                "lightBrightness": 70,
                "lightEffect": "static",
                "lightHold": 20,
                "dist": 18,
            },
            "updatedAt": server_timestamp(),
        },
        "schemaDocs/events": {
            "collection": "events",
            "description": "Lưu timeline nghiệp vụ quan trọng: truy cập, lockout, thay đổi quyền, cảnh báo. Không lưu dữ liệu cảm biến liên tục.",
            "commonTypes": [
                "access_success",
                "access_failed",
                "access_lockout",
                "access_card_created",
                "access_card_enrolled",
                "access_card_deleted",
                "access_password_created",
                "web_login_failed",
                "esp32_connected",
                "esp32_disconnected",
            ],
            "updatedAt": server_timestamp(),
        },
        "schemaDocs/dailyStats": {
            "collection": "dailyStats",
            "description": "Một document mỗi ngày, đủ cho dashboard thống kê mà không cần lưu từng sample cảm biến.",
            "example": {
                "date": "2026-05-20",
                "lightOnMinutes": 18,
                "fanOnMinutes": 25,
                "avgTemperature": 30.5,
                "avgHumidity": 68,
                "minTemperature": 27.8,
                "maxTemperature": 35.2,
                "lastTemperature": 31,
                "lastHumidity": 70,
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
                        "anomalies": 0,
                    }
                },
            },
            "updatedAt": server_timestamp(),
        },
    }


def write_seed_data(
    db: firestore.Client,
    admin_user: tuple[str, Dict[str, Any]],
    overwrite: bool = False,
) -> None:
    """
    Ghi dữ liệu khởi tạo.
    - overwrite=False: set merge=True để không xóa field đã có.
    - overwrite=True: ghi đè document bằng dữ liệu seed.
    """
    docs = seed_documents(admin_user)
    batch = db.batch()

    for path, data in docs.items():
        ref = db.document(path)
        if overwrite:
            batch.set(ref, data)
        else:
            batch.set(ref, data, merge=True)

    batch.commit()


def delete_collection(db: firestore.Client, collection_name: str, batch_size: int = 100) -> int:
    """Xóa toàn bộ document trong một collection, gồm cả subcollection nếu có."""
    deleted = 0
    collection_ref = db.collection(collection_name)

    while True:
        docs = list(collection_ref.limit(batch_size).stream())
        if not docs:
            break

        batch = db.batch()
        for doc in docs:
            for subcollection in doc.reference.collections():
                delete_collection_path(db, subcollection, batch_size=batch_size)
            batch.delete(doc.reference)

        batch.commit()
        deleted += len(docs)

    return deleted


def delete_collection_path(
    db: firestore.Client,
    collection_ref: firestore.CollectionReference,
    batch_size: int = 100,
) -> int:
    """Xóa một collection reference bất kỳ, dùng cho subcollection."""
    deleted = 0

    while True:
        docs = list(collection_ref.limit(batch_size).stream())
        if not docs:
            break

        batch = db.batch()
        for doc in docs:
            for subcollection in doc.reference.collections():
                delete_collection_path(db, subcollection, batch_size=batch_size)
            batch.delete(doc.reference)

        batch.commit()
        deleted += len(docs)

    return deleted


def reset_smart_home_collections(db: firestore.Client) -> None:
    """Xóa dữ liệu trong các collection thuộc hệ thống SmartHome."""
    print("Đang xóa dữ liệu SmartHome cũ trong Firestore...")
    for collection_name in SMART_HOME_COLLECTIONS:
        deleted = delete_collection(db, collection_name)
        print(f"- {collection_name}: đã xóa {deleted} document")


def create_test_event(db: firestore.Client) -> None:
    """Tạo một event kiểm tra kết nối."""
    db.collection("events").add(
        {
            "type": "server_test",
            "source": "init_firestore.py",
            "target": "firebase",
            "message": "Khởi tạo Firestore thành công",
            "createdAt": server_timestamp(),
            "metadata": {
                "script": "init_firestore.py",
            },
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Khởi tạo Firebase Firestore cho SmartHome ESP32."
    )
    parser.add_argument(
        "--service-account",
        help="Đường dẫn tới Firebase service account JSON.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Ghi đè document seed thay vì merge.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Xóa toàn bộ collection dữ liệu SmartHome trước khi seed lại.",
    )
    parser.add_argument(
        "--no-test-event",
        action="store_true",
        help="Không tạo event kiểm tra trong collection events.",
    )
    parser.add_argument(
        "--admin-username",
        help="Username web user mặc định. Nếu bỏ trống sẽ lấy WEB_ADMIN_USERNAME hoặc 'admin'.",
    )
    parser.add_argument(
        "--admin-password",
        help="Mật khẩu web user mặc định. Nếu bỏ trống sẽ lấy WEB_ADMIN_PASSWORD.",
    )
    parser.add_argument(
        "--admin-display-name",
        help="Tên hiển thị web user mặc định. Nếu bỏ trống sẽ lấy WEB_ADMIN_DISPLAY_NAME.",
    )

    args = parser.parse_args()

    load_environment()

    admin_username = args.admin_username or os.getenv("WEB_ADMIN_USERNAME") or DEFAULT_WEB_USERNAME
    admin_password = args.admin_password or os.getenv("WEB_ADMIN_PASSWORD") or DEFAULT_WEB_PASSWORD
    admin_display_name = (
        args.admin_display_name
        or os.getenv("WEB_ADMIN_DISPLAY_NAME")
        or DEFAULT_WEB_DISPLAY_NAME
    )
    admin_user = build_admin_user(admin_username, admin_password, admin_display_name)

    service_account_path = get_service_account_path(args.service_account)
    db = init_firebase(service_account_path)

    if args.reset:
        reset_smart_home_collections(db)

    write_seed_data(db, admin_user=admin_user, overwrite=args.overwrite)

    if not args.no_test_event:
        create_test_event(db)

    print("✅ Đã khởi tạo Firestore cho SmartHome ESP32.")
    print("Các collection/document nền tảng đã được tạo hoặc cập nhật.")
    print(f"Web user mặc định: webUsers/{admin_user[0]}")
    if admin_password:
        print("Password web user đã được lưu bằng bcrypt hash.")
    else:
        print("Chưa có admin password; passwordHash đang là placeholder.")


if __name__ == "__main__":
    main()
