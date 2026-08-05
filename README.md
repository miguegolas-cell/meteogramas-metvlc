# Meteogramas MetVlc v6.3

Visor meteorológico para la provincia de Valencia con selección de modelos, meteogramas operativos, Skew‑T previsto por GFS, diagnóstico de mezcla descendente y observaciones actuales de estaciones AEMET.

## Archivos principales

- `index.html`
- `estilos-v63.css`
- `app-v63.js`
- `datos/observaciones_aemet.json`
- `scripts/actualizar_observaciones_aemet.py`
- `.github/workflows/actualizar-observaciones-aemet.yml`

## Novedades v6.3

- Temperatura de disparo calculada desde el CCL.
- Línea de razón de mezcla superficial hasta el CCL.
- Adiabática seca trazada desde la temperatura de disparo.
- Línea de mezcla seca necesaria para alcanzar el techo de la PBL.
- Diagnóstico experimental de potencial de mezcla descendente.
- Sección con las tres estaciones AEMET más próximas.
- Advertencia por distancia y diferencia de altitud.
- Estimación de modelo claramente etiquetada cuando no hay observación representativa.

## Activar las observaciones AEMET

1. Solicita una API key gratuita en AEMET OpenData.
2. En GitHub entra en `Settings → Secrets and variables → Actions`.
3. Crea el secreto:

```text
AEMET_API_KEY
```

4. Entra en `Actions → Actualizar observaciones AEMET → Run workflow`.
5. El workflow generará `datos/observaciones_aemet.json` y lo actualizará cada 15 minutos.

La clave nunca se publica en `app-v63.js` ni en GitHub Pages.

## Criterio de proximidad

- Hasta 40 km: estación cercana.
- Entre 40 y 80 km: estación distante; interpretar con cautela.
- Más de 80 km: no se considera representativa y se muestra una estimación de modelo como referencia no observada.

La distancia no basta: el visor también muestra la diferencia de altitud. Una estación costera no representa necesariamente un punto de montaña aunque esté relativamente próxima.

## Potencial de mezcla descendente

El indicador combina:

- altura de la PBL;
- temperatura prevista y temperatura necesaria para mezclar hasta su techo;
- máximo viento disponible dentro de la PBL;
- diferencia respecto al viento superficial;
- humedad y depresión del punto de rocío cerca del techo;
- presencia de inversión baja.

Es un diagnóstico experimental y no una predicción exacta de rachas.

## Publicación

Sube la estructura completa a la raíz del repositorio y activa GitHub Pages desde la rama `main`, carpeta `/root`.
