"""
seed_mock_stats.py

Tạo dữ liệu mock LOCAL cho dashboard SmartHome, không ghi Firestore:
- logs/local/stats/daily-stats-YYYY-MM-DD.json
- logs/local/events/events-YYYY-MM-DD.jsonl
- logs/local/status/status-YYYY-MM-DD.jsonl

Mặc định tạo 30 ngày gần nhất.
Cách chạy:
    python seed_mock_stats.py
    python seed_mock_stats.py --days 30 --clear-mock
    python seed_mock_stats.py --output ./logs/local
"""

from __future__ import annotations

import argparse
import json
import math
import random
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

TZ_LABEL = "Asia/Ho_Chi_Minh"


def period_for_hour(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 18:
        return "afternoon"
    return "night"


def empty_bucket(period: str) -> dict[str, Any]:
    return {
        "hasData": False,
        "noData": True,
        "period": period,
        "sampleCount": 0,
        "tempSum": 0,
        "tempCount": 0,
        "humiditySum": 0,
        "humidityCount": 0,
        "avgTemperature": None,
        "avgHumidity": None,
        "minTemperature": None,
        "maxTemperature": None,
        "minHumidity": None,
        "maxHumidity": None,
        "lightOnMinutes": 0,
        "fanOnMinutes": 0,
        "doorOpenMinutes": 0,
        "garageOpenMinutes": 0,
        "unlocks": 0,
        "failedAccess": 0,
        "garageEvents": 0,
        "lockouts": 0,
        "anomalies": 0,
        "anomalyTags": [],
    }


def date_ids(days: int) -> list[str]:
    today = datetime.now().date()
    start = today - timedelta(days=days - 1)
    return [(start + timedelta(days=i)).isoformat() for i in range(days)]


def event_row(date_id: str, event_type: str, hour: int, minute: int, message: str, **extra: Any) -> dict[str, Any]:
    created = datetime.fromisoformat(f"{date_id}T{hour:02d}:{minute:02d}:00")
    return {
        "id": f"mock_{date_id}_{event_type}_{hour:02d}{minute:02d}_{random.randint(1000,9999)}",
        "type": event_type,
        "source": extra.pop("source", "mock_data"),
        "target": extra.pop("target", "system"),
        "message": message,
        "createdAtIso": created.isoformat(timespec="seconds"),
        "time": created.strftime("%H:%M:%S"),
        "metadata": {"mock": True, "timezone": TZ_LABEL, **extra},
    }


def build_daily_stat(date_id: str, index: int, days: int) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    rng = random.Random(f"smarthome-local-{date_id}")
    today_id = datetime.now().date().isoformat()
    is_today = date_id == today_id
    current_hour = datetime.now().hour if is_today else 23
    phase = index / max(days - 1, 1)

    hourly: dict[str, dict[str, Any]] = {}
    events: list[dict[str, Any]] = []
    status_rows: list[dict[str, Any]] = []

    totals = {
        "fanOnMinutes": 0,
        "lightOnMinutes": 0,
        "unlocks": 0,
        "failedAccess": 0,
        "garageEvents": 0,
        "lockouts": 0,
        "anomalies": 0,
        "doorOpenMinutes": 0,
        "garageOpenMinutes": 0,
    }
    temp_sum = hum_sum = 0.0
    temp_count = hum_count = 0
    min_temp = max_temp = min_hum = max_hum = None

    anomaly_hours: set[int] = set()
    if index % 8 in {2, 5}:
        anomaly_hours.add(rng.choice([13, 14, 15]))
    if index % 9 in {3, 7}:
        anomaly_hours.add(rng.choice([1, 2, 22]))

    for hour in range(24):
        hour_key = f"{hour:02d}"
        period = period_for_hour(hour)
        if is_today and hour > current_hour:
            hourly[hour_key] = empty_bucket(period)
            continue

        daylight_curve = math.sin((hour - 7) / 24 * math.tau)
        commute_peak = 1 if hour in {7, 8, 17, 18, 19} else 0
        sample_count = rng.randint(4, 8)
        temp = 28.0 + daylight_curve * 3.3 + math.sin(phase * math.pi) * 1.1 + rng.uniform(-0.6, 0.6)
        humidity = 62 - daylight_curve * 8 + rng.uniform(-3.5, 3.5)

        anomalies = 0
        anomaly_tags: list[str] = []
        if hour in anomaly_hours:
            anomalies += 1
            if 12 <= hour <= 16:
                temp += rng.uniform(6.5, 9.5)
                anomaly_tags.append("temperature_high")
            elif hour <= 3:
                humidity += rng.uniform(20, 28)
                anomaly_tags.append("humidity_high")
            else:
                humidity -= rng.uniform(24, 32)
                anomaly_tags.append("humidity_low")

        avg_temp = round(temp, 1)
        avg_humidity = round(max(18, min(96, humidity)), 1)
        light_minutes = rng.randint(7, 19) if hour < 6 or hour >= 18 else rng.randint(0, 5)
        fan_minutes = max(0, int((avg_temp - 29) * 5 + rng.randint(0, 7)))
        unlocks = rng.randint(0, 2) + commute_peak
        garage_events = rng.randint(0, 1) + (1 if hour in {7, 18} and rng.random() < 0.75 else 0)
        failed_access = rng.randint(0, 1) if rng.random() < 0.13 else 0
        lockouts = 0

        if hour in {21, 22} and rng.random() < 0.22:
            failed_access += rng.randint(3, 5)
            lockouts = 1
            anomalies += 1
            anomaly_tags.append("access_fail_spike")

        door_open_minutes = round(unlocks * rng.uniform(0.15, 0.75), 2)
        garage_open_minutes = round(garage_events * rng.uniform(0.25, 1.2), 2)
        bucket = {
            "hasData": True,
            "noData": False,
            "period": period,
            "sampleCount": sample_count,
            "tempSum": round(avg_temp * sample_count, 1),
            "tempCount": sample_count,
            "humiditySum": round(avg_humidity * sample_count, 1),
            "humidityCount": sample_count,
            "avgTemperature": avg_temp,
            "avgHumidity": avg_humidity,
            "minTemperature": round(avg_temp - rng.uniform(0.4, 1.1), 1),
            "maxTemperature": round(avg_temp + rng.uniform(0.4, 1.1), 1),
            "minHumidity": round(avg_humidity - rng.uniform(1, 4), 1),
            "maxHumidity": round(avg_humidity + rng.uniform(1, 4), 1),
            "lightOnMinutes": light_minutes,
            "fanOnMinutes": fan_minutes,
            "doorOpenMinutes": door_open_minutes,
            "garageOpenMinutes": garage_open_minutes,
            "unlocks": unlocks,
            "failedAccess": failed_access,
            "garageEvents": garage_events,
            "lockouts": lockouts,
            "anomalies": anomalies,
            "anomalyTags": anomaly_tags,
        }
        hourly[hour_key] = bucket

        temp_sum += bucket["tempSum"]
        hum_sum += bucket["humiditySum"]
        temp_count += sample_count
        hum_count += sample_count
        min_temp = bucket["minTemperature"] if min_temp is None else min(min_temp, bucket["minTemperature"])
        max_temp = bucket["maxTemperature"] if max_temp is None else max(max_temp, bucket["maxTemperature"])
        min_hum = bucket["minHumidity"] if min_hum is None else min(min_hum, bucket["minHumidity"])
        max_hum = bucket["maxHumidity"] if max_hum is None else max(max_hum, bucket["maxHumidity"])
        for key in totals:
            totals[key] += bucket.get(key, 0)

        if unlocks:
            events.append(event_row(date_id, "access_success", hour, rng.randint(2, 55), "Mock: mở cửa chính hợp lệ", target="mainDoor", count=unlocks))
        if garage_events:
            events.append(event_row(date_id, "device_state_changed", hour, rng.randint(2, 55), "Mock: gara hoạt động", target="garageDoor", count=garage_events))
        if failed_access:
            events.append(event_row(date_id, "access_failed", hour, rng.randint(2, 55), "Mock: có lần nhập sai thẻ/mật khẩu", target="mainDoor", count=failed_access))
        if lockouts:
            events.append(event_row(date_id, "access_lockout", hour, rng.randint(2, 55), "Mock: lockout do nhập sai quá nhiều", target="mainDoor", seconds=60))
        for tag in anomaly_tags:
            events.append(event_row(date_id, "anomaly", hour, rng.randint(2, 55), f"Mock anomaly: {tag}", target="environment" if "access" not in tag else "mainDoor", tag=tag))

        for minute in (0, 30):
            status_rows.append({
                "createdAtIso": f"{date_id}T{hour:02d}:{minute:02d}:00",
                "time": f"{hour:02d}:{minute:02d}:00",
                "door": "CLOSED",
                "gara": "CLOSED",
                "garageMode": "AUTO",
                "temp": avg_temp,
                "humidity": avg_humidity,
                "motion": rng.random() < 0.25,
                "fan": "FORWARD" if fan_minutes > 0 else "OFF",
                "fanPct": 60 if fan_minutes > 0 else 0,
                "fanMode": "AUTO",
                "light": light_minutes > 0 and (hour < 6 or hour >= 18),
                "lightMode": "AUTO",
                "lightBrightness": 70,
                "lightEffect": "static",
                "lightHold": 20,
                "autoCloseSeconds": 30,
                "dist": rng.randint(10, 40),
            })

    latest_hour = f"{current_hour:02d}" if is_today else "23"
    latest = hourly.get(latest_hour) or {}
    doc = {
        "hasData": True,
        "noData": False,
        "date": date_id,
        "hourly": hourly,
        "lightOnMinutes": round(totals["lightOnMinutes"]),
        "fanOnMinutes": round(totals["fanOnMinutes"]),
        "doorOpenMinutes": round(totals["doorOpenMinutes"], 2),
        "garageOpenMinutes": round(totals["garageOpenMinutes"], 2),
        "unlocks": int(totals["unlocks"]),
        "failedAccess": int(totals["failedAccess"]),
        "garageEvents": int(totals["garageEvents"]),
        "lockouts": int(totals["lockouts"]),
        "anomalies": int(totals["anomalies"]),
        "statusUpdates": int(sum((hourly[h].get("sampleCount") or 0) for h in hourly)),
        "avgTemperature": round(temp_sum / temp_count, 1) if temp_count else latest.get("avgTemperature"),
        "avgHumidity": round(hum_sum / hum_count, 1) if hum_count else latest.get("avgHumidity"),
        "minTemperature": min_temp,
        "maxTemperature": max_temp,
        "minHumidity": min_hum,
        "maxHumidity": max_hum,
        "lastTemperature": latest.get("avgTemperature"),
        "lastHumidity": latest.get("avgHumidity"),
        "mock": True,
        "updatedAtIso": datetime.now().isoformat(timespec="seconds"),
    }
    return doc, events, status_rows


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed mock local logs/stats cho SmartHome dashboard.")
    parser.add_argument("--days", type=int, default=30, help="Số ngày mock, mặc định 30.")
    parser.add_argument("--output", default="./logs/local", help="Thư mục local data của server.")
    parser.add_argument("--clear-mock", action="store_true", help="Xóa dữ liệu mock cũ trong thư mục output trước khi seed.")
    args = parser.parse_args()

    days = max(1, min(365, args.days))
    base = Path(args.output).resolve()
    if args.clear_mock and base.exists():
        shutil.rmtree(base)
    stats_dir = base / "stats"
    events_dir = base / "events"
    status_dir = base / "status"
    stats_dir.mkdir(parents=True, exist_ok=True)
    events_dir.mkdir(parents=True, exist_ok=True)
    status_dir.mkdir(parents=True, exist_ok=True)

    total_events = 0
    total_status = 0
    for idx, date_id in enumerate(date_ids(days)):
        daily, events, status_rows = build_daily_stat(date_id, idx, days)
        write_json(stats_dir / f"daily-stats-{date_id}.json", daily)
        write_jsonl(events_dir / f"events-{date_id}.jsonl", events)
        write_jsonl(status_dir / f"status-{date_id}.jsonl", status_rows)
        total_events += len(events)
        total_status += len(status_rows)

    print(f"Đã tạo mock local {days} ngày tại: {base}")
    print(f"- daily stats: {days} file")
    print(f"- events: {total_events} dòng JSONL")
    print(f"- status samples: {total_status} dòng JSONL")


if __name__ == "__main__":
    main()
