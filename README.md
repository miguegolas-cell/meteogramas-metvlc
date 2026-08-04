# Meteogramas MetVlc — versión 3

Visor meteorológico para seleccionar un punto de la provincia de Valencia y consultar predicción horaria mediante Open-Meteo.

## Organización de los gráficos

Todos los gráficos se muestran en una única columna:

1. Temperatura a 2 m, temperatura a 850 hPa, punto de rocío y humedad relativa.
2. Viento a 10 m, rachas y dirección.
3. Precipitación horaria y probabilidad, cuando está disponible.
4. Déficit de presión de vapor (DPV).
5. Inestabilidad y capa límite:
   - CAPE.
   - Lifted Index (LI).
   - Inhibición convectiva (CIN).
   - Helicidad / SRH, reservada para una fuente futura.
   - Altura de la capa límite planetaria (PBL).

La radiación solar y la nubosidad se han retirado de esta versión.

## Disponibilidad según el modelo

Las variables de superficie y CAPE se solicitan en la consulta principal. La temperatura a 850 hPa, LI, CIN y PBL se consultan de forma separada para que una variable ausente no bloquee todo el meteograma.

- **Mejor ajuste Open-Meteo:** intenta obtener temperatura a 850 hPa, LI, CIN y PBL.
- **ECMWF IFS:** CAPE, CIN y PBL; se intenta obtener temperatura a 850 hPa cuando la salida seleccionada la permite. LI no está disponible.
- **DWD ICON:** CAPE y temperatura a 850 hPa. LI, CIN y PBL no se solicitan.
- **NOAA GFS:** CAPE, temperatura a 850 hPa, LI, CIN y PBL.
- **Météo-France AROME/ARPEGE:** CAPE y temperatura a 850 hPa. LI, CIN y PBL no se solicitan.

Cuando una variable no está disponible, la tarjeta correspondiente muestra un aviso en lugar de dejar un gráfico vacío.

## Sobre la helicidad

Open-Meteo no ofrece helicidad relativa a la tormenta como variable directa. Para calcular SRH correctamente se necesita el perfil vertical del viento y una estimación del movimiento de la tormenta. La tarjeta queda reservada hasta integrar una fuente adecuada o un cálculo específico y documentado.

## Indicadores calculados

- Humedad relativa mínima.
- DPV máximo.
- Racha máxima.
- Precipitación acumulada.
- CAPE máximo y clasificación.
- Recuperación nocturna de humedad.
- Resumen de las condiciones en la hora de mayor DPV.

## Probar en el ordenador

Desde la carpeta del proyecto ejecuta:

```bash
python -m http.server 8000
```

Después abre:

```text
http://localhost:8000
```

Tras sustituir una versión anterior, pulsa `Ctrl + F5` para vaciar la caché del navegador.

## Publicar en GitHub Pages

1. Sube `index.html`, `estilos.css`, `app.js` y `README.md` a la raíz del repositorio.
2. En **Settings → Pages**, selecciona la rama principal y la carpeta raíz.
3. Espera a que GitHub publique la nueva versión.

## Fuentes

- Predicción meteorológica y geocodificación: Open-Meteo.
- Mapas base: OpenStreetMap y OpenTopoMap.
- Límite provincial: servicio ArcGIS público de entidades territoriales.
