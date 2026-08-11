import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


# ============================================================
# CONFIGURACIÓN
# ============================================================

BASE_URL = "https://servicio.mapa.gob.es/siarapi"

TOKEN = os.environ.get("SIAR_TOKEN")

if not TOKEN:
    raise RuntimeError(
        "No se ha encontrado SIAR_TOKEN."
    )

ZONA_HORARIA = ZoneInfo("Europe/Madrid")

ARCHIVO_SALIDA = Path(
    "datos/observaciones_siar.json"
)

PROVINCIA = "Valencia/València"


# ============================================================
# ESTACIONES SIAR QUE QUEREMOS UTILIZAR
# ============================================================

CODIGOS_VALENCIA = [

    "V02",
    "V04",
    "V05",
    "V06",
    "V07",
    "V10",
    "V14",
    "V17",
    "V18",
    "V19",
    "V20",
    "V21",
    "V22",
    "V23",
    "V25",
    "V26",
    "V27",
    "V28",
    "V29",
    "V30",

    "V101",
    "V102",
    "V103",
    "V104",
    "V106",
    "V109",
    "V110"
]


# ============================================================
# PETICIÓN HTTP
# ============================================================

def descargar_json(url):

    solicitud = urllib.request.Request(
        url,
        headers={
            "User-Agent":
                "Mozilla/5.0 Meteogramas-MetVlc/1.0",

            "Accept":
                "application/json"
        }
    )

    try:

        with urllib.request.urlopen(
            solicitud,
            timeout=90
        ) as respuesta:

            raw = respuesta.read()

    except urllib.error.HTTPError as error:

        cuerpo = error.read().decode(
            "utf-8",
            errors="replace"
        )

        cuerpo = cuerpo.replace(
            TOKEN,
            "***TOKEN_OCULTO***"
        )

        raise RuntimeError(
            f"Error HTTP SiAR {error.code}: "
            f"{cuerpo[:1500]}"
        )

    except urllib.error.URLError as error:

        raise RuntimeError(
            f"Error de conexión SiAR: {error}"
        )

    for codificacion in (

        "utf-8-sig",
        "utf-8",
        "cp1252",
        "latin-1"

    ):

        try:

            return json.loads(
                raw.decode(codificacion)
            )

        except (
            UnicodeDecodeError,
            json.JSONDecodeError
        ):

            continue

    raise RuntimeError(
        "No se pudo interpretar la respuesta de SiAR."
    )


# ============================================================
# METADATOS DE ESTACIONES
# ============================================================

def obtener_metadata_estaciones():

    parametros = urllib.parse.urlencode({
        "token": TOKEN
    })

    url = (
        f"{BASE_URL}/API/V1/Info/"
        f"ESTACIONES?{parametros}"
    )

    respuesta = descargar_json(url)

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

        if codigo in CODIGOS_VALENCIA:

            estaciones[codigo] = estacion

    return estaciones


# ============================================================
# CONSULTAR UN GRUPO DE ESTACIONES
# ============================================================

def consultar_estaciones(
    codigos,
    fecha
):

    parametros = []

    parametros.append(
        ("token", TOKEN)
    )

    for codigo in codigos:

        parametros.append(
            ("Id", codigo)
        )

    parametros.append(
        ("FechaInicial", fecha)
    )

    parametros.append(
        ("FechaFinal", fecha)
    )

    query = urllib.parse.urlencode(
        parametros
    )

    url = (
        f"{BASE_URL}/API/V1/Datos/"
        f"Horarios/ESTACION?"
        f"{query}"
    )

    return descargar_json(url)


# ============================================================
# DESCARGA CONTROLADA
# ============================================================

