import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

BASE = "https://servicio.mapa.gob.es/siarapi"
TOKEN = os.environ["SIAR_TOKEN"]

SALIDA = Path("datos/observaciones_siar.json")


def descargar_json(url):
    with urllib.request.urlopen(url, timeout=60) as respuesta:
        raw = respuesta.read()

    for codificacion in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return json.loads(raw.decode(codificacion))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue

    raise RuntimeError("No se pudo interpretar la respuesta de SiAR")


def consultar_info(tipo):
    parametros = urllib.parse.urlencode({
        "token": TOKEN
    })

    url = f"{BASE}/API/V1/Info/{tipo}?{parametros}"
    return descargar_json(url)


def consultar_horarios_valencia(fecha):
    parametros = urllib.parse.urlencode({
        "token": TOKEN,
        "Id": "V",
        "FechaInicial": fecha,
        "FechaFinal": fecha
    })

    url = (
        f"{BASE}/API/V1/Datos/Horarios/PROVINCIA?"
        f"{parametros}"
    )

    return descargar_json(url)


def dms_a_decimal(valor):
    """
    Convierte coordenadas SiAR tipo:
    391520000N
    015512000W
    a grados decimales.
    """

    if valor is None:
        return None

    texto = str(valor).strip().upper()

    if not texto:
        return None

    hemisferio = texto[-1]
    numeros = texto[:-1]

    try:
        if hemisferio in ("N", "S"):
            grados = int(numeros[:2])
            minutos = int(numeros[2:4])
            segundos = float(numeros[4:]) / 1000

        elif hemisferio in ("E", "W"):
            grados = int(numeros[:3])
            minutos = int(numeros[3:5])
            segundos = float(numeros[5:]) / 1000

        else:
            return None

        decimal = grados + minutos / 60 + segundos / 3600

        if hemisferio in ("S", "W"):
            decimal *= -1

        return round(decimal, 6)

    except Exception:
        return None


def clave_hora(registro):
    fecha = str(registro.get("Fecha", ""))
    hora = str(registro.get("HorMin", 0)).zfill(4)

    return fecha, hora


def main():

    ahora = datetime.now(ZoneInfo("Europe/Madrid"))
    hoy = ahora.strftime("%Y-%m-%d")

    print(f"Descargando estaciones SiAR...")
    info_estaciones = consultar_info("ESTACIONES")

    estaciones = {}

    for e in info_estaciones.get("datos", []):

        codigo = str(e.get("Codigo", "")).strip()

        if not codigo:
            continue

        estaciones[codigo] = e

    print(f"Descargando observaciones SiAR para {hoy}...")

    respuesta = consultar_horarios_valencia(hoy)
    registros = respuesta.get("datos", [])

    print(f"Registros recibidos: {len(registros)}")

    ultimos = {}

    for r in registros:

        codigo = str(r.get("Estacion", "")).strip()

        if not codigo:
            continue

        if (
            codigo not in ultimos
            or clave_hora(r) > clave_hora(ultimos[codigo])
        ):
            ultimos[codigo] = r

    resultado = []

    for codigo, obs in ultimos.items():

        meta = estaciones.get(codigo, {})

        resultado.append({
            "red": "SIAR",
            "codigo": codigo,

            "nombre": meta.get("Estacion"),
            "municipio": meta.get("Termino"),

            "latitud": dms_a_decimal(meta.get("Latitud")),
            "longitud": dms_a_decimal(meta.get("Longitud")),
            "altitud": meta.get("Altitud"),

            "fecha": obs.get("Fecha"),
            "hora": str(obs.get("HorMin", "")).zfill(4),

            "temperatura": obs.get("TempMedia"),
            "humedad": obs.get("HumedadMedia"),

            "viento": obs.get("VelViento"),
            "direccion_viento": obs.get("DirViento"),

            "precipitacion": obs.get("Precipitacion"),
            "radiacion": obs.get("Radiacion"),

            "temperatura_suelo_1": obs.get("TempSuelo1"),
            "temperatura_suelo_2": obs.get("TempSuelo2")
        })

    resultado.sort(
        key=lambda x: (
            x.get("codigo") or ""
        )
    )

    salida = {
        "fuente": "SiAR - MAPA",
        "tipo": "observaciones_horarias",
        "provincia": "Valencia/València",

        "actualizado": ahora.isoformat(),

        "numero_estaciones": len(resultado),

        "estaciones": resultado
    }

    SALIDA.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        SALIDA,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            salida,
            f,
            ensure_ascii=False,
            indent=2
        )

    print()
    print(
        f"Archivo generado: {SALIDA}"
    )

    print(
        f"Estaciones con observación: "
        f"{len(resultado)}"
    )

    for e in resultado:
        print(
            f'{e["codigo"]} | '
            f'{e["nombre"]} | '
            f'{e["temperatura"]} °C | '
            f'HR {e["humedad"]}%'
        )


if __name__ == "__main__":
    main()
