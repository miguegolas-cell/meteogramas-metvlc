# Meteogramas MetVlc · v6.8.3

Cambios principales:
- CAPE se representa como gráfica de línea en lugar de barras.
- Se mantienen las bandas operativas de fondo de CAPE.
- CIN continúa representándose con su signo físico/termodinámico: 0 J/kg indica ausencia de inhibición y los valores negativos indican inhibición creciente.
- Se refuerza visualmente la línea de 0 J/kg del eje Y de CIN y se garantiza que el 0 aparezca entre las marcas del eje.
- El título del eje CIN explica directamente `0 = sin inhibición`.
- Se mantiene la corrección v6.8.1 que recorta los ejes X de CAPE, CIN y LI al intervalo real con datos AROME.
- Se mantienen AEMET + SiAR, selector de modelos sin ICON y el resto de funciones de v6.8.1.

Sube a GitHub Pages: `index.html`, `app-v683.js`, `estilos-v683.css`, `README.md`.
Mantén tus carpetas `datos/`, `scripts/` y `.github/` actuales.


## v6.8.3
- CAPE en modo comparación: CAPE nativo AROME 2,5 km frente a SBCAPE calculado por MetVlc.
- El CAPE nativo se conserva directamente desde la respuesta AROME; el SBCAPE sigue usando la parcela superficial del perfil termodinámico.
- El tooltip muestra la diferencia absoluta y porcentual cuando ambas series están disponibles.
- CIN y LI no cambian.
