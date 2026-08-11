import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request

from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


# ============================================================
# CONFIGURACIÓN
# ============================================================

BASE_URL = "https://servicio.mapa.gob.es/siarapi"

TOKEN = os.environ.get("SIAR_TOKEN")

if not TOKEN:
    raise RuntimeError(
        "No se ha encontrado la variable de entorno SIAR_TOKEN."
    )

PROVINCIA_CODIGO = "V"
PROVINCIA_NOMBRE = "Valencia/València"

ZONA_HORARIA = ZoneInfo("Europe/Madrid")

ARCHIVO_SALIDA = Path("datos/observaciones_siar.json")


# ============================================================
# PETICIONES A SIAR
# ============================================================

def descargar_json(url):
    """
    Descarga JSON desde la API SiAR.

    IMPORTANTE:
    Se utilizan User-Agent y Accept porque la petición simple
    de urllib provocaba HTTP 403 desde GitHub Actions.
    """

    solicitud = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 Meteogramas-MetVlc/1.0",
            "Accept": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(
            solicitud,
            timeout=60
        ) as respuesta:

            raw = respuesta.read()

    except urllib.error.HTTPError as error:

        cuerpo = error.read().decode(
            "utf-8",
            errors="replace"
        )

        # Evitar que el token pueda aparecer en los logs
        cuerpo = cuerpo.replace(
            TOKEN,
            "***TOKEN_OCULTO***"
        )

        raise RuntimeError(
            f"Error HTTP SiAR {error.code}: {cuerpo[:1500]}"
        )

    except urllib.error.URLError as error:

        raise RuntimeError(
            f"Error de conexión con SiAR: {error}"
        )

    # Intentamos varias codificaciones por seguridad
    for codificacion in (
        "utf-8-sig",
        "utf-8",
        "cp1252",
        "latin-1"
    ):
        try:
            texto = raw.decode(codificacion)
            return json.loads(texto)

        except (
            UnicodeDecodeError,
            json.JSONDecodeError
        ):
            continue

    raise RuntimeError(
        "No se ha podido interpretar la respuesta JSON de SiAR."
    )


# ============================================================
# SERVICIO INFO
# ============================================================

def consultar_info(tipo):

    parametros = urllib.parse.urlencode({
        "token": TOKEN
    })

    url = (
        f"{BASE_URL}/API/V1/Info/"
        f"{tipo}?{parametros}"
    )

    return descargar_json(url)


# ============================================================
# DATOS HORARIOS DE VALENCIA
# ============================================================

def consultar_horarios_valencia(fecha):

    parametros = urllib.parse.urlencode({
        "token": TOKEN,
        "Id": PROVINCIA_CODIGO,
        "FechaInicial": fecha,
        "FechaFinal": fecha
    })

    url = (
        f"{BASE_URL}/API/V1/Datos/"
        f"Horarios/PROVINCIA?"
        f"{parametros}"
    )

    return descargar_json(url)


# ============================================================
# CONVERSIONES
# ============================================================

def a_float(valor):

    if valor is None:
        return None

    try:

        if isinstance(valor, str):

            valor = valor.strip()

            if not valor:
                return None

            valor = valor.replace(",", ".")

        return float(valor)

    except (ValueError, TypeError):

        return None


def normalizar_hora(valor):

    if valor is None:
        return None

    try:

        numero = int(float(valor))

        return str(numero).zfill(4)

    except (ValueError, TypeError):

        texto = str(valor).strip()

        if not texto:
            return None

        return texto.zfill(4)


def normalizar_fecha(valor):

    if valor is None:
        return None

    texto = str(valor).strip()

    if len(texto) >= 10:
        return texto[:10]

    return texto


# ============================================================
# COORDENADAS DMS -> DECIMAL
# ============================================================

def dms_a_decimal(valor):
    """
    Ejemplos SiAR:

    Latitud:
    391520000N = 39° 15' 20.000"

    Longitud:
    003012000W = 0° 30' 12.000"

    En los formatos observados por SiAR se utilizan
    dos posiciones para grados.
    """

    if valor is None:
        return None

    texto = str(valor).strip().upper()

    if len(texto) < 7:
        return None

    hemisferio = texto[-1]
    numeros = texto[:-1]

    try:

        grados = int(numeros[:2])
        minutos = int(numeros[2:4])

        resto = numeros[4:]

        if resto:
            segundos = float(resto) / 1000.0
        else:
            segundos = 0.0

        decimal = (
            grados
            + minutos / 60.0
            + segundos / 3600.0
        )

        if hemisferio in ("S", "W"):
            decimal *= -1

        return round(decimal, 6)

    except (ValueError, TypeError):

        return None


# ============================================================
# PUNTO DE ROCÍO
# ============================================================

def calcular_punto_rocio(temperatura, humedad):

    temperatura = a_float(temperatura)
    humedad = a_float(humedad)

    if temperatura is None or humedad is None:
        return None

    if humedad <= 0 or humedad > 100:
        return None

    # Fórmula de Magnus
    a = 17.625
    b = 243.04

    gamma = (
        math.log(humedad / 100.0)
        + (
            a * temperatura
            / (b + temperatura)
        )
    )

    punto_rocio = (
        b * gamma
        / (a - gamma)
    )

    return round(
        punto_rocio,
        1
    )


