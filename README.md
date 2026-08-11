# Meteogramas MetVlc · v6.8.1

Cambios principales:
- Se elimina ICON del selector de modelos.
- Nombres de modelos más cortos y resolución visible en el desplegable: Auto (variable), ECMWF 9 km, GFS 13 km y AROME/ARPEGE 2,5–11 km.
- CAPE, CIN y LI continúan calculándose siempre con AROME France 2,5 km.
- CIN pasa a tener una gráfica independiente.
- CAPE, CIN y LI recortan su eje X al intervalo real con datos AROME, evitando prolongar el gráfico durante días sin valores.
- CAPE, CIN y LI mantienen las bandas cualitativas de fondo y los ejes Y numéricos.
- PBL pasa a numerarse como 5.4.
- Se mantienen las observaciones combinadas AEMET + SiAR de la v6.7.

Sube a GitHub Pages: `index.html`, `app-v681.js`, `estilos-v681.css`, `README.md`.
Mantén tus carpetas `datos/`, `scripts/` y `.github/` actuales.


## Corrección v6.8.1

Se corrige el recorte temporal de CAPE, CIN y LI: los valores `null` posteriores al horizonte AROME ya no se interpretan como cero. El eje X termina en la última hora con un dato AROME real.
