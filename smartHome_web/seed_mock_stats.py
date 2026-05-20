"""
seed_mock_stats.py

Tạo mock data thống kê tối giản cho dashboard SmartHome.

Script chỉ seed các document cần cho trang Analytics:
- dailyStats/{yyyy-mm-dd}: một document mỗi ngày
- events/{auto id}: một vài event truy cập mẫu, tùy chọn

Cách chạy:
    python seed_mock_stats.py
    python seed_mock_stats.py --days 14
    python seed_mock_stats.py --service-account ./config/firebase_key.json --no-events
"""

from __future__ import annotations

import argparse
import math
import os
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


def load_environment() -> None:
    if load_dotenv is not None:
        load_dotenv()


def get_service_account_path(cli_path: str | None) -> Path:
    raw_path = (
        cli_path
        or os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        or "./config/firebase_key.json"
    )
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = Path(__file__).resolve().parent / path
    path = path.resolve()
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy service account JSON: {path}")
    return path


def init_firebase(service_account_path: Path) -> firestore.Client:
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(service_account_path))
        firebase_admin.initialize_app(cred)
    return firestore.client()


def server_timestamp() -> Any:
    return firestore.SERVER_TIMESTAMP


def date_ids(days: int) -> list[str]:
    today = datetime.now().date()
    start = today - timedelta(days=days - 1)
    return [(start + timedelta(days=i)).isoformat() for i in range(days)]


def build_daily_stat(date_id: str, index: int, days: int) -> dict[str, Any]:
    random.seed(f"smarthome-{date_id}")
    phase = index / max(days - 1, 1)
    avg_temp = round(28.5 + math.sin(phase * math.pi) * 3.2 + random.uniform(-0.6, 0.6), 1)
    avg_humidity = round(62 + math.cos(phase * math.pi * 1.4) * 8 + random.uniform(-3, 3), 1)
    unlocks = random.randint(2, 9)
    garage_events = random.randint(1, 6)
    lockouts = 1 if random.random() < 0.18 else 0
    fan_minutes = max(0, int((avg_temp - 27) * 18 + random.randint(4, 22)))
    light_minutes = random.randint(12, 65)
    hourly: dict[str, dict[str, Any]] = {}
    temp_sum = 0.0
    hum_sum = 0.0
    min_temp = None
    max_temp = None
    min_hum = None
    max_hum = None

    for hour in range(24):
        hour_key = f"{hour:02d}"
        day_curve = math.sin((hour - 6) / 24 * math.pi * 2)
        temp = round(avg_temp + day_curve * 2.4 + random.uniform(-0.5, 0.5), 1)
        humidity = round(avg_humidity - day_curve * 5 + random.uniform(-2, 2), 1)
        sample_count = random.randint(2, 6)
        hour_light = random.randint(0, 8) if hour < 6 or hour > 18 else random.randint(0, 3)
        hour_fan = max(0, int((temp - 27) * 3 + random.randint(0, 5)))
        hour_unlocks = random.randint(0, 2) if 6 <= hour <= 22 else 0
        hour_failed = 1 if random.random() < 0.06 else 0
        hour_garage = 1 if random.random() < 0.1 else 0
        hour_lockout = 1 if lockouts and random.random() < 0.04 else 0
        hour_anomaly = 1 if temp >= 38 or humidity >= 85 or humidity <= 25 else 0

        hourly[hour_key] = {
            "sampleCount": sample_count,
            "tempSum": round(temp * sample_count, 1),
            "tempCount": sample_count,
            "humiditySum": round(humidity * sample_count, 1),
            "humidityCount": sample_count,
            "avgTemperature": temp,
            "avgHumidity": humidity,
            "minTemperature": round(temp - random.uniform(0, 0.8), 1),
            "maxTemperature": round(temp + random.uniform(0, 0.8), 1),
            "minHumidity": round(humidity - random.uniform(0, 2), 1),
            "maxHumidity": round(humidity + random.uniform(0, 2), 1),
            "lightOnMinutes": hour_light,
            "fanOnMinutes": hour_fan,
            "unlocks": hour_unlocks,
            "failedAccess": hour_failed,
            "garageEvents": hour_garage,
            "lockouts": hour_lockout,
            "anomalies": hour_anomaly,
        }
        temp_sum += temp
        hum_sum += humidity
        min_temp = temp if min_temp is None else min(min_temp, temp)
        max_temp = temp if max_temp is None else max(max_temp, temp)
        min_hum = humidity if min_hum is None else min(min_hum, humidity)
        max_hum = humidity if max_hum is None else max(max_hum, humidity)

    light_minutes = sum(bucket["lightOnMinutes"] for bucket in hourly.values())
    fan_minutes = sum(bucket["fanOnMinutes"] for bucket in hourly.values())
    unlocks = sum(bucket["unlocks"] for bucket in hourly.values()) or unlocks
    garage_events = sum(bucket["garageEvents"] for bucket in hourly.values()) or garage_events
    failed_access = sum(bucket["failedAccess"] for bucket in hourly.values())
    lockouts = sum(bucket["lockouts"] for bucket in hourly.values()) or lockouts
    anomalies = sum(bucket["anomalies"] for bucket in hourly.values())

    return {
        "date": date_id,
        "avgTemperature": round(temp_sum / 24, 1),
        "avgHumidity": round(hum_sum / 24, 1),
        "minTemperature": min_temp,
        "maxTemperature": max_temp,
        "minHumidity": min_hum,
        "maxHumidity": max_hum,
        "lastTemperature": hourly["23"]["avgTemperature"],
        "lastHumidity": hourly["23"]["avgHumidity"],
        "fanOnMinutes": fan_minutes,
        "lightOnMinutes": light_minutes,
        "statusUpdates": random.randint(180, 720),
        "unlocks": unlocks,
        "failedAccess": failed_access,
        "garageEvents": garage_events,
        "lockouts": lockouts,
        "anomalies": anomalies,
        "hourly": hourly,
        "updatedAt": server_timestamp(),
        "updatedAtIso": datetime.now().isoformat(timespec="seconds"),
        "mock": True,
    }


