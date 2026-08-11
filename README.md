# Meteogramas MetVlc · v6.7.0

Cambios principales:
- Observaciones combinadas de AEMET + SiAR.
- La web carga `datos/observaciones_aemet.json` y `datos/observaciones_siar.json` de forma independiente; si una red falla, utiliza la otra.
- Las estaciones se ordenan por una puntuación de representatividad basada principalmente en distancia y con penalización moderada por diferencia de altitud.
- Identificación visual de la red AEMET/SiAR en la tabla.
- `VelViento` de SiAR se interpreta en m/s y se convierte a km/h al mostrarlo.
- SiAR no aporta racha en el registro medio horario usado por el visor, por lo que esa celda aparece como `—`.

Sube a GitHub Pages: `index.html`, `app-v67.js`, `estilos-v67.css`, `README.md`.
Mantén tus carpetas `datos/`, `scripts/` y `.github/` actuales.
