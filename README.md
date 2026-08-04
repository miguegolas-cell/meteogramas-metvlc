# Meteogramas MetVlc — primera versión

Visor meteorológico para seleccionar un punto de la provincia de Valencia y consultar una predicción horaria mediante Open-Meteo.

## Variables incluidas

- Temperatura a 2 m
- Punto de rocío
- Humedad relativa
- Déficit de presión de vapor (DPV)
- Viento medio, rachas y dirección a 10 m
- Precipitación horaria y probabilidad
- Nubosidad baja, media y alta
- Radiación solar
- CAPE
- Presión en superficie (consultada, preparada para futuras vistas)

## Indicadores calculados

- Humedad relativa mínima
- DPV máximo
- Racha máxima
- Precipitación acumulada
- CAPE máximo y clasificación
- Recuperación nocturna de humedad
- Resumen de las condiciones en la hora de mayor DPV

## Probar en el ordenador

No abras `index.html` directamente con doble clic porque algunos navegadores bloquean las consultas desde archivos locales.

Desde la carpeta del proyecto ejecuta:

```bash
python -m http.server 8000
```

Después abre:

```text
http://localhost:8000
```

## Publicar en GitHub Pages

1. Crea un repositorio nuevo.
2. Sube `index.html`, `estilos.css`, `app.js` y este README.
3. En **Settings → Pages**, selecciona la rama principal y la carpeta raíz.
4. GitHub mostrará la dirección pública del visor.

## Fuentes

- Predicción meteorológica y geocodificación: Open-Meteo.
- Mapas base: OpenStreetMap y OpenTopoMap.
- Límite provincial: servicio ArcGIS público de entidades territoriales.

## Próximas fases sugeridas

- Comparación ECMWF / ICON / GFS / ARPEGE.
- Pestaña específica de incendios forestales.
- Observaciones AEMET y AVAMET.
- Descarga de gráficos en PNG y CSV.
- Detección de giros de viento y entrada de brisa.
- Vista de variables a 850, 700 y 500 hPa.