def event_for_day(date_id: str, event_type: str, hour: int, message: str) -> dict[str, Any]:
    created = datetime.fromisoformat(f"{date_id}T{hour:02d}:15:00")
    target = "mainDoor" if "cửa" in message.lower() else "garageDoor"
    return {
        "type": event_type,
        "source": "mock_data",
        "target": target,
        "message": message,
        "createdAt": server_timestamp(),
        "createdAtIso": created.isoformat(timespec="seconds"),
        "metadata": {"mock": True},
    }


def seed_mock_data(db: firestore.Client, days: int, include_events: bool) -> None:
    ids = date_ids(days)
    batch = db.batch()

    for index, date_id in enumerate(ids):
        batch.set(db.collection("dailyStats").document(date_id), build_daily_stat(date_id, index, days), merge=True)

        if include_events:
            batch.set(
                db.collection("events").document(f"mock_{date_id}_access"),
                event_for_day(date_id, "access_success", 8, "Mock: mở cửa chính hợp lệ"),
                merge=True,
            )
            batch.set(
                db.collection("events").document(f"mock_{date_id}_garage"),
                event_for_day(date_id, "device_state_changed", 18, "Mock: gara hoạt động"),
                merge=True,
            )

    batch.commit()
    print(f"✅ Đã tạo mock dailyStats cho {days} ngày gần nhất.")
    if include_events:
        print(f"✅ Đã tạo {days * 2} mock events.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed mock data thống kê SmartHome.")
    parser.add_argument("--service-account", help="Đường dẫn service account JSON.")
    parser.add_argument("--days", type=int, default=7, help="Số ngày mock data, mặc định 7.")
    parser.add_argument("--no-events", action="store_true", help="Chỉ tạo dailyStats, không tạo mock events.")
    args = parser.parse_args()

    if args.days < 7:
        raise ValueError("--days nên >= 7 để dashboard có đủ dữ liệu thống kê.")
    if args.days > 30:
        raise ValueError("--days tối đa 30 để tránh seed quá nhiều dữ liệu.")

    load_environment()
    db = init_firebase(get_service_account_path(args.service_account))
    seed_mock_data(db, args.days, include_events=not args.no_events)


if __name__ == "__main__":
    main()