# ============================================================
# DPV / DÉFICIT DE PRESIÓN DE VAPOR
# ============================================================

def calcular_dpv(temperatura, humedad):

    temperatura = a_float(temperatura)
    humedad = a_float(humedad)

    if temperatura is None or humedad is None:
        return None

    if humedad < 0 or humedad > 100:
        return None

    # Presión de vapor de saturación en kPa
    es = (
        0.6108
        * math.exp(
            (17.27 * temperatura)
            / (temperatura + 237.3)
        )
    )

    ea = es * humedad / 100.0

    dpv = es - ea

    return round(
        dpv,
        2
    )


# ============================================================
# FECHA/HORA
# ============================================================

def clave_temporal(registro):

    fecha = normalizar_fecha(
        registro.get("Fecha")
    ) or ""

    hora = normalizar_hora(
        registro.get("HorMin")
    ) or "0000"

    return fecha, hora


def generar_fecha_hora_iso(fecha, hora):

    fecha = normalizar_fecha(fecha)
    hora = normalizar_hora(hora)

    if not fecha or not hora:
        return None

    try:

        fecha_hora = datetime.strptime(
            f"{fecha} {hora}",
            "%Y-%m-%d %H%M"
        )

        fecha_hora = fecha_hora.replace(
            tzinfo=ZONA_HORARIA
        )

        return fecha_hora.isoformat()

    except ValueError:

        return None


# ============================================================
# ESTACIONES SIAR DE VALENCIA
# ============================================================

def obtener_estaciones_valencia():

    print(
        "Descargando información de estaciones SiAR..."
    )

    respuesta = consultar_info(
        "ESTACIONES"
    )

    estaciones = {}

    for estacion in respuesta.get(
        "datos",
        []
    ):

        codigo = str(
            estacion.get(
                "Codigo",
                ""
            )
        ).strip().upper()

        if not codigo:
            continue

        # Estaciones valencianas:
        # V02, V04, V19, V101...
        if not codigo.startswith("V"):
            continue

        # Excluir estaciones dadas de baja
        if estacion.get("Fecha_Baja"):
            continue

        estaciones[codigo] = estacion

    print(
        f"Estaciones activas identificadas: "
        f"{len(estaciones)}"
    )

    return estaciones


# ============================================================
# ÚLTIMA OBSERVACIÓN DE CADA ESTACIÓN
# ============================================================

def obtener_ultimos_registros(registros):

    ultimos = {}

    for registro in registros:

        codigo = str(
            registro.get(
                "Estacion",
                ""
            )
        ).strip().upper()

        if not codigo:
            continue

        if not codigo.startswith("V"):
            continue

        if codigo not in ultimos:

            ultimos[codigo] = registro

            continue

        if (
            clave_temporal(registro)
            >
            clave_temporal(
                ultimos[codigo]
            )
        ):

            ultimos[codigo] = registro

    return ultimos


# ============================================================
# PROGRAMA PRINCIPAL
# ============================================================

