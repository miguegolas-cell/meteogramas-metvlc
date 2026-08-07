# Meteogramas MetVlc · v6.6.0

Cambios principales:

- CAPE, CIN y LI se calculan siempre a partir del perfil AROME France 2,5 km, independientemente del modelo principal.
- El horizonte de esos índices queda limitado a la disponibilidad de AROME (aprox. 51 h); no se rellenan después con otro modelo.
- Se elimina el gráfico simple de perfil T/Td; se mantienen Skew-T, hodógrafa y tabla por niveles.
- El bloque de resumen pasa a llamarse “Pronóstico principales variables meteorológicas para hoy”.
- Nueva jerarquía cromática para separar mapa, resumen, observaciones, meteogramas, perfil y tablas.
- Se mantienen temperatura a 850 hPa desde GFS, observaciones AEMET y selector de Skew-T GFS/AROME según el modelo principal.

Sube a GitHub Pages: `index.html`, `app-v66.js`, `estilos-v66.css`, `README.md`, `datos/`, `scripts/` y `.github/`.
