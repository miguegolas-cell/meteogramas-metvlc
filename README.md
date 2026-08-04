# Meteogramas MetVlc v4.1

Versión corregida para evitar la caché del navegador. Los archivos de estilo y JavaScript cambian de nombre:

- `estilos-v4.css`
- `app-v4.js`

## Instalación

Sustituye **todos** los archivos de la carpeta anterior por los cuatro archivos de esta versión. No mezcles archivos de versiones anteriores.

Después ejecuta `python -m http.server 8000` y abre `http://localhost:8000`.

## Variables avanzadas

- NOAA GFS: CAPE, LI, CIN, PBL y temperatura a 850 hPa.
- ECMWF IFS: CAPE, CIN, PBL y temperatura a 850 hPa; no proporciona LI.
- ICON: CAPE y temperatura a 850 hPa.
- Météo-France: CAPE y temperatura a 850 hPa.
- Mejor ajuste: la disponibilidad depende del modelo elegido automáticamente por Open-Meteo.

La helicidad/SRH no está disponible directamente en Open-Meteo y queda marcada como pendiente de otra fuente.