def descargar_observaciones(fecha):

    todos = []

    # Agrupamos de dos en dos.
    #
    # Una estación SiAR suele producir hasta
    # aproximadamente 48 registros diarios.
    #
    # 2 estaciones ≈ máximo 96 registros.
    #
    # De esta forma permanecemos por debajo
    # del límite de 100 registros/minuto.

    grupos = [

        CODIGOS_VALENCIA[i:i + 2]

        for i in range(
            0,
            len(CODIGOS_VALENCIA),
            2
        )
    ]

    total_grupos = len(grupos)

    print(
        f"Estaciones a consultar: "
        f"{len(CODIGOS_VALENCIA)}"
    )

    print(
        f"Grupos de descarga: "
        f"{total_grupos}"
    )

    print()

    for numero, grupo in enumerate(
        grupos,
        start=1
    ):

        print(
            f"[{numero}/{total_grupos}] "
            f"Consultando "
            f"{', '.join(grupo)}..."
        )

        intentos = 0

        while True:

            intentos += 1

            try:

                respuesta = consultar_estaciones(
                    grupo,
                    fecha
                )

                registros = respuesta.get(
                    "datos",
                    []
                )

                print(
                    f"  Registros recibidos: "
                    f"{len(registros)}"
                )

                todos.extend(
                    registros
                )

                break

            except RuntimeError as error:

                texto = str(error)

                # Si todavía quedan registros
                # acumulados del minuto anterior,
                # esperamos y repetimos.

                if (
                    "número máximo de datos"
                    in texto
                    or
                    "numero máximo de datos"
                    in texto
                    or
                    "máximo de datos"
                    in texto
                ):

                    if intentos <= 2:

                        print(
                            "  Límite por minuto alcanzado."
                        )

                        print(
                            "  Esperando 65 segundos..."
                        )

                        time.sleep(65)

                        continue

                raise

        # ----------------------------------------------------
        # PAUSA OBLIGATORIA
        # ----------------------------------------------------

        if numero < total_grupos:

            print(
                "  Esperando 65 segundos "
                "para respetar el límite SiAR..."
            )

            time.sleep(65)

    return todos


# ============================================================
# CONVERSIONES NUMÉRICAS
# ============================================================

def a_float(valor):

    if valor is None:
        return None

    try:

        if isinstance(
            valor,
            str
        ):

            valor = (
                valor.strip()
                .replace(",", ".")
            )

            if not valor:
                return None

        return float(valor)

    except (
        ValueError,
        TypeError
    ):

        return None


# ============================================================
# HORA
# ============================================================

def normalizar_hora(valor):

    if valor is None:
        return None

    try:

        numero = int(
            float(valor)
        )

        return str(
            numero
        ).zfill(4)

    except Exception:

        return None


# ============================================================
# FECHA
# ============================================================

def normalizar_fecha(valor):

    if valor is None:
        return None

    texto = str(valor)

    if len(texto) >= 10:
        return texto[:10]

    return texto


# ============================================================
# CLAVE TEMPORAL
# ============================================================

def clave_temporal(registro):

    fecha = (
        normalizar_fecha(
            registro.get("Fecha")
        )
        or ""
    )

    hora = (
        normalizar_hora(
            registro.get("HorMin")
        )
        or "0000"
    )

    return (
        fecha,
        hora
    )


# ============================================================
# COORDENADAS DMS -> DECIMAL
# ============================================================

def dms_a_decimal(valor):

    if not valor:
        return None

    texto = (
        str(valor)
        .strip()
        .upper()
    )

    hemisferio = texto[-1]

    numeros = texto[:-1]

    try:

        grados = int(
            numeros[:2]
        )

        minutos = int(
            numeros[2:4]
        )

        segundos = float(
            numeros[4:]
        ) / 1000.0

        decimal = (

            grados
            + minutos / 60
            + segundos / 3600
        )

        if hemisferio in (
            "S",
            "W"
        ):

            decimal *= -1

        return round(
            decimal,
            6
        )

    except Exception:

        return None


# ============================================================
# PUNTO DE ROCÍO
# ============================================================

def calcular_punto_rocio(
    temperatura,
    humedad
):

    temperatura = a_float(
        temperatura
    )

    humedad = a_float(
        humedad
    )

    if (
        temperatura is None
        or
        humedad is None
        or
        humedad <= 0
        or
        humedad > 100
    ):

        return None

    a = 17.625
    b = 243.04

    gamma = (

        math.log(
            humedad / 100
        )

        +

        (
            a * temperatura
            /
            (
                b
                + temperatura
            )
        )
    )

    td = (

        b * gamma
        /
        (
            a
            - gamma
        )
    )

    return round(
        td,
        1
    )


# ============================================================
# DPV
# ============================================================

def calcular_dpv(
    temperatura,
    humedad
):

    temperatura = a_float(
        temperatura
    )

    humedad = a_float(
        humedad
    )

    if (
        temperatura is None
        or
        humedad is None
    ):

        return None

    if not (
        0 <= humedad <= 100
    ):

        return None

    es = (

        0.6108

        *

        math.exp(

            (
                17.27
                * temperatura
            )

            /

            (
                temperatura
                + 237.3
            )
        )
    )

    ea = (
        es
        * humedad
        / 100
    )

    return round(
        es - ea,
        2
    )


# ============================================================
# ÚLTIMA OBSERVACIÓN
# ============================================================

