#!/usr/bin/env python3
"""Descarga las observaciones convencionales recientes de AEMET y genera JSON estático."""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_ENDPOINT = "https://opendata.aemet.es/opendata/api/observacion/convencional/todas"
OUTPUT = Path(__file__).resolve().parents[1] / "datos" / "observaciones_aemet.json"
USER_AGENT = "MetVlc-Meteogramas/6.3 (+GitHub Actions)"

# Provincia de Valencia y un margen amplio para poder encontrar estaciones cercanas
# al Rincón de Ademuz, Requena-Utiel, Ayora y zonas limítrofes.
BBOX = {"lat_min": 37.4, "lat_max": 41.2, "lon_min": -2.6, "lon_max": 1.1}


def get_json(url: str) -> object:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
    with urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8-sig"))


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def dewpoint(temp_c, rh):
    t = number(temp_c)
    h = number(rh)
    if t is None or h is None or h <= 0:
        return None
    h = max(0.1, min(100.0, h))
    a, b = 17.67, 243.5
    gamma = math.log(h / 100.0) + (a * t) / (b + t)
    return b * gamma / (a - gamma)


def parse_time(value: str | None) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    text = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def in_bbox(lat, lon) -> bool:
    return (
        lat is not None
        and lon is not None
        and BBOX["lat_min"] <= lat <= BBOX["lat_max"]
        and BBOX["lon_min"] <= lon <= BBOX["lon_max"]
    )


def normalize(record: dict) -> dict | None:
    lat = number(record.get("lat"))
    lon = number(record.get("lon"))
    if not in_bbox(lat, lon):
        return None
    temp = number(record.get("ta"))
    rh = number(record.get("hr"))
    td = number(record.get("tpr"))
    if td is None:
        td = dewpoint(temp, rh)
    return {
        "id": str(record.get("idema") or "").strip(),
        "name": str(record.get("ubi") or record.get("idema") or "Estación AEMET").strip(),
        "lat": lat,
        "lon": lon,
        "alt": number(record.get("alt")),
        "time": record.get("fint"),
        "temp": temp,
        "rh": rh,
        "dewpoint": td,
        "wind_speed": number(record.get("vv")),
        "wind_direction": number(record.get("dv")),
        "gust": number(record.get("vmax")),
        "gust_direction": number(record.get("dmax")),
        "precip": number(record.get("prec")),
        "pressure": number(record.get("pres")),
    }


def main() -> int:
    api_key = os.environ.get("AEMET_API_KEY", "").strip()
    if not api_key:
        print("Falta la variable AEMET_API_KEY", file=sys.stderr)
        return 2

    metadata_url = f"{API_ENDPOINT}?{urlencode({'api_key': api_key})}"
    metadata = get_json(metadata_url)
    if not isinstance(metadata, dict) or not metadata.get("datos"):
        raise RuntimeError(f"AEMET no devolvió la URL de datos: {metadata!r}")

    raw = get_json(str(metadata["datos"]))
    if not isinstance(raw, list):
        raise RuntimeError("La respuesta de observaciones AEMET no es una lista")

    latest: dict[str, dict] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        normalized = normalize(item)
        if not normalized or not normalized["id"]:
            continue
        previous = latest.get(normalized["id"])
        if previous is None or parse_time(normalized["time"]) > parse_time(previous["time"]):
            latest[normalized["id"]] = normalized

    stations = sorted(latest.values(), key=lambda station: (station["name"], station["id"]))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "AEMET OpenData · observación convencional",
        "station_count": len(stations),
        "stations": stations,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Escritas {len(stations)} estaciones en {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
