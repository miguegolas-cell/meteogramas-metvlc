# Meteogramas MetVlc · v6.8.4

Cambios principales:
- El gráfico 5.1 CAPE usa exclusivamente el CAPE nativo de AROME France 2,5 km.
- Se elimina del meteograma la línea comparativa de SBCAPE calculado por MetVlc.
- El SBCAPE calculado se conserva dentro del Skew-T como diagnóstico de la parcela superficial.
- CIN y Lifted Index continúan calculándose a partir del perfil AROME.
- El resumen diario de CAPE máximo utiliza ahora también el CAPE nativo AROME.
- El eje X de CAPE, CIN y LI continúa limitado al intervalo real con datos AROME.
- En el Skew-T, las marcas del eje vertical muestran simultáneamente presión y altura aproximada sobre el terreno: `hPa` + `m AGL`.
- Las líneas diagnósticas LCL/NCL, LFC/NCA, EL/NE, CCL/NCC, nivel de 0 °C y PBL muestran también `hPa` + `m AGL` cuando la altura está disponible.
- Las tarjetas de niveles termodinámicos mantienen ambas unidades.
- Se mantienen AEMET + SiAR, el selector de modelos sin ICON y el resto de funciones de v6.8.3.

Sube a GitHub Pages: `index.html`, `app-v684.js`, `estilos-v684.css`, `README.md`.
Mantén tus carpetas `datos/`, `scripts/` y `.github/` actuales.