def obtener_ultimas(
    registros
):

    ultimos = {}

    for registro in registros:

        codigo = str(
            registro.get(
                "Estacion",
                ""
            )
        ).strip().upper()

        if codigo not in CODIGOS_VALENCIA:
            continue

        if codigo not in ultimos:

            ultimos[
                codigo
            ] = registro

            continue

        if (
            clave_temporal(
                registro
            )
            >
            clave_temporal(
                ultimos[codigo]
            )
        ):

            ultimos[
                codigo
            ] = registro

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
        "=============================================="
    )

    print(
        " ACTUALIZACIÓN OBSERVACIONES SIAR - METVLC"
    )

    print(
        "=============================================="
    )

    print()

    # --------------------------------------------------------
    # METADATOS
    # --------------------------------------------------------

    print(
        "Descargando metadatos "
        "de estaciones..."
    )

    metadata = (
        obtener_metadata_estaciones()
    )

    print(
        f"Estaciones valencianas "
        f"identificadas: "
        f"{len(metadata)}"
    )

    print()

    # --------------------------------------------------------
    # OBSERVACIONES
    # --------------------------------------------------------

    print(
        f"Descargando datos "
        f"del {hoy}..."
    )

    print()

    registros = (
        descargar_observaciones(
            hoy
        )
    )

    print()

    print(
        f"Total registros descargados: "
        f"{len(registros)}"
    )

    # --------------------------------------------------------
    # ÚLTIMO REGISTRO
    # --------------------------------------------------------

    ultimos = (
        obtener_ultimas(
            registros
        )
    )

    print(
        f"Estaciones con datos: "
        f"{len(ultimos)}"
    )

    # --------------------------------------------------------
    # CREAR RESULTADO
    # --------------------------------------------------------

    resultado = []

    for codigo in CODIGOS_VALENCIA:

        if codigo not in ultimos:
            continue

        observacion = (
            ultimos[codigo]
        )

        meta = metadata.get(
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

        estacion = {

            "red":
                "SIAR",

            "codigo":
                codigo,

            "nombre":
                meta.get(
                    "Estacion"
                ),

            "municipio":
                meta.get(
                    "Termino"
                ),

            "latitud":
                dms_a_decimal(
                    meta.get(
                        "Latitud"
                    )
                ),

            "longitud":
                dms_a_decimal(
                    meta.get(
                        "Longitud"
                    )
                ),

            "altitud":
                meta.get(
                    "Altitud"
                ),

            "fecha":
                fecha,

            "hora":
                hora,

            "temperatura":
                temperatura,

            "humedad":
                humedad,

            "punto_rocio":
                calcular_punto_rocio(
                    temperatura,
                    humedad
                ),

            "dpv":
                calcular_dpv(
                    temperatura,
                    humedad
                ),

            "viento":
                a_float(
                    observacion.get(
                        "VelViento"
                    )
                ),

            "direccion_viento":
                a_float(
                    observacion.get(
                        "DirViento"
                    )
                ),

            "precipitacion":
                a_float(
                    observacion.get(
                        "Precipitacion"
                    )
                ),

            "radiacion":
                a_float(
                    observacion.get(
                        "Radiacion"
                    )
                )
        }

        resultado.append(
            estacion
        )

    # --------------------------------------------------------
    # JSON
    # --------------------------------------------------------

    salida = {

        "fuente":
            "SiAR - MAPA",

        "red":
            "SIAR",

        "provincia":
            PROVINCIA,

        "tipo":
            "observaciones_horarias",

        "actualizado":
            ahora.isoformat(),

        "numero_estaciones":
            len(resultado),

        "estaciones":
            resultado
    }

    # --------------------------------------------------------
    # GUARDAR
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
    # RESUMEN
    # --------------------------------------------------------

    print()
    print(
        "=============================================="
    )

    print(
        " SIAR ACTUALIZADO CORRECTAMENTE"
    )

    print(
        "=============================================="
    )

    print()

    print(
        f"Archivo: "
        f"{ARCHIVO_SALIDA}"
    )

    print(
        f"Estaciones disponibles: "
        f"{len(resultado)}"
    )

    print()

    for estacion in resultado:

        print(

            f'{estacion["codigo"]} | '
            f'{estacion["nombre"]} | '
            f'{estacion["hora"]} | '
            f'T={estacion["temperatura"]} °C | '
            f'HR={estacion["humedad"]}% | '
            f'DPV={estacion["dpv"]} kPa'

        )

    print()

    print(
        "Proceso finalizado correctamente."
    )


# ============================================================
# EJECUTAR
# ============================================================

if __name__ == "__main__":

    main()