def main():

    ahora = datetime.now(
        ZONA_HORARIA
    )

    hoy = ahora.strftime(
        "%Y-%m-%d"
    )

    print()
    print(
        "==============================================="
    )
    print(
        " ACTUALIZACIÓN OBSERVACIONES SIAR - METVLC"
    )
    print(
        "==============================================="
    )
    print()

    # --------------------------------------------------------
    # 1. METADATOS DE ESTACIONES
    # --------------------------------------------------------

    estaciones = (
        obtener_estaciones_valencia()
    )

    print()

    # --------------------------------------------------------
    # 2. OBSERVACIONES DE HOY
    # --------------------------------------------------------

    print(
        f"Descargando observaciones SiAR para {hoy}..."
    )

    respuesta = consultar_horarios_valencia(
        hoy
    )

    registros = respuesta.get(
        "datos",
        []
    )

    print(
        f"Registros recibidos: "
        f"{len(registros)}"
    )

    fecha_consultada = hoy

    # --------------------------------------------------------
    # Si todavía no hay datos de hoy, usamos ayer.
    # Esto puede ocurrir de madrugada.
    # --------------------------------------------------------

    if not registros:

        ayer = (
            ahora
            - timedelta(days=1)
        ).strftime("%Y-%m-%d")

        print()
        print(
            "No hay registros disponibles de hoy."
        )

        print(
            f"Consultando día anterior: {ayer}"
        )

        respuesta = (
            consultar_horarios_valencia(
                ayer
            )
        )

        registros = respuesta.get(
            "datos",
            []
        )

        fecha_consultada = ayer

        print(
            f"Registros recibidos: "
            f"{len(registros)}"
        )

    if not registros:

        raise RuntimeError(
            "SiAR no ha devuelto ningún registro horario."
        )

    # --------------------------------------------------------
    # 3. SELECCIONAR ÚLTIMA OBSERVACIÓN
    # --------------------------------------------------------

    ultimos = obtener_ultimos_registros(
        registros
    )

    print(
        f"Estaciones con observación: "
        f"{len(ultimos)}"
    )

    print()

    # --------------------------------------------------------
    # 4. PREPARAR JSON
    # --------------------------------------------------------

    resultado = []

    for codigo, observacion in ultimos.items():

        metadata = estaciones.get(
            codigo,
            {}
        )

        temperatura = a_float(
            observacion.get(
                "TempMedia"
            )
        )

        humedad = a_float(
            observacion.get(
                "HumedadMedia"
            )
        )

        viento = a_float(
            observacion.get(
                "VelViento"
            )
        )

        direccion_viento = a_float(
            observacion.get(
                "DirViento"
            )
        )

        precipitacion = a_float(
            observacion.get(
                "Precipitacion"
            )
        )

        radiacion = a_float(
            observacion.get(
                "Radiacion"
            )
        )

        temperatura_suelo_1 = a_float(
            observacion.get(
                "TempSuelo1"
            )
        )

        temperatura_suelo_2 = a_float(
            observacion.get(
                "TempSuelo2"
            )
        )

        fecha = normalizar_fecha(
            observacion.get(
                "Fecha"
            )
        )

        hora = normalizar_hora(
            observacion.get(
                "HorMin"
            )
        )

        estacion_json = {

            "red": "SIAR",

            "fuente": (
                "SiAR - Ministerio de Agricultura, "
                "Pesca y Alimentación"
            ),

            "codigo": codigo,

            "nombre": metadata.get(
                "Estacion"
            ),

            "municipio": metadata.get(
                "Termino"
            ),

            "latitud": dms_a_decimal(
                metadata.get(
                    "Latitud"
                )
            ),

            "longitud": dms_a_decimal(
                metadata.get(
                    "Longitud"
                )
            ),

            "altitud": metadata.get(
                "Altitud"
            ),

            "fecha": fecha,

            "hora": hora,

            "fecha_hora": (
                generar_fecha_hora_iso(
                    fecha,
                    hora
                )
            ),

            "temperatura": temperatura,

            "humedad": humedad,

            "punto_rocio": (
                calcular_punto_rocio(
                    temperatura,
                    humedad
                )
            ),

            "dpv": (
                calcular_dpv(
                    temperatura,
                    humedad
                )
            ),

            "viento": viento,

            "direccion_viento": (
                direccion_viento
            ),

            "precipitacion": (
                precipitacion
            ),

            "radiacion": (
                radiacion
            ),

            "temperatura_suelo_1": (
                temperatura_suelo_1
            ),

            "temperatura_suelo_2": (
                temperatura_suelo_2
            )
        }

        resultado.append(
            estacion_json
        )

    resultado.sort(
        key=lambda estacion: (
            estacion.get(
                "codigo"
            ) or ""
        )
    )

    # --------------------------------------------------------
    # 5. JSON FINAL
    # --------------------------------------------------------

    salida = {

        "fuente": (
            "SiAR - MAPA"
        ),

        "red": "SIAR",

        "tipo": (
            "observaciones_horarias"
        ),

        "provincia": (
            PROVINCIA_NOMBRE
        ),

        "codigo_provincia": (
            PROVINCIA_CODIGO
        ),

        "fecha_consultada": (
            fecha_consultada
        ),

        "actualizado": (
            ahora.isoformat()
        ),

        "numero_estaciones": (
            len(resultado)
        ),

        "estaciones": (
            resultado
        )
    }

    # --------------------------------------------------------
    # 6. GUARDAR ARCHIVO
    # --------------------------------------------------------

    ARCHIVO_SALIDA.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        ARCHIVO_SALIDA,
        "w",
        encoding="utf-8"
    ) as archivo:

        json.dump(
            salida,
            archivo,
            ensure_ascii=False,
            indent=2
        )

    # --------------------------------------------------------
    # 7. RESUMEN EN LOG
    # --------------------------------------------------------

    print(
        "==============================================="
    )
    print(
        " OBSERVACIONES SIAR ACTUALIZADAS CORRECTAMENTE"
    )
    print(
        "==============================================="
    )

    print()

    print(
        f"Archivo generado: "
        f"{ARCHIVO_SALIDA}"
    )

    print(
        f"Estaciones disponibles: "
        f"{len(resultado)}"
    )

    print()

    print(
        "Última observación de cada estación:"
    )

    print()

    for estacion in resultado:

        print(
            f'{estacion["codigo"]} | '
            f'{estacion["nombre"]} | '
            f'{estacion["hora"]} | '
            f'T={estacion["temperatura"]} °C | '
            f'HR={estacion["humedad"]} % | '
            f'Td={estacion["punto_rocio"]} °C | '
            f'DPV={estacion["dpv"]} kPa | '
            f'Viento={estacion["viento"]}'
        )

    print()
    print(
        "Proceso finalizado correctamente."
    )


# ============================================================
# EJECUCIÓN
# ============================================================

if __name__ == "__main__":
    main()
